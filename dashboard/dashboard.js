import { renderContextResults } from './context-results.js';
import { getPath } from '../path_utils.js';
import { MISSING, text, unique, readCorpus, fitsSelection, distinctContexts, distinctRecords, measurement } from './analysis.js';

import { geographicalOptions, reconcileGeography, filterValue, taxonMeasurement, analyseTaxonGroups, associationResults, contextShares } from './taxon-analysis.js';
import { verticalChart, qualitativeTable, compositionChart } from './taxon-charts.js';
import { loadTaxonOptions, mountTaxonOptions, taxonOptions } from '../assets/taxon-options.js';

const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('en', { maximumFractionDigits: 4 });
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const num = value => value == null ? '—' : fmt.format(value);
const palette = ['#245344','#477f83','#a35943','#765a89','#86703d','#3c6484'];
const definitions = [
  ['site','Site', 'All sites'], ['s_type','Remain type', 'All remain types'], ['s_part','Plant part', 'All plant parts'],
  ['s_foss','Preservation', 'All values'], ['period','Chronology', 'All periods'],
  ['contextIds','Context', 'All contexts'], ['region','Region', 'All regions'], ['province','Province', 'All provinces'], ['typology','Context type', 'All context types']
];
const selectorKinds = { context: { context:'Context', typology:'Context type', site:'Site' }, taxon: { taxon:'Taxon', family:'Family', category:'Category' } };
const field = (record, key) => text(record[key]) || MISSING;
const botanicalFilters = new Set(['s_type','s_part','s_foss']);
const title = { taxon: 'Taxa across contexts', context: 'Contexts and their assemblages' };
const measureLabel = { contexts:'Contexts with records', quantity:'Recorded quantity', weight:'Exact weight (g)' };
const byUnit = () => ({ items: [], descendants:false, groups:null, disjoint:false, filters:{}, measure:'contexts' });
const associationAxes = new Map([
  ['taxon','Taxon'], ['genus','Genus'], ['family','Family'], ['category','WebGIS category'],
  ['s_type','Remain type'], ['s_part','Plant part'], ['s_foss','Preservation']
]);
const filterIcons = {
  region:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2zm6-2v16m6-14v16',
  province:'M4 5l6-2 4 3 6-1v13l-6 3-4-3-6 2zm6-2v15m4-12v15',
  site:'M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0ZM12 10h.01',
  s_type:'M3 17c0-7 9-12 17-12-1 9-4 15-11 15a7 7 0 0 1-6-3Zm3 4L16 9',
  s_part:'M12 21V5m0 8c-5 0-7-3-7-6 4 0 7 3 7 6Zm0 4c5 0 7-3 7-6-4 0-7 3-7 6Z',
  s_foss:'M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10Zm0 16v2',
  typology:'M3 8 12 3l9 5-9 5Zm0 5 9 5 9-5M3 17l9 5 9-5',
  period:'M5 4h14v16H5zm0 5h14M9 2v4m6-4v4m-6 8h6',
  measure:'M4 4v16h16M8 16v-3m4 3V9m4 7V6'
};
const filterIcon = key => `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${filterIcons[key]}"/></svg>`;
const taxonMode = () => state.unit === 'taxon';
const state = {
  unit:'taxon', operation:'aggregate', units:{ context:byUnit(), taxon:byUnit() },
  filters:{}, measure:'contexts', breakdown:'', table:'', page:0, drill:null, chartLimit:10, 
  contextView:{ profileView:'table', level:'site', contextPage:0, similarity:'scatter', criteria:{}, simLimit:30 },
  contextProfile:'absolute', association:'presence', associationAxis:'taxon', associationLimit:16, entityRows:20, entityColumn:0
};
let corpus;
let choices;
let legend;
let filters;
let editing;
let result;
let nextGroupId = 0;
const tableColumns = new Map();
const pageSize = 30;
const unit = () => state.units[state.unit];
const lookup = key => filters.get(key) ?? new Map();
const valueKey = item => `${item.kind}:${item.key}`;
const options = (entries, selected) => [...entries].map(([key,label]) => `<option value="${e(key)}"${key === selected ? ' selected' : ''}>${e(label)}</option>`).join('');
const btn = (label, action, value = '') => `<button type="button" data-action="${action}" data-key="${e(value)}">${e(label)}</button>`;
const group = (name, items = [], descendants = false) => {
  const id=nextGroupId++;
  return { id, name, items:[...items], descendants, color:palette[id%palette.length] };
};
const pick = (kind, key) => ({ kind, key: String(key), label: choices[kind].get(String(key))?.label ?? String(key) });
const combine = (groups) => [...new Map(groups.flatMap(g => g.items.map(item => [valueKey(item), item]))).values()];

function indexChoices() {
  const kinds = ['context','typology','site','taxon','family','category'];
  choices = Object.fromEntries(kinds.map(kind => [kind, new Map()]));
  function add(kind, key, label, hint = '') {
    if (!key) return;
    if (!choices[kind].has(key)) choices[kind].set(key, {kind,key,label,hint,count:0});
    choices[kind].get(key).count++;
  }
  for (const row of corpus.samples) {
    for (const fid of row.ancestry) {
      const r = corpus.contexts.get(fid);
      const breadcrumb = row.ancestry.slice(row.ancestry.indexOf(fid)+1).reverse().map(id => corpus.contexts.get(id).name).join(' › ');
      const key=String(fid);
      add('context',key,r.name,[breadcrumb || row.siteLabel,r.type || 'type unspecified',`FID ${fid}`].filter(Boolean).join(' · '));
      const item=choices.context.get(key);
      item.siteKey ??= row.siteKey;
      item.path ??= [breadcrumb || row.siteLabel,r.name].join(' › ');
      item.depth ??= row.ancestry.length-1-row.ancestry.indexOf(fid);
    }
    add('site', row.siteKey, row.siteLabel);
    add('typology', text(row.typology), text(row.typology));
    add('taxon', row.taxonLabel, row.taxonLabel);
    add('family', text(row.family), text(row.family));
    add('category', text(row.category), text(row.category));
  }
  for (const row of corpus.contexts.values()) {
    if (!choices.context.has(String(row.fid))) choices.context.set(String(row.fid), {
      kind:'context', key:String(row.fid), label:row.name, path:[corpus.contexts.get(row.parent)?.name,row.name].filter(Boolean).join(' › '), siteKey:row.type==='macro'?String(row.fid):String(row.parent??''), depth:row.parent?1:0, hint:[corpus.contexts.get(row.parent)?.name,row.site,row.type || 'type unspecified',`FID ${row.fid}`].filter(Boolean).join(' · '), count:0
    });
  }
  filters = new Map(definitions.map(([key]) => {
    if (key === 'contextIds') return [key, new Map([...choices.context].sort((a,b)=>collator.compare(a[1].label,b[1].label)).map(([id,row])=>[id,row.path || row.label]))];
    if (key === 'site') return [key, new Map([...choices.site].map(([key,r]) => [key,r.label]).sort((a,b) => collator.compare(a[1],b[1])))];
    if (key === 'period') {
      const used = new Set(corpus.samples.flatMap(row => row.periods));
      return [key, new Map(corpus.periods.filter(period=>used.has(period.fid)).sort((a,b)=>(a.start??0)-(b.start??0)).map(p=>[
        String(p.fid), p.start != null && p.stop != null ? `${p.label} (${p.start} to ${p.stop})` : p.label
      ]))];
    }
    return [key, new Map(unique(corpus.samples.map(row => field(row,key))).sort(collator.compare).map(label=>[label,label]))];
  }));
}

