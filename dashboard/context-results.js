import { MISSING, text } from './analysis.js';

const collator = new Intl.Collator('en', { numeric:true, sensitivity:'base' });
const fmt = new Intl.NumberFormat('en', { maximumFractionDigits:2 });
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labelFor = (row, axis) => axis === 'taxon' ? row.taxonLabel : text(row[axis]) || MISSING;
const marked = rows => rows.some(row => row.doubtful) ? ' <span title="Qualified category">*</span>' : '';
const taxon = value => /aceae$/i.test(value) || value === MISSING ? esc(value) : `<i>${esc(value)}</i>`;

function partition(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(row);
  }
  return result;
}

export function numericQt(row) {
  const value = text(row.qt);
  return /^\d+(?:[.,]\d+)?$/.test(value) && Number.isFinite(Number(value.replace(',', '.')))
    ? Number(value.replace(',', '.')) : null;
}

function groupRows(records, level, siteRows) {
  const sites = partition(records, row => row.siteKey || MISSING);
  if (level === 'site') {
    const labels = new Map(siteRows.map(row=>[row.siteKey,row.siteLabel]));
    for (const [key, rows] of sites) labels.set(key,rows[0].siteLabel);
    return [...labels].map(([key,label])=>({label,rows:sites.get(key)||[]})).sort((a,b)=>collator.compare(a.label,b.label));
  }
  return [...sites.values()].flatMap(site => {
    const siteLabel = site[0].siteLabel;
    // Ancestry is leaf-first. Collapse deeper contexts to their first ancestor below the site.
    const contexts = partition(site, row => {
      if (level === 'subcontext' || level === 'leaf') return row.context_id ?? row.contextLabel;
      const depth = row.siteKey.startsWith('name:') ? 1 : 2;
      return row.ancestry.at(-depth) ?? row.context_id ?? row.contextLabel;
    });
    return [...contexts].flatMap(([id, rows]) => {
      const contextName = rows[0].contextLabel;
      if (level === 'leaf') return [{label:contextName,hint:`${siteLabel} · FID ${id}`,rows}];
      if (level === 'context') return [{ label:rows[0].ancestorNames?.[id] || contextName, hint:siteLabel, rows }];
      return [...partition(rows, row => text(row.context) || contextName)].map(([label, subset]) =>
        ({ label, hint:`${siteLabel} · ${contextName} · FID ${id}`, rows:subset }));
    });
  }).sort((a,b)=>collator.compare(a.label,b.label)||collator.compare(a.hint||'',b.hint||''));
}

function cell(rows) {
  if (!rows.length) return '—';
  const numbers = rows.map(numericQt).filter(value => value !== null);
  const statements = [...new Set(rows.filter(row => numericQt(row) === null).map(row => text(row.entity) || MISSING))];
  return [...(numbers.length ? [fmt.format(numbers.reduce((a,b)=>a+b,0))] : []), ...statements.map(esc)].join(' · ') + marked(rows);
}

function profileTable(records, axis, level, page, siteRows = []) {
  const groups = groupRows(records, level, siteRows);
  if (!groups.length) return '<p class="muted">No occurrence records in this selection.</p>';
  const headings = [...new Set(records.map(row=>labelFor(row,axis)))].sort(collator.compare);
  const start = page * 30;
  const shown = groups.slice(start,start+30);
  return `<div class="table-scroll context-table" tabindex="0"><table><thead><tr><th scope="col">${({site:'Site',context:'Context',subcontext:'Sub-context',leaf:'Context'})[level]}</th>
    ${headings.map(name=>`<th scope="col">${axis==='taxon'?taxon(name):esc(name)}</th>`).join('')}</tr></thead>
    <tbody>${shown.map(group=>{
      const bins = partition(group.rows, row=>labelFor(row,axis));
      return `<tr><th scope="row">${esc(group.label)}${group.hint?`<small>${esc(group.hint)}</small>`:''}</th>${headings.map(name=>`<td>${cell(bins.get(name)||[])}</td>`).join('')}</tr>`;
    }).join('')}</tbody></table></div>
    <div class="analysis-actions context-pages"><span>${start+1}–${start+shown.length} of ${groups.length} rows</span>
      <button type="button" data-context-page="-1" ${start===0?'disabled':''}>Previous</button><button type="button" data-context-page="1" ${start+shown.length===groups.length?'disabled':''}>Next</button></div>`;
}

