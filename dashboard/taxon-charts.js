import { MISSING, text } from './analysis.js';
import { entityCell } from './taxon-analysis.js';

const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const format = value => formatter.format(value);
const exactFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 4 });
const alphabet = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const COLORS = ['#275a46', '#547db1', '#bd684c', '#80619c', '#927424', '#287f85', '#c07698', '#74774d', '#494b90', '#ad4c54', '#6a8135', '#666f73'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const button = (label, action) => `<button type="button" data-action="${action}">${esc(label)}</button>`;
const dot = color => `<i class="chart-swatch" style="--swatch:${color}" aria-hidden="true"></i>`;
const groupLegend = groups => `<ul class="chart-legend" aria-label="Groups">${groups.map(g => `<li>${dot(g.color)}${esc(g.name)}</li>`).join('')}</ul>`;

function numericalScale(peak) {
  if (peak <= 4) return { max: Math.max(1, peak), steps: Math.max(1, Math.ceil(peak)) };
  const power = 10 ** Math.floor(Math.log10(peak / 4));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * power).find(value => value >= peak / 4);
  return { max: 4 * step, steps: 4 };
}

export function verticalChart(rows, groups, { percent = false, label, interactive = false, showLegend = true, zoomPercent = false } = {}) {
  if (!rows.length) return '<p class="muted chart-empty">No values to display for this selection.</p>';
  const peak = Math.max(0, ...rows.flatMap(row => row.values));
  const { max, steps } = percent ? { max: zoomPercent && peak > 0 ? peak : 100, steps: 4 } : numericalScale(peak);
  const display = value => percent ? exactFormatter.format(value) + '%' : exactFormatter.format(value);
  const marks = Array.from({ length: steps + 1 }, (_, i) => `<span>${display(max * (steps - i) / steps)}</span>`);
  return `<div class="vertical-chart" aria-label="${esc(label)}">
    <p class="chart-unit muted">${esc(label)}</p>
    <div class="vertical-plot">
      <div class="vertical-axis" aria-hidden="true">${marks.join('')}</div>
      <div class="vertical-scroll" tabindex="0" aria-label="${esc(label)} categories">
        <div class="vertical-columns" style="--columns:${rows.length};--series:${groups.length};--grid-step:${100 / steps}%">
          ${rows.map((row, i) => `<div class="vertical-category">
            <div class="vertical-tracks">${row.values.map((value, j) => {
              if (value == null) return '<span class="vertical-no-bar" aria-hidden="true"></span>';
              const displayValue = display(value);
              const details = row.details?.[j] ? ` (${row.details[j]})` : '';
              const description = `${row.label} · ${groups[j].name} · ${displayValue}${details}`;
              const style = `--bar-height:${100 * value / max}%;--group:${groups[j].color}`;
              const zero = value === 0 ? ' zero-bar' : '';
              return interactive
                ? `<button type="button" class="vertical-bar${zero}" data-action="bar" data-key="${i}:${j}" style="${style}" aria-label="${esc(description)}" title="${esc(description)}"><span aria-hidden="true">${displayValue}</span></button>`
                : `<span class="vertical-bar${zero}" tabindex="0" style="${style}" aria-label="${esc(description)}" title="${esc(description)}"><span aria-hidden="true">${displayValue}</span></span>`;
            }).join('')}</div>
            <div class="vertical-label" title="${esc(row.label)}">${esc(row.label)}${row.doubtful ? ' *' : ''}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    ${zoomPercent && peak < 100 && peak > 0 ? `<div class="scale-reference"><span>Displayed range 0–${display(peak)}</span><progress max="100" value="${peak}" aria-label="Displayed range on a 0 to 100 percent scale"></progress><span>100%</span></div>` : ''}
    ${showLegend ? groupLegend(groups) : ''}
  </div>`;
}

export function qualitativeTable(reporting, visibleRows, firstColumn) {
  const contexts = reporting.flatMap(entry => entry.contexts.map(context => ({ ...context, group: entry.name })));
  if (!contexts.length) return '';
  const selected = new Set(contexts.flatMap(context => context.selected.map(row => row.taxonLabel)));
  const other = new Set(contexts.flatMap(context => context.unknown.map(row => row.taxonLabel)));
  const columns = [
    ...[...selected].sort(alphabet.compare),
    ...[...other].filter(name => !selected.has(name)).sort(alphabet.compare)
  ];
  const width = 5;
  const visible = columns.slice(firstColumn, firstColumn + width);
  const isCompare = reporting.length > 1;
  return `<section class="entity-section">
    <h3>Qualitative association by context</h3>
    <p class="muted">Cells show the entity field for selected taxa and for associated taxa with an unquantified occurrence.</p>
    <div class="table-scroll entity-scroll" tabindex="0" aria-label="Qualitative association table">
      <table><thead><tr><th scope="col">Context</th>${isCompare ? '<th scope="col">Group</th>' : ''}${visible.map(name => `<th scope="col"> ${/aceae$/i.test(name)?esc(name):`<i>${esc(name)}</i>`}</th>`).join('')}</tr></thead>
      <tbody>${contexts.slice(0, visibleRows).map(({ context, selected, associates, group }) => {
        const index = new Map();
        for (const row of [...selected, ...associates]) {
          if (!index.has(row.taxonLabel)) index.set(row.taxonLabel, []);
          index.get(row.taxonLabel).push(row);
        }
        return `<tr><th scope="row">${esc(context.contextLabel)} <small>${esc(context.siteLabel)} · FID ${esc(context.context_id)}</small></th>${isCompare ? `<td>${esc(group)}</td>` : ''}${visible.map(name => `<td>${esc(entityCell(index.get(name) ?? []))}${index.get(name)?.some(row=>row.doubtful)?' *':''}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table>
    </div>
    <div class="analysis-actions entity-nav"><span class="muted">${format(Math.min(visibleRows, contexts.length))} of ${format(contexts.length)} rows · taxa ${firstColumn + 1}–${firstColumn + visible.length} of ${columns.length}</span>
      ${visibleRows < contexts.length ? button('Show more contexts', 'more-entity') : ''}
      ${firstColumn > 0 ? button('Previous taxa', 'prev-entity') : ''}
      ${firstColumn + width < columns.length ? button('Next taxa', 'next-entity') : ''}
    </div></section>`;
}

function donutMarkup(groups, counts, slices) {
  const outside = 92;
  const inside = 23;
  const pitch = (outside - inside) / groups.length;
  const width = pitch * .83;
  const rings = groups.map((group, index) => {
    const radius = outside - pitch * (index + .5);
    const track = `<circle cx="100" cy="100" r="${radius}" fill="none" stroke="#e0e8df" stroke-width="${width}"/>`;
    let offset = 0;
    const occupied = slices.flatMap(({ key, color }) => {
      const count = counts[index].get(key);
      if (!count) return [];
      const share = 100 * count / group.records.length;
      const sector = `<circle cx="100" cy="100" r="${radius}" pathLength="100" fill="none" stroke="${color}" stroke-width="${width}" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${-offset}"><title>${esc(group.name)} · ${esc(key)} · ${format(share)}%</title></circle>`;
      offset += share;
      return [sector];
    });
    return `<g class="chart-ring" data-group="${esc(group.name)}">${track}${occupied.join('')}</g>`;
  });
  return `<svg class="chart-donuts" viewBox="0 0 200 200" aria-hidden="true" focusable="false"><g transform="rotate(-90 100 100)">${rings.join('')}</g></svg>`;
}