function renderFilters() {
  const isTaxon = taxonMode();
  const makeField = ([key, label, all]) => {
    const geographical = isTaxon && ['region', 'province', 'site'].includes(key);
    const values = geographical
      ? [...geographicalOptions(corpus.samples, key, state.filters)].sort((a,b)=>collator.compare(a[1],b[1]))
      : lookup(key);
    if (!isTaxon && ['region','province','site','contextIds'].includes(key)) {
      const selected = state.filters[key] || [];
      return `<details class="filter-box multi-filter" data-multi="${key}"><summary><span>${filterIcon(key)}${e(label)}</span>${selected.length ? ` · ${selected.length} selected` : ''}</summary>
        <div class="multi-dropdown"><input type="search" placeholder="Search ${e(label.toLowerCase())}" aria-label="Search ${e(label.toLowerCase())}">
        <div class="multi-options">${[...values].map(([id,name])=>`<label><input type="checkbox" data-multi-filter="${key}" value="${e(id)}"${selected.includes(id)?' checked':''}><span>${e(name)}</span></label>`).join('')}</div></div></details>`;
    }
    return `<label class="filter-box"><span>${filterIcon(key)}${label}</span><select data-filter="${key}">${options([['',all], ...values],state.filters[key]||'')}</select></label>`;
  };
  if (isTaxon) reconcileGeography(corpus.samples, state.filters);
  const fields = new Map(definitions.map(definition => [definition[0], makeField(definition)]));
  const get = keys => keys.map(key => fields.get(key)).join('');
  const open = [...document.querySelectorAll('.multi-filter[open]')].map(node=>[node.dataset.multi,node.querySelector('input[type=search]').value]);
  $('common-filters').innerHTML = get(isTaxon?['region','province','site']:['region','province','site','contextIds']);
  for (const [key, query] of open) {
    const details = document.querySelector(`.multi-filter[data-multi="${key}"]`);
    if (!details) continue;
    details.open = true;
    details.querySelector('input[type=search]').value = query;
    searchFilter(details, query);
  }
  $('extra-filters').innerHTML = get(['s_type','s_part','s_foss','typology','period']) +
    (isTaxon ? `<label class="filter-box"><span>${filterIcon('measure')}Measure</span>${$('measure-template').innerHTML}</label>` : '');
  if ($('measure')) $('measure').value=state.measure;
  $('context-examples').hidden = isTaxon;
  const names = new Map(definitions.map(([key,label])=>[key,label]));
  $('active-filters').innerHTML = Object.entries(state.filters).filter(([,value])=>value).map(([key,value])=>
    btn(`${names.get(key) || 'Qualified categories'} · ${Array.isArray(value)?value.map(id=>lookup(key).get(id)??id).join(', '):lookup(key).get(value) ?? (key==='excludeDoubtful'?'excluded':value)} ×`,'remove-filter',key)).join('');
}

function searchFilter(details, query) {
  for (const option of details.querySelectorAll('.multi-options label')) option.hidden = !option.textContent.toLowerCase().includes(query.trim().toLowerCase());
}

function matchesFilters(row, entries) {
  return entries.every(([key,value]) => {
    if (!value || key === 'excludeDoubtful') return true;
    if (Array.isArray(value)) {
      if (!value.length) return true;
      if (key === 'contextIds') return row.ancestry.some(id=>value.includes(String(id)));
      return value.includes(filterValue(row,key));
    }
    if (key === 'period') return row.periods.includes(Number(value));
    return filterValue(row,key) === value;
  });
}

const qualified = (row, key) => row[key] + (row.categoryQualifiers?.[key] ? " *" : "");

function scopedRecords() {
  const entries = Object.entries(state.filters);
  return corpus.samples.filter(row => (!state.filters.excludeDoubtful || !row.doubtful) && matchesFilters(row, entries));
}

function eligibleContexts(scoped) {
  const entries = Object.entries(state.filters).filter(([,value]) => value);
  const spatialAndContext = entries.filter(([key]) => !botanicalFilters.has(key));
  const eligibleIds = entries.some(([key]) => botanicalFilters.has(key))
    ? new Set(scoped.filter(row=>row.linked).map(row=>row.context_id))
    : null;
  return [...corpus.contextProfiles.values()].filter(row =>
    matchesFilters(row, spatialAndContext) && (!eligibleIds || eligibleIds.has(row.context_id))
  );
}

function aggregateItems(current) {
  return current.aggregateOverride?.items ?? (current.groups
    ? combine(current.groups).filter(item=>!current.aggregateRemoved?.has(valueKey(item))) : current.items);
}