const colors = ['#285b47','#568a88','#af6045','#726197','#ae8131','#69844c','#3b678b','#a74b72'];
function donut(records, axis) {
  const numeric = records.filter(row => numericQt(row) !== null);
  const total = numeric.reduce((sum,row)=>sum+numericQt(row),0);
  if (!total) return '<p class="muted">No positive numeric quantity to plot.</p>';
  const bins = [...partition(numeric, row => labelFor(row,axis))];
  const rings = [[],[]];
  let offset = 0;
  const legend = [];
  const sector = (radius, count, start, color, label) => {
    const length = 100 * count / total;
    return `<circle cx="100" cy="100" r="${radius}" pathLength="100" fill="none" stroke="${color}" stroke-width="23" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-start}"><title>${esc(label)} · ${fmt.format(count)}</title></circle>`;
  };
  bins.forEach(([name, rows], index) => {
    const color = colors[index] || `hsl(${index*137.5%360} 40% 44%)`;
    const sum = rows.reduce((acc,row)=>acc+numericQt(row),0);
    if (!sum) return;
    rings[0].push(sector(57,sum,offset,color,name));
    const parts = [...partition(rows,row=>labelFor(row,'s_part') + (row.doubtful?' *':''))];
    const details = [];
    parts.forEach(([part, subset], i) => {
      const count = subset.reduce((acc,row)=>acc+numericQt(row),0);
      if (!count) return;
      const tint = part.endsWith(' *') ? 65 : 14 + (i * 11) % 45;
      const shade = `color-mix(in srgb, ${color}, #eef4eb ${tint}%)`;
      rings[1].push(sector(83,count,offset,shade,`${name} · ${part}`));
      offset += 100*count/total;
      details.push(`${esc(part)} ${fmt.format(count)}`);
    });
    legend.push(`<li><span class="context-swatch" style="--swatch:${color}"></span><b>${axis==='taxon'?taxon(name):esc(name)}</b> · ${fmt.format(sum)}${marked(rows)}<small>${details.join(' · ')}</small></li>`);
  });
  return `<p class="muted">Inner ring: recorded quantities by ${esc(axis.replace(/^s_/,'').replace('foss','preservation').replace('_',' '))}. Outer ring: the plant parts within each group. ${numeric.length} of ${records.length} occurrences provide qt.</p>
    <div class="context-donut"><svg viewBox="0 0 200 200" role="img" aria-label="Quantities and nested plant parts"><g transform="rotate(-90 100 100)">${rings.flat().join('')}</g></svg><ul>${legend.join('')}</ul></div>`;
}

