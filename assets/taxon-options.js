import { getPath } from '../path_utils.js';

const unclassified = 'Unclassified';
const clean = value => String(value ?? '').trim();
const normalize = value => clean(value).toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const match = (value, words) => words.every(word => normalize(value).includes(word));

// Both pages draw from the WebGIS legend. Dashboard-only identifications are
// passed as fallback rows and keep their original, selectable labels.
export function taxonOptions(rows) {
  const families = new Map();
  for (const row of rows) {
    const value = clean(row.valore);
    if (!value) continue;
    const family = clean(row.category_1) || unclassified;
    const category = clean(row.category_2) || value;
    if (!families.has(family)) families.set(family, { name: family, image: row.image_1, categories: new Map() });
    const entry = families.get(family);
    if (!entry.categories.has(category)) entry.categories.set(category, { name: category, image: row.image_2, taxa: new Map() });
    entry.categories.get(category).taxa.set(value, clean(row.nome_com));
  }
  return families;
}

export function loadTaxonOptions() {
  return fetch(getPath('data/legenda_taxa.csv')).then(response => {
    if (!response.ok) throw new Error(`Taxon legend HTTP ${response.status}`);
    return response.text();
  }).then(source => {
    // Read the quoted CSV by record. Only the legend fields used by the pickers are needed.
    const lines = source.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
    const parse = line => [...line.matchAll(/(?:"((?:[^"]|"")*)"|([^",\r\n]*))(?:,|$)/g)]
      .map(column => (column[1]?.replaceAll('""', '"') ?? column[2]).trim());
    const names = parse(lines.shift()).filter(Boolean);
    return lines.map(line => Object.fromEntries(parse(line).slice(0, names.length).map((value, i) => [names[i], value])));
  });
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  node.className = className;
  if (content) node.textContent = content;
  return node;
}