export function compositionChart(groups, field, label) {
  const counts = groups.map(group => {
    const bins = new Map();
    for (const row of group.records) {
      const key = (text(row[field]) || MISSING) + (row.categoryQualifiers?.[field] ? ' *' : '');
      bins.set(key, (bins.get(key) ?? 0) + 1);
    }
    return bins;
  });
  const keys = [...new Set(counts.flatMap(bins => [...bins.keys()]))];
  keys.sort((a, b) => counts.reduce((sum, bins) => sum + (bins.get(b) ?? 0) - (bins.get(a) ?? 0), 0) || alphabet.compare(a, b));
  if (!keys.length) return `<article class="analysis-panel"><h3>${esc(label)}</h3><p class="muted">No selected occurrences.</p></article>`;
  const slices = keys.map((key, i) => ({ key, color: key === MISSING ? '#929c98'
    : COLORS[i] ?? `hsl(${(i * 137.5) % 360} 52% ${i % 2 ? 38 : 61}%)` }));
  const namedRings = groups.length > 1;
  return `<article class="analysis-panel composition-card">
    <h3>${esc(label)}</h3>
    <div class="composition-body">
      <div class="composition-figure">${donutMarkup(groups, counts, slices)}</div>
      <div class="table-scroll composition-legend" tabindex="0" aria-label="${esc(label)} by group">
        <table>
          <thead><tr><th scope="col">${esc(label)}</th>
            ${groups.map((group, i) => `<th scope="col">${namedRings ? `${dot(group.color)}${esc(group.name)}<small>${i === 0 ? 'Outer ring' : i === groups.length - 1 ? 'Inner ring' : `Ring ${i + 1} from outside`}</small>` : 'Share'}</th>`).join('')}
          </tr></thead>
          <tbody>${slices.map(({ key, color }) => `<tr><th scope="row">${dot(color)}${esc(key)}</th>${groups.map((group, i) => {
            const count = counts[i].get(key) ?? 0;
            return group.records.length ? `<td title="${format(count)} occurrences">${format(100 * count / group.records.length)}%</td>` : '<td>—</td>';
          }).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  </article>`;
}