function assemblage(rows) {
  const taxa = new Set(rows.map(row=>row.taxonLabel).filter(name=>name!==MISSING && !/^(unidentified|undetermined|indet\.?|undet\.?)$/i.test(name)));
  const quantities = new Map();
  for (const row of rows) {
    const count = numericQt(row);
    if (count !== null && taxa.has(row.taxonLabel)) quantities.set(row.taxonLabel,(quantities.get(row.taxonLabel)||0)+count);
  }
  return { taxa, quantities, periods:new Set(rows.flatMap(row=>row.periods)), types:new Set(rows.flatMap(row=>text(row.typology).split(' / ')).filter(type=>type && type!==MISSING)) };
}
const common = (a,b) => [...a].filter(term=>b.has(term)).length;
function dateScore(a,b, periods) {
  const intervals = ids => [...ids].map(id=>periods.get(id)).filter(p=>p?.start != null && p?.stop != null);
  const left = intervals(a), right = intervals(b);
  if (!left.length || !right.length) return null;
  let gap = Infinity;
  for (const x of left) for (const y of right) gap = Math.min(gap, Math.max(0,x.start-y.stop,y.start-x.stop));
  return 1/(1+gap/500);
}
function proportionScore(a,b) {
  const left = [...a.values()].reduce((n,v)=>n+v,0), right = [...b.values()].reduce((n,v)=>n+v,0);
  if (!left || !right) return null;
  return [...new Set([...a.keys(),...b.keys()])].reduce((n,key)=>n+Math.min((a.get(key)||0)/left,(b.get(key)||0)/right),0);
}
export function compareContexts(selected, corpus, criteria, periods) {
  const reference = assemblage(selected);
  const existing = new Set(selected.filter(row=>row.linked).map(row=>row.context_id));
  const candidates = partition(corpus.filter(row=>row.linked && !existing.has(row.context_id)), row=>row.context_id);
  const matches = [];
  for (const rows of candidates.values()) {
    const candidate = assemblage(rows);
    const shared = common(reference.taxa,candidate.taxa);
    if (!shared) continue;
    const missing = reference.taxa.size-shared, extra = candidate.taxa.size-shared;
    const scores = [shared/(shared+missing+extra)];
    if (criteria.date) scores.push(dateScore(reference.periods,candidate.periods,periods));
    if (criteria.type) scores.push(reference.types.size && candidate.types.size
      ? common(reference.types,candidate.types)/new Set([...reference.types,...candidate.types]).size : null);
    if (criteria.quantity) scores.push(proportionScore(reference.quantities,candidate.quantities));
    const available = scores.filter(value=>value!==null);
    matches.push({ row:rows[0], rows, taxa:candidate.taxa, shared, missing, extra, score:available.reduce((a,b)=>a+b,0)/available.length, scored:available.length, requested:scores.length });
  }
  return { columns:[...reference.taxa].sort(collator.compare), matches:matches.sort((a,b)=>b.score-a.score||b.shared-a.shared||collator.compare(a.row.contextLabel,b.row.contextLabel)) };
}