function getGroups(scoped) {
  const current = unit();
  if (taxonMode()) {
    const groups = state.operation === 'aggregate'
      ? [{ id:-1, name:'Selected taxa', color:palette[0], items:aggregateItems(current) }]
      : current.groups;
    return analyseTaxonGroups(scoped, groups, current.disjoint && state.operation === 'compare');
  }
  if (state.operation === 'aggregate') {
    const override=current.aggregateOverride;
    const records = override ? (override.items.length ? scoped.filter(row=>override.items.some(item=>fitsSelection(row,item,override.descendants))) : scoped)
      : current.groups ? scoped.filter(row=>current.groups.some(g=>g.items.some(item=>!current.aggregateRemoved?.has(valueKey(item)) && fitsSelection(row,item,g.descendants))))
      : current.items.length ? scoped.filter(row=>current.items.some(item=>fitsSelection(row,item,current.descendants))) : scoped;
    return [{ id:-1, name:'Combined selection', color:palette[0], records }];
  }
  const assigned = new Set();
  return current.groups.map(g => {
    const matches = scoped.filter(row => g.items.some(item=>fitsSelection(row,item,g.descendants)));
    const records = current.disjoint ? matches.filter(row => !assigned.has(row.fid)) : matches;
    if (current.disjoint) records.forEach(row=>assigned.add(row.fid));
    return { ...g, records };
  });
}

function renderSelection() {
  const current = unit();
  const compare = state.operation === 'compare';
  const items = aggregateItems(current);
  const isTaxon = taxonMode();
  $('selection-title').textContent = isTaxon ? 'Selected taxa' : compare ? 'Comparison groups' : 'Selected contexts';
  if (!compare) {
    $('selection-actions').innerHTML = btn(isTaxon?'Select taxa':'Edit selection','edit','-1') + (items.length ? btn(isTaxon?'Clear selected taxa':'Use all filtered records','reset-selection') : '');
    $('selection-groups').innerHTML = items.length ? `<div class="analysis-chips">${items.map(item=>btn(`${item.label} ×`,'remove-selection',valueKey(item))).join('')}</div>`
      : `<p class="muted">${isTaxon?'Select one or more taxa to see their archaeological contexts.':'All records within the active filters'}</p>`;
    const descendant = current.aggregateOverride?.descendants ?? (current.groups?.some(g=>g.descendants) || current.descendants);
    $('selection-status').textContent = items.length && descendant ? 'The selection includes descendant contexts where enabled.' : '';
    return;
  }
  $('selection-actions').innerHTML = btn('Add group','add-group') + btn(current.disjoint?`Allow shared ${isTaxon?'contexts':'records'}`:`Make ${isTaxon?'contexts':'groups'} disjoint`,'disjoint');
  $('selection-groups').innerHTML = current.groups.map(g=>
    `<article class="analysis-group" style="--group:${g.color}"><div class="analysis-title-row"><strong>${e(g.name)}</strong><div class="analysis-actions">${btn('Edit group','edit',g.id)}${current.groups.length>2?btn('Remove','remove-group',g.id):''}</div></div>
      <p>${g.items.length?g.items.map(item=>e(item.label)).join(' · '):'Choose the members of this group'}</p>${g.descendants?'<small>Includes descendant contexts</small>':''}</article>`).join('');
  const ready = current.groups.filter(g=>g.items.length).length;
  $('selection-status').textContent = ready<2 ? 'Choose at least two groups to compare.' : current.disjoint ? `Shared ${isTaxon?'contexts':'occurrences'} are assigned to the first matching group.` : 'All groups use the same active filters.';
}

function refresh() {
  $('analysis-title').textContent = title[state.unit];
  for (const [id,key] of [['unit-switch','unit'],['operation-switch','operation']]) {
    $(id).querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.value===state[key])));
  }
  const isTaxon = taxonMode();
  $('dashboard-app').classList.toggle('by-taxon', isTaxon);
  if (isTaxon) $('analysis-filter-panel').before($('analysis-selection'));
  else $('analysis-filter-panel').after($('analysis-selection'));
  $('analysis-charts').classList.toggle('taxon-charts', isTaxon);
  for (const id of ['taxon-evidence-controls','taxon-evidence','evidence-info-button','taxon-composition','context-profile-controls']) $(id).hidden=!isTaxon;
  $('evidence-matrix').hidden=isTaxon;
  $('exclude-doubtful').checked=!!state.filters.excludeDoubtful;
  $('context-results-controls').hidden=isTaxon;
  $('similarity-controls').hidden=isTaxon;
  $('evidence-title').textContent=isTaxon?'Evidence matrix':'Context similarity';
  $('analysis-charts').classList.toggle('context-charts',!isTaxon);
  renderFilters();
  renderSelection();
  const scoped = scopedRecords();
  const groups = getGroups(scoped);
  const records = distinctRecords(groups);
  const m = isTaxon ? taxonMeasurement(state.measure) : measurement('contexts','',records,false);
  result = {groups,records,m,eligible: isTaxon ? eligibleContexts(scoped) : []};
  renderOverview();
  renderTable();
}

function currentBreakdowns() {
  return new Map(state.unit==='context'
    ? [...associationAxes]
    : [['region','Region'],['province','Province'],['site','Site'],['context','Context'],['typology','Context type'],['period','Chronology']]);
}

function dimension(row, key) {
  if (key==='taxon') return [row.taxonLabel];
  if (key==='site') return [row.siteLabel];
  if (taxonMode() && ['region','province'].includes(key)) return [filterValue(row,key)];
  if (key==='context') return [row.linked?`${row.contextLabel} · FID ${row.context_id}`:MISSING];
  if (key==='period') return row.periods.length?row.periods.map(id=>lookup('period').get(String(id))??`Term ${id}`):[MISSING];
  return [field(row,key)];
}

function binsFor(records, axis) {
  const map = new Map();
  for (const row of records) {
    for (const key of unique(dimension(row,axis))) {
      if (!map.has(key)) map.set(key,[]);
      map.get(key).push(row);
    }
  }
  return map;
}