export function mountTaxonOptions(root, families, selection, onChange, { selectPartial = true, counts = null } = {}) {
  const stylesheet = new URL('./taxon-options.css', import.meta.url).href;
  if (!Array.from(document.styleSheets).some(sheet => sheet.href === stylesheet)
      && !Array.from(document.querySelectorAll('link[rel=stylesheet]')).some(link => link.href === stylesheet)) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: stylesheet });
    document.head.append(link);
  }
  const tools = el('div', 'taxon-options-tools');
  const label = el('label', 'taxon-options-search', 'Search family or taxon');
  const search = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Search family or taxon…' });
  const summary = el('span', 'taxon-options-status');
  summary.setAttribute('aria-live', 'polite');
  const clear = el('button', 'taxon-options-reset', 'Clear selection');
  clear.type = 'button';
  label.append(search);
  tools.append(label, summary, clear);
  const cards = el('div', 'taxon-option-cards');
  root.classList.add('taxon-options');
  root.replaceChildren(tools, cards);

  let order;
  const frequency = new Map();
  if (counts) {
    root.classList.add('taxon-options-frequency');
    order = document.createElement('select');
    order.setAttribute('aria-label', 'Order families');
    order.add(new Option('Alphabetical', 'alpha'));
    order.add(new Option('Most occurrences', 'frequency'));
    tools.append(order);
    for (const [name, family] of families) {
      const values = new Set([...family.categories.values()].flatMap(category => [...category.taxa.keys()]));
      frequency.set(name, [...values].reduce((total, value) => total + (counts.get(value) || 0), 0));
    }
    order.addEventListener('change', () => render());
  }
  const peak = Math.max(1, ...frequency.values());
  const buttons = [];
  let panelIndex = 0;
  function sync() {
    for (const [button, values] of buttons) {
      const count = values.filter(value => selection.has(value)).length;
      button.setAttribute('aria-pressed', count === values.length ? 'true' : count ? 'mixed' : 'false');
    }
    summary.textContent = `${selection.size} selected`;
    clear.disabled = !selection.size;
  }
  function item(label, image, values, className, selectAllPartial = selectPartial) {
    const button = el('button', className);
    button.type = 'button';
    if (image) {
      const icon = Object.assign(document.createElement('img'), { src: getPath(`images/objects/${encodeURIComponent(image)}`), alt: '', loading: 'lazy' });
      icon.addEventListener('error', () => {
        icon.addEventListener('error', () => { icon.hidden = true; }, { once: true });
        icon.src = getPath('images/objects/other.png');
      }, { once: true });
      button.append(icon);
    }
    button.append(el('span', /aceae$/i.test(label) ? 'taxon-family-name' : '', label));
    button.addEventListener('click', () => {
      const test = value => selection.has(value);
      const remove = selectAllPartial ? values.every(test) : values.some(test);
      for (const value of values) remove ? selection.delete(value) : selection.add(value);
      sync();
      onChange(selection);
    });
    buttons.push([button, values]);
    return button;
  }
  function render() {
    const words = normalize(search.value).split(/\s+/).filter(Boolean);
    cards.replaceChildren();
    buttons.length = 0;
    panelIndex = 0;
    const fragment = document.createDocumentFragment();
    const entries = [...families.values()].sort((a, b) =>
      (order?.value === 'frequency' ? frequency.get(b.name) - frequency.get(a.name) : 0)
      || a.name.localeCompare(b.name));
    for (const { name, image, categories } of entries) {
      const familyMatch = match(name, words);
      const sub = el('div', 'taxon-option-children');
      for (const category of categories.values()) {
        const categoryMatch = match(`${name} ${category.name}`, words);
        const exact = [...category.taxa].filter(([value, common]) => familyMatch || categoryMatch || match(`${name} ${category.name} ${value} ${common}`, words));
        if (!exact.length) continue;
        const values = exact.map(([value]) => value);
        const entry = el('div', 'taxon-option-entry');
        entry.append(item(category.name, category.image, values, 'taxon-option-category'));
        if (exact.length > 1 || exact[0][0] !== category.name) {
          const details = el('details', 'taxon-option-details');
          details.open = words.length > 0 && !familyMatch && !categoryMatch;
          details.append(el('summary', '', `Exact identifications (${exact.length})`));
          for (const [value] of exact) details.append(item(value, '', [value], 'taxon-option-exact'));
          entry.append(details);
        }
        sub.append(entry);
      }
      if (!sub.childNodes.length) continue;
      sub.id = `${root.id || 'webgis-taxon-options'}-family-${++panelIndex}`;
      sub.hidden = true;
      const all = [...new Set([...categories.values()].flatMap(category => [...category.taxa.keys()]))];
      const family = item(name, image, all, 'taxon-option-family-button', true);
      if (counts) {
        const count = frequency.get(name);
        const intensity = Math.log1p(count) / Math.log1p(peak);
        family.style.setProperty('--heat-light', `${95 - 66 * intensity}%`);
        family.style.setProperty('--heat-ink', intensity > .52 ? '#fff' : '#173c31');
        family.append(el('small', 'taxon-frequency', count.toLocaleString('en')));
        family.title = `${name} · ${count.toLocaleString('en')} occurrences`;
      }
      const arrow = el('button', 'taxon-option-expand');
      arrow.type = 'button';
      arrow.setAttribute('aria-label', `Show taxa in ${name}`);
      arrow.setAttribute('aria-controls', sub.id);
      arrow.setAttribute('aria-expanded', 'false');
      arrow.addEventListener('click', () => {
        sub.hidden = !sub.hidden;
        arrow.setAttribute('aria-expanded', String(!sub.hidden));
        arrow.setAttribute('aria-label', `${sub.hidden ? 'Show' : 'Hide'} taxa in ${name}`);
      });
      const line = el('div', 'taxon-option-family-row');
      line.append(family, arrow);
      const card = el('article', 'taxon-option-family');
      card.append(line, sub);
      fragment.append(card);
    }
    if (!fragment.childNodes.length) fragment.append(el('p', '', 'No matching taxa.'));
    cards.append(fragment);
    sync();
  }
  clear.addEventListener('click', () => { selection.clear(); sync(); onChange(selection); });
  search.addEventListener('input', render);
  search.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
  render();
  return { focus: () => search.focus(), sync };
}