function similarityView({columns,matches}, state) {
  if (!columns.length) return '<p class="muted">Choose a geographical filter or select contexts to compare.</p>';
  if (!matches.length) return '<p class="muted">No other contexts share a taxon with this selection.</p>';
  const pct = match => fmt.format(100*match.score)+'%';
  const names = m => `${m.row.contextLabel} · ${m.row.siteLabel} · FID ${m.row.context_id}`;
  if (state.similarity === 'table') {
    const displayed=matches.slice(0,state.simLimit);
    return `<div class="table-scroll context-table" tabindex="0"><table><thead><tr><th>Context</th>${columns.map(c=>`<th>${taxon(c)}</th>`).join('')}<th>Different taxa</th></tr></thead><tbody>
      ${displayed.map(m=>`<tr><th scope="row">${esc(names(m))}<small>Similarity ${pct(m)} · ${m.scored}/${m.requested} criteria available</small></th>${columns.map(c=>m.taxa.has(c)?`<td class="shared-taxon">Present${marked(m.rows.filter(row=>row.taxonLabel===c))}</td>`:'<td>—</td>').join('')}<td>${m.missing+m.extra}<small>${m.missing} missing · ${m.extra} additional</small></td></tr>`).join('')}</tbody></table></div>
      <p class="muted">${displayed.length} of ${matches.length} matches</p>${displayed.length<matches.length?'<button type="button" data-sim-more>Show more contexts</button>':''}`;
  }
  const maxX=Math.max(...matches.map(m=>m.shared)), maxY=Math.max(1,...matches.map(m=>m.missing+m.extra));
  const observedMin=Math.min(...matches.map(m=>m.missing+m.extra));
  const observedMax=Math.max(...matches.map(m=>m.missing+m.extra));
  const padding=Math.max(1,(observedMax-observedMin)*.06);
  const yMin=Math.max(0,Math.floor(observedMin-padding));
  const yMax=Math.ceil(observedMax+padding);
  const points=partition(matches,m=>`${m.shared}:${m.missing+m.extra}`);
  const width=900, height=380, left=65, right=25, top=22, bottom=55;
  const plotWidth=width-left-right, plotHeight=height-top-bottom;
  const ticks=Array.from({length:5},(_,i)=>i/4);
  const grid=ticks.map(fraction=>{
    const x=left+fraction*plotWidth, y=top+(1-fraction)*plotHeight;
    return `<path d="M${left} ${y}H${width-right}" stroke="#dde7db"/><text x="${left-12}" y="${y+4}" text-anchor="end">${fmt.format(Math.round(yMin+(yMax-yMin)*fraction))}</text>
      <text x="${x}" y="${height-bottom+25}" text-anchor="middle">${fmt.format(Math.round(maxX*fraction))}</text>`;
  }).join('');
  return `<div class="similarity-scale"><span>Lower similarity</span><i aria-hidden="true"></i><span>Higher</span></div>
    <svg class="similarity-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Context similarity, shared versus different taxa">
    ${grid}<path d="M${left} ${top}V${height-bottom}H${width-right}" fill="none" stroke="#829a88"/>
    ${[...points.values()].map(entries=>{
      const m=entries[0], x=left+plotWidth*m.shared/maxX;
      const y=top+plotHeight*(1-(m.missing+m.extra-yMin)/(yMax-yMin));
      const radius=Math.min(12,5+Math.log2(entries.length)*1.7);
      const label=`${names(m)} · ${pct(m)} · ${m.shared} shared · ${m.missing+m.extra} different`;
      return `<g data-sim-point="${matches.indexOf(m)}"><circle class="similarity-dot" tabindex="0" role="button" aria-label="${esc(label)}" cx="${x}" cy="${y}" r="${radius}" fill="hsl(151 35% ${70-40*m.score}%)"><title>${esc(label)}${entries.length>1?` · ${entries.length} contexts at this position`:''}</title></circle>
        ${entries.length>1?`<text x="${x}" y="${y+3}" text-anchor="middle" pointer-events="none" style="font-size:9px;fill:${m.score>.5?'white':'#214b37'}">${entries.length}</text>`:''}</g>`;
    }).join('')}
    <text x="${left}" y="13">Different taxa</text><text x="${left+plotWidth/2}" y="${height-8}" text-anchor="middle">Shared taxa</text></svg>
    <p class="muted">Select a point to inspect the contexts. The vertical axis follows the observed range of differences. Colours show the similarity score with the enabled criteria.</p>
    <div id="similarity-point-detail" aria-live="polite">${pointDetails(points.get(`${matches[0].shared}:${matches[0].missing+matches[0].extra}`))}</div>`;
}
function pointDetails(matches) {
  return `<ul class="similarity-matches">${matches.map(m=>`<li><b>${esc(m.row.contextLabel)}</b> · ${esc(m.row.siteLabel)} · FID ${m.row.context_id}<small>${fmt.format(m.score*100)}% · ${m.shared} shared · ${m.missing} missing · ${m.extra} additional · ${m.scored}/${m.requested} criteria available</small></li>`).join('')}</ul>`;
}

export function renderContextResults(profile, similarity, records, reference, candidates, state, axis, periods, siteRows) {
  profile.innerHTML = state.profileView === 'donut'
    ? donut(records,axis) + '<h3>Contexts with unquantified occurrences</h3><p class="muted">Only occurrences without qt are listed here.</p>' + profileTable(records.filter(row=>numericQt(row)===null),axis,state.level==='subcontext'?'subcontext':'leaf',state.contextPage)
    : profileTable(records,axis,state.level,state.contextPage,siteRows);
  const comparison = compareContexts(reference,candidates,state.criteria,periods);
  similarity.innerHTML = similarityView(comparison,state);
  const inspectPoint = event => {
    const point = event.target.closest('[data-sim-point]');
    if (!point) return;
    const {matches} = comparison;
    const hit = matches[Number(point.dataset.simPoint)];
    if (hit) similarity.querySelector('#similarity-point-detail').innerHTML = pointDetails(matches.filter(m=>m.shared===hit.shared && m.missing+m.extra===hit.missing+hit.extra));
  };
  similarity.onclick = inspectPoint;
  similarity.onkeydown = event => { if (event.key==='Enter' || event.key===' ') { event.preventDefault(); inspectPoint(event); } };
}