function renderOverview() {
  const {groups,records,m}=result;
  const compare=state.operation==='compare';
  const numeric=taxonMode() && state.measure!=='contexts';
  const eligible=records.filter(m.eligible).length;
  const occurrences = new Map();
  for (const g of groups) for (const row of g.records) occurrences.set(row.fid,(occurrences.get(row.fid)??0)+1);
  const shared=[...occurrences.values()].filter(n=>n>1).length;
  const memberships = new Map();
  for (const g of groups) for (const id of new Set(g.records.filter(r=>r.linked).map(r=>r.context_id))) memberships.set(id,(memberships.get(id)??0)+1);
  const sharedContexts=[...memberships.values()].filter(n=>n>1).length;
  const geographyTile = taxonMode() ? [num(new Set(records.map(r=>r.siteKey).filter(Boolean)).size),'Sites represented']
    : [num(records.filter(r=>!r.linked).length),'Records with unresolved contexts'];
  const tiles = [
    [num(records.length),'Distinct occurrence records'],
    [num(distinctContexts(records)),'Contexts with records'],
    [num(new Set(records.map(r=>r.taxonLabel).filter(name=>name!==MISSING)).size),'Recorded taxon labels'],
    numeric?[`${num(eligible)} / ${num(records.length)}`,'Records eligible for this measure']:geographyTile
  ];
  $('analysis-metrics').innerHTML=tiles.map(([number,label])=>`<div><strong>${number}</strong><span>${label}</span></div>`).join('');
  const overlap=compare?` · ${num(shared)} shared occurrences · ${num(sharedContexts)} shared contexts`:'';
  $('coverage-total').textContent = numeric
    ? `Quantitative coverage · ${num(eligible)} eligible of ${num(records.length)} occurrences${eligible<records.length?' · partial reporting':''}${overlap}`
    : `Documentary coverage · ${num(records.filter(r=>r.linked).length)} occurrences with a resolved context${overlap}`;
  const breakdowns=currentBreakdowns();
  if(!breakdowns.has(state.breakdown))state.breakdown=[...breakdowns.keys()][0];
  $('breakdown').innerHTML=options(breakdowns,state.breakdown);
  $('profile-title').textContent=taxonMode()?'Context profile':'Taxon profile';
  if (taxonMode()) renderBars();
  $('group-coverage').innerHTML=groups.map(g=>{
    const count=numeric?g.records.filter(m.eligible).length:g.records.filter(r=>r.linked).length;
    const value=m.value(g.records);
    const suffix=numeric&&value!==null&&count<g.records.length?' · partial':'';
    return `<div class="coverage-item" style="--group:${g.color}"><strong>${e(g.name)}</strong><div>${num(count)} / ${num(g.records.length)} ${numeric?'eligible':'linked'} occurrences</div><progress max="${Math.max(1,g.records.length)}" value="${count}" aria-label="${e(g.name)} reporting coverage"></progress><small>${value===null?'No eligible numeric value':`${measureLabel[state.measure]} · ${num(value)}${suffix}`}</small></div>`;
  }).join('');
  if (taxonMode()) {
    $('composition-charts').classList.toggle('is-compare', compare);
    renderTaxonEvidence();
    $('composition-charts').innerHTML = [['s_part','Plant parts'],['s_foss','Preservation'],['s_type','Remain types']]
      .map(([field,label])=>compositionChart(groups,field,label)).join('');
  } else renderByContext();
}

function renderBars() {
  const {groups,m,records}=result;
  const breakdown=state.breakdown;
  const all=binsFor(records,breakdown);
  const byGroup=groups.map(g=>binsFor(g.records,breakdown));
  const percent = taxonMode() && state.contextProfile === 'share';
  const reference = percent ? binsFor(result.eligible, breakdown) : null;
  const rows=[...all].map(([label])=>{
    const sets=byGroup.map(map=>map.get(label)??[]);
    const total = reference?.get(label)?.length ?? 0;
    const counts = percent ? sets.map(distinctContexts) : [];
    const values = percent
      ? contextShares(counts, total, groups)
      : sets.map(r=>r.length?m.value(r):null);
    const details = percent ? counts.map(count=>`${num(count)} of ${num(total)} contexts`) : [];
    return { label, sets, values, details, doubtful: breakdown==='typology' && sets.some(set=>set.some(row=>row.typologyQualifier)), peak:Math.max(-1,...values.map(v=>v??-1)) };
  }).filter(row=>row.peak>=0).sort((a,b)=>b.peak-a.peak||collator.compare(a.label,b.label));
  result.barRows=rows;
  if (taxonMode()) {
    for (const button of $('context-profile-switch').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.value === state.contextProfile));
    }
    const axis = currentBreakdowns().get(breakdown).toLowerCase();
    const label = percent ? `Share of eligible contexts by ${axis}` : `${measureLabel[state.measure]} by ${axis}`;
    const note = percent ? '<p class="muted profile-note">The denominator includes all contexts that meet the active filters for each category, independently of the selected taxa. With botanical filters, a context must have at least one matching occurrence.</p>' : '';
    $('analysis-bars').innerHTML = verticalChart(rows.slice(0,state.chartLimit), groups, {
      percent, zoomPercent:percent, label, interactive:true, showLegend:state.operation==='compare'
    }) + (rows.length>state.chartLimit?btn('Show more categories','more-bars'):'') + note;
    return;
  }

}

function renderTaxonEvidence() {
  const groups = result.groups;
  const quantitative = state.association === 'quantity';
  const association = associationResults(groups, state.associationAxis, quantitative);
  const rows = association.rows.sort((a,b)=>Math.max(...b.values)-Math.max(...a.values)||collator.compare(a.label,b.label));
  $('association-axis').innerHTML = options(associationAxes, state.associationAxis);
  $('association-switch').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.value===state.association)));
  const contextCounts = groups.map(group=>`${e(group.name)} · ${num(group.contexts.size)} reference contexts`).join(' · ');
  const note = quantitative && groups.some(group=>group.contexts.size)
    ? '<p class="muted association-note">* ' + association.reporting.map(item=>
      `${e(item.name)}: ${num(item.excluded)} contexts excluded for missing numeric counts, ${num(item.partial)} with partial counts, ${num(item.noAssociates)} with no associated taxa.`).join(' ') + '</p>' : '';
  $('taxon-evidence').innerHTML = `<p class="association-denominator muted">${contextCounts}</p>` +
    verticalChart(rows.slice(0,state.associationLimit), groups, {
      percent:!quantitative, label:quantitative?'Exact recorded remains':'Share of reference contexts', showLegend:groups.length>1
    }) + (rows.length>state.associationLimit?btn('Show more associations','more-associations'):'') +
    note + (quantitative ? qualitativeTable(association.reporting,state.entityRows,state.entityColumn) : '');
}

function syncContextButtons() {
  for(const button of document.querySelectorAll('[data-context-key]')) {
    button.setAttribute('aria-pressed',String(state.contextView[button.dataset.contextKey]===button.dataset.value));
  }
  for(const button of document.querySelectorAll('[data-sim-toggle]')) {
    button.setAttribute('aria-pressed',String(!!state.contextView.criteria[button.dataset.simToggle]));
  }
}

function renderByContext() {
  syncContextButtons();
  const active = Object.entries(state.filters).some(([key,value]) => ['region','province','site','contextIds','typology','period'].includes(key) && (Array.isArray(value)?value.length:value))
    || aggregateItems(unit()).length > 0;
  const entries = Object.entries(state.filters);
  const candidates = corpus.samples.filter(row => (!state.filters.excludeDoubtful || !row.doubtful) &&
    matchesFilters(row,entries.filter(([key])=>botanicalFilters.has(key))));
  const selected = aggregateItems(unit());
  const knownSites = new Map();
  for (const row of corpus.contextProfiles.values()) {
    if (!row.siteKey || knownSites.has(row.siteKey) || !matchesFilters(row,entries.filter(([key])=>!botanicalFilters.has(key)))) continue;
    if (selected.length && !selected.some(item=>fitsSelection(row,item,true))) continue;
    knownSites.set(row.siteKey,row);
  }
  renderContextResults($('analysis-bars'), $('evidence-matrix'), result.records, active?result.records:[], candidates,
    state.contextView, state.breakdown, new Map(corpus.periods.map(period=>[period.fid,period])), [...knownSites.values()]);
}

function defaultView() {
  return state.operation==='compare' ? 'groups' : taxonMode() ? 'contexts' : 'occurrences';
}

function selectedRecords() {
  if (!state.drill) return result.records;
  return result.records.filter(row=>state.drill.ids.has(row.fid));
}

function tableData() {
  const rs = selectedRecords();
  const { m,groups } = result;
  if (state.table==='occurrences') {
    return {
      headings:['FID','Taxon','Context','Remain type','Plant part','Preservation','Original quantity','Entity','qt','Weight (g)','Source','Details'],
      rows:rs.map(row=>({
        name:row.taxonLabel, count:1,
        cells:[row.fid,row.taxonLabel,row.contextLabel,qualified(row,"s_type"),qualified(row,"s_part"),qualified(row,"s_foss"),row.quantity,row.entity,row.qt,row.weight_g,row.bibliography],
        action:btn('Inspect','record',row.fid)
      }))
    };
  }
  let collections;
  if (state.table==='groups') {
    collections=groups.map(g=>[g.name,g.records.filter(r=>!state.drill||state.drill.ids.has(r.fid))]);
  } else if (state.table==='sources') {
    collections=[...binsFor(rs,'bibliography')];
  } else if (state.table==='taxa') {
    const current=unit();
    const items=current.aggregateOverride?.items ?? (current.groups?combine(current.groups).filter(item=>!current.aggregateRemoved?.has(valueKey(item))):current.items);
    const inclusion = item => current.aggregateOverride ? rs.filter(row=>fitsSelection(row,item,current.aggregateOverride.descendants)) : current.groups
      ? rs.filter(row=>unit().groups.some(g=>g.items.some(member=>valueKey(member)===valueKey(item)&&fitsSelection(row,member,g.descendants))))
      : rs.filter(row=>fitsSelection(row,item,unit().descendants));
    collections=items.length?items.map(item=>[`${selectorKinds[state.unit][item.kind]} · ${item.label}`,inclusion(item)]):[...binsFor(rs,'taxon')];
  } else {
    collections=[...binsFor(rs,'context')];
  }
  const quantity=state.measure!=='contexts';
  return {
    headings:[state.table==='sources'?'Bibliographic source':state.table==='contexts'?'Context':'Group / selection','Occurrences','Contexts with records','Eligible numeric records',quantity?measureLabel[state.measure]:'Source reporting','Original reporting','Details'],
    rows:collections.map(([name,records],index)=>{
      const eligible=records.filter(m.eligible).length;
      const value=m.value(records);
      const reporting=documentedValues(records);
      const asText=reporting.slice(0,5).join(' · ')+(reporting.length>5?' …':'');
      const cells=[name,records.length,distinctContexts(records),quantity?`${eligible} / ${records.length}`:'—',
        quantity?(value===null?'Unavailable':`${num(value)}${eligible<records.length?' · partial':''}`):`${reporting.length} distinct values`,asText];
      return { name,count:records.length,cells,records,action:btn('View records','inspect-row',index) };
    })
  };
}

function renderTable() {
  if (!state.table) state.table=defaultView();
  const names = { groups:'Groups', taxa:'Taxa and selections', occurrences:'Occurrences', contexts:'Contexts', sources:'Sources' };
  const tabs = unique([defaultView(),'occurrences','contexts',...(taxonMode()?['taxa']:[]),'sources']);
  const search=$('table-search').value.trim().toLocaleLowerCase();
  $('table-tabs').innerHTML=tabs.map(key=>`<button type="button" data-action="table-tab" data-key="${key}" aria-pressed="${state.table===key}">${names[key]}</button>`).join('');
  $('drill').innerHTML=state.drill?btn(`${state.drill.label} ×`,'clear-drill'):'';
  const {headings,rows}=tableData();
  result.tableRows=rows;
  const hidden = tableColumns.get(state.table) ?? new Set();
  $('column-options').innerHTML=headings.map((name,i)=>`<label class="check-row"><input type="checkbox" data-column="${i}" ${hidden.has(i)?'':'checked'} ${i===0||i===headings.length-1?'disabled':''}> ${e(name)}</label>`).join('');
  const visible=rows.filter(r=>!search||r.cells.some(value=>String(value??'').toLocaleLowerCase().includes(search)));
  const sort=$('table-sort').value;
  if(sort==='name') visible.sort((a,b)=>collator.compare(a.name,b.name));
  if(sort==='records') visible.sort((a,b)=>b.count-a.count||collator.compare(a.name,b.name));
  const pages=Math.max(1,Math.ceil(visible.length/pageSize));
  state.page=Math.min(state.page,pages-1);
  const page=visible.slice(state.page*pageSize,(state.page+1)*pageSize);
  $('analysis-table').innerHTML=page.length ? `<table><thead><tr>${headings.map((name,i)=>hidden.has(i)?'':`<th scope="col">${e(name)}</th>`).join('')}</tr></thead><tbody>${page.map(r=>`<tr>${r.cells.map((value,i)=>hidden.has(i)?'':`<td>${e(value==null||value===''?'—':value)}</td>`).join('')}<td>${r.action}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No rows match the current table view.</p>';
  $('table-pages').innerHTML=`<span class="muted">${num(visible.length)} rows · page ${state.page+1} of ${pages}</span> <button type="button" data-action="previous" ${state.page===0?'disabled':''}>Previous</button> <button type="button" data-action="next" ${state.page+1===pages?'disabled':''}>Next</button>`;
}

function openRecord(fid) {
  const row=corpus.sampleIndex.get(fid);
  const context = corpus.contexts.get(row.context_id);
  const site = row.ancestry.map(id=>corpus.contexts.get(id)).find(item=>item.webSite);
  const chain = [...row.ancestry].reverse().map(id=>corpus.contexts.get(id).name).join(' › ');
  const entries=[
    ['FID',row.fid],['Record ID',row.id],['Taxon',row.taxonLabel],['Original identification',row.species_orig_pub],['Genus',row.genus],['Family',row.family],['Category',row.category],
    ['Context',chain||row.contextLabel],['Original context label',row.context],['Context FID',row.context_id],['Recorded parent FID',row.parent_context_id],['Source dating',context?.sourceDating],
    ['Chronology',row.periods.map(id=>lookup('period').get(String(id))).filter(Boolean).join(' · ')],
    ['Sample reference',row.sample_number],['Remain type',qualified(row,'s_type')],['Plant part',qualified(row,'s_part')],['Preservation',qualified(row,'s_foss')],['Original quantity',row.quantity],
    ['Entity',row.entity],['qt',row.qt],['Weight (g)',row.weight_g],['Source notes',row.s_notes],['Bibliography',row.bibliography]
  ];
  const details=entries.map(([key,value])=>`<dt>${key}</dt><dd>${e(value==null||value===''?'Not recorded':value)}</dd>`).join('');
  $('record-details').innerHTML=`<dl>${details}</dl>${site?`<a href="${getPath(`webgis/index.html?fid=${site.fid}`)}">Open site in WebGIS</a>`:''}`;
  $('record-dialog').showModal();
}

function editGroup(id) {
  const current=unit();
  if (taxonMode()) {
    const original = id===-1 ? { items:aggregateItems(current) } : current.groups.find(g=>g.id===id);
    const values = new Set(original.items.map(item=>item.key));
    editing = { id, items:new Map(original.items.map(item=>[valueKey(item),item])) };
    $('taxon-dialog-title').textContent = id===-1?'Select taxa':'Edit comparison group';
    $('taxon-group-name-wrap').hidden = id===-1;
    $('taxon-group-name').value = original.name ?? '';
    const picker = mountTaxonOptions($('dashboard-taxon-options'),legend,values,selection=>{
      editing.items = new Map([...selection].map(key => {
        const item = pick('taxon',key);
        return [valueKey(item),item];
      }));
    }, { counts:new Map([...choices.taxon].map(([key,item])=>[key,item.count])) });
    $('taxon-dialog').showModal();
    picker.focus();
    return;
  }
  const original=id===-1 ? { name:'',items:current.aggregateOverride?.items ?? (current.groups?combine(current.groups).filter(item=>!current.aggregateRemoved?.has(valueKey(item))):current.items),descendants:current.aggregateOverride?.descendants ?? (current.groups?.some(g=>g.descendants)||current.descendants) } : current.groups.find(g=>g.id===id);
  editing={ id, items:new Map(original.items.map(item=>[valueKey(item),item])), limit:80 };
  $('group-dialog-title').textContent=id===-1?'Edit selection':'Edit comparison group';
  $('group-name-wrap').hidden=id===-1;
  $('group-name').value=original.name ?? '';
  $('selector-kind').innerHTML=options(Object.entries(selectorKinds[state.unit]));
  $('selector-search').value='';
  $('selector-site').innerHTML=options([['','All sites'],...lookup('site')]);
  $('descendant-wrap').hidden=state.unit!=='context';
  $('descendants').checked=Boolean(original.descendants);
  renderChoices();
  $('group-dialog').showModal();
}

function renderChoices() {
  const kind=$('selector-kind').value;
  const site=$('selector-site').value;
  $('selector-site-wrap').hidden=kind!=='context';
  const query=$('selector-search').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches=[...choices[kind].values()].filter(item=>(kind!=='context'||!site||item.siteKey===site)&&query.every(word=>`${item.label} ${item.hint}`.toLocaleLowerCase().includes(word)))
    .sort((a,b)=>collator.compare(kind==='context'?a.path:a.label,kind==='context'?b.path:b.label));
  $('selector-selected').innerHTML=[...editing.items.values()].map(item=>btn(`${item.label} ×`,'unpick',valueKey(item))).join('');
  $('selector-list').innerHTML=matches.slice(0,editing.limit).map(item=>
    `<label class="check-row" style="padding-inline-start:${9+Math.min(4,item.depth||0)*14}px"><input type="checkbox" data-pick="${e(item.key)}" ${editing.items.has(valueKey(item))?'checked':''}><span>${e(item.label)} <small>${item.hint?e(item.hint)+' · ':''}${item.count} ${kind==='context'?'records including descendants':'records'}</small></span></label>`).join('')||'<p class="muted">No matching selections.</p>';
  $('more-choices').hidden=matches.length<=editing.limit;
}

function saveGroup() {
  const current = unit();
  const items = [...editing.items.values()];
  const descendants = state.unit==='context' && $('descendants').checked;
  if (editing.id===-1) {
    // Keep comparison groups available when the unified selection is edited.
    current.aggregateOverride={ items, descendants };
    current.items=items;
    current.descendants=descendants;
  } else {
    const g=current.groups.find(g=>g.id===editing.id);
    Object.assign(g,{ items, descendants, name:$(taxonMode()?'taxon-group-name':'group-name').value.trim() || g.name });
    current.aggregateOverride=null;
  }
  resetView();
}

function resetView({clearSearch=false}={}) {
  state.contextView.contextPage=0;
  state.contextView.simLimit=30;
  state.page=0;
  state.drill=null;
  state.chartLimit=10;
  state.associationLimit=16;
  state.entityRows=20;
  state.entityColumn=0;
  if(clearSearch)$('table-search').value='';
  refresh();
}

function prepareCompare() {
  const current=unit();
  current.groups ??= [group('Group A',current.items,current.descendants),group('Group B')];
}

function drill(records,label) {
  state.drill={label,ids:new Set(records.map(r=>r.fid))};
  state.table='occurrences';
  state.page=0;
  $('table-search').value='';
  renderTable();
  $('inspect').scrollIntoView({block:'start'});
  $('analysis-table').focus({preventScroll:true});
}

function preset(lamarmotta) {
  state.unit='context';
  state.operation=lamarmotta?'compare':'aggregate';
  state.measure='quantity';
  state.filters=lamarmotta?{s_type:'carpological',s_part:'seed',s_foss:'waterlogging'}:{};
  state.units.context=byUnit();
  const current=unit();
  current.filters=state.filters;
  if(lamarmotta){
    current.groups=[group('Strato 1',[pick('context',415)]),group('Rimosso',[pick('context',416)])];
  } else {
    current.items=[pick('context',791)];
  }
  state.breakdown='';
  state.table=defaultView();
  resetView({clearSearch:true});
}

function handleAction(button) {
  const key=button.dataset.key;
  const current=unit();
  switch (button.dataset.action) {
    case 'remove-filter': delete state.filters[key]; resetView(); break;
    case 'edit': editGroup(Number(key)); break;
    case 'add-group': {
      const created=group(`Group ${current.groups.length+1}`);
      current.groups.push(created);
      refresh();
      editGroup(created.id);
      break;
    }
    case 'remove-group': current.groups=current.groups.filter(g=>g.id!==Number(key)); current.aggregateOverride=null; resetView(); break;
    case 'disjoint': current.disjoint=!current.disjoint; resetView(); break;
    case 'reset-selection': current.items=[]; current.aggregateOverride={items:[],descendants:false}; resetView(); break;
    case 'remove-selection': {
      const selected=current.aggregateOverride?.items ?? (current.groups?combine(current.groups).filter(item=>!current.aggregateRemoved?.has(valueKey(item))):current.items);
      const items=selected.filter(item=>valueKey(item)!==key);
      if (current.groups && !current.aggregateOverride) {
        // Preserve each group's descendant setting for the remaining selections.
        current.aggregateRemoved ??= new Set();
        current.aggregateRemoved.add(key);
        if(!items.length)current.aggregateOverride={items:[],descendants:false};
      } else {
        current.aggregateOverride={items,descendants:current.aggregateOverride?.descendants??current.descendants};
        current.items=items;
      }
      resetView();
      break;
    }
    case 'unpick': editing.items.delete(key); renderChoices(); break;
    case 'bar': {
      const [i,j]=key.split(':').map(Number);
      const row=result.barRows[i];
      drill(row.sets[j],`${row.label} · ${result.groups[j].name}`);
      break;
    }
    case 'inspect-row': {
      const row=result.tableRows[Number(key)];
      drill(row.records,row.name);
      break;
    }
    case 'clear-drill': state.drill=null; state.page=0; renderTable(); break;
    case 'table-tab': state.table=key; state.page=0; renderTable(); break;
    case 'record': openRecord(Number(key)); break;
    case 'previous': state.page=Math.max(0,state.page-1); renderTable(); break;
    case 'next': state.page++; renderTable(); break;
    case 'more-bars': state.chartLimit+=10; renderBars(); break;
    case 'more-associations': state.associationLimit+=16; renderTaxonEvidence(); break;
    case 'more-entity': state.entityRows+=20; renderTaxonEvidence(); break;
    case 'prev-entity': state.entityColumn-=5; renderTaxonEvidence(); break;
    case 'next-entity': state.entityColumn+=5; renderTaxonEvidence(); break;
  }
}

function completePickerFamilies(records, legendRows) {
  const labelKey = value => text(value).toLocaleLowerCase();
  const byLabel = new Map();
  const byGenus = new Map();
  const add = (index, key, value) => {
    if (!key || !value) return;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(value);
  };
  const one = entry => entry?.size === 1 ? [...entry][0] : '';
  for (const row of legendRows) add(byLabel,labelKey(row.valore),text(row.category_1));
  for (const row of records) {
    add(byLabel,labelKey(row.taxonLabel),text(row.family));
    add(byGenus,labelKey(row.genus),text(row.family));
  }
  for (const row of records) {
    if (text(row.family)) continue;
    const exact = one(byLabel.get(labelKey(row.taxonLabel)));
    if (exact) {
      row.family = exact;
      continue;
    }
    const names = row.taxonLabel.split('/');
    if (names.length < 2) continue;
    const inferred = names.map(name => one(byGenus.get(labelKey(text(name).split(/\s+/)[0]))));
    if (inferred[0] && inferred.every(family => family === inferred[0])) row.family = inferred[0];
  }
}

async function init() {
  const response=await fetch(getPath('data/dashboard-corpus.json'));
  if(!response.ok)throw new Error(`Dataset HTTP ${response.status}`);
  corpus=readCorpus(await response.json());
  const legendRows = await loadTaxonOptions().catch(error=>{ console.warn(error); return []; });
  completePickerFamilies(corpus.samples, legendRows);
  indexChoices();
  state.filters=unit().filters;
  const seen = new Set();
  const known = legendRows.filter(row=>choices.taxon.has(row.valore));
  known.forEach(row=>seen.add(row.valore));
  for (const row of corpus.samples) {
    if (row.taxonLabel===MISSING || seen.has(row.taxonLabel)) continue;
    known.push({ valore:row.taxonLabel,category_1:row.family,category_2:row.category || row.taxonLabel, image_1:legendRows.find(entry=>entry.category_1===row.family)?.image_1 });
    seen.add(row.taxonLabel);
  }
  legend = taxonOptions(known);
  const unresolved=corpus.samples.filter(r=>!r.linked).length;
  $('corpus-notes').textContent=`Dashboard extract from ${corpus.source}. The unfiltered corpus includes all ${num(corpus.samples.length)} occurrence records, including ${num(unresolved)} with unresolved context links. Families come from the GeoPackage where recorded. Missing families use an unambiguous match in the WebGIS legend or agreement between explicitly named genera. ${corpus.categorySource} Chronology follows the recorded links to the project's chronological terms.`;
  $('data-status').hidden=true;
  $('dashboard-app').hidden=false;
  document.addEventListener('pointerdown', event=>{
    for (const details of document.querySelectorAll('.multi-filter[open]')) {
      if (!details.contains(event.target)) details.open=false;
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape') for(const details of document.querySelectorAll('.multi-filter[open]')) {
      details.open=false;
      details.querySelector('summary').focus();
    }
  });
  $('dashboard-main').addEventListener('input', event=>{
    const details=event.target.closest('.multi-filter');
    if(details && event.target.type==='search') searchFilter(details,event.target.value);
  });
  $('dashboard-main').addEventListener('click',event=>{
    const control=event.target.closest('button');
    if (control?.dataset.contextKey) {
      state.contextView[control.dataset.contextKey]=control.dataset.value;
      state.contextView.contextPage=0;
      syncContextButtons();
      renderByContext();
    }
    if (control?.dataset.simToggle) {
      state.contextView.criteria[control.dataset.simToggle]=!state.contextView.criteria[control.dataset.simToggle];
      syncContextButtons();
      renderByContext();
    }
    if (control?.dataset.contextPage) {
      state.contextView.contextPage += Number(control.dataset.contextPage);
      renderByContext();
    }
    if (control?.hasAttribute('data-sim-more')) {
      state.contextView.simLimit += 30;
      renderByContext();
    }
    const button=event.target.closest('button');
    if(button?.dataset.action)handleAction(button);
  });
  $('group-dialog').addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button?.dataset.action)handleAction(button);
  });
  for(const [id,key] of [['unit-switch','unit'],['operation-switch','operation']]){
    $(id).addEventListener('click',event=>{
      const value=event.target.closest('button')?.dataset.value;
      if(!value||value===state[key])return;
      if(key==='unit'){
        unit().measure=state.measure;
        state.unit=value;
        state.measure=unit().measure;
        state.filters=unit().filters;
      } else state.operation=value;
      if(state.operation==='compare')prepareCompare();
      if(key==='operation' && state.operation==='aggregate') {
        unit().aggregateOverride=null;
        unit().aggregateRemoved=null;
      }
      state.table=defaultView();
      state.breakdown='';
      resetView({clearSearch:true});
    });
  }
  document.addEventListener('change',event=>{
    const el=event.target;
    if (el.dataset.multiFilter) {
      const key=el.dataset.multiFilter;
      const values=new Set(state.filters[key] || []);
      el.checked?values.add(el.value):values.delete(el.value);
      if (values.size) state.filters[key]=[...values]; else delete state.filters[key];
      resetView();
      [...document.querySelectorAll(`[data-multi-filter="${key}"]`)].find(input=>input.value===el.value)?.focus({preventScroll:true});
    }
    if (el.id==='exclude-doubtful') {
      state.filters.excludeDoubtful=el.checked;
      resetView();
    }
    if (el.dataset.contextView) {
      state.contextView[el.dataset.contextView]=el.value;
      state.contextView.contextPage=0;
      renderByContext();
    }
    if (el.dataset.simCriterion) {
      state.contextView.criteria[el.dataset.simCriterion]=el.checked;
      renderByContext();
    }
    if(el.dataset.filter){
      state.filters[el.dataset.filter]=el.value;
      resetView();
      $('analysis-filter-panel').querySelector(`[data-filter="${el.dataset.filter}"]`)?.focus({preventScroll:true});
    }
    if(el.id==='measure'){
      state.measure=el.value;
      resetView();
      $('measure').focus({preventScroll:true});
    }
    if(el.dataset.column!=null){
      const hidden=tableColumns.get(state.table)??new Set();
      if(el.checked)hidden.delete(Number(el.dataset.column)); else hidden.add(Number(el.dataset.column));
      tableColumns.set(state.table,hidden);
      renderTable();
    }
    if(el.dataset.pick!=null){
      const item=pick($('selector-kind').value,el.dataset.pick);
      if(el.checked)editing.items.set(valueKey(item),item); else editing.items.delete(valueKey(item));
      $('selector-selected').innerHTML=[...editing.items.values()].map(v=>btn(`${v.label} ×`,'unpick',valueKey(v))).join('');
    }
  });
  for(const id of ['breakdown'])$(id).addEventListener('change',event=>{state[id]=event.target.value;resetView();});
  $('clear-filters').addEventListener('click',()=>{state.filters=unit().filters={};resetView();});
  $('context-profile-switch').addEventListener('click',event=>{
    const choice=event.target.closest('button')?.dataset.value;
    if(!choice || choice===state.contextProfile)return;
    state.contextProfile=choice;
    state.chartLimit=10;
    renderBars();
  });
  $('evidence-info-button').addEventListener('click',()=>$('evidence-info').showModal());
  $('association-switch').addEventListener('click',event=>{
    const choice=event.target.closest('button')?.dataset.value;
    if(!choice||choice===state.association)return;
    state.association=choice;
    state.entityRows=20;
    state.entityColumn=0;
    renderTaxonEvidence();
  });
  $('association-axis').addEventListener('change',event=>{
    state.associationAxis=event.target.value;
    state.associationLimit=16;
    renderTaxonEvidence();
  });
  $('marmotta').addEventListener('click',()=>preset(true));
  $('d85').addEventListener('click',()=>preset(false));
  $('table-search').addEventListener('input',()=>{state.page=0;renderTable();});
  $('table-sort').addEventListener('change',()=>{state.page=0;renderTable();});
  for(const id of ['selector-kind','selector-site']) $(id).addEventListener('change',()=>{editing.limit=80;renderChoices();});
  $('selector-search').addEventListener('input',()=>{editing.limit=80;renderChoices();});
  $('more-choices').addEventListener('click',()=>{editing.limit+=80;renderChoices();});
  for(const id of ['group-form','taxon-form']){
    $(id).addEventListener('submit',event=>{if(event.submitter?.value==='save')saveGroup();});
  }
  refresh();
}

init().catch(error=>{
  console.error(error);
  $('dashboard-app').hidden=true;
  $('data-status').hidden=false;
  $('data-status').textContent='The dashboard data could not be loaded. Reload the page to try again.';
});
