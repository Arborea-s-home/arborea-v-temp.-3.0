const text = value => String(value ?? '').trim();
const normal = value => text(value).toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu,'');
const collator = new Intl.Collator('en',{numeric:true,sensitivity:'base'});
const el = (tag, cls, value) => Object.assign(document.createElement(tag),{className:cls || '',textContent:value || ''});

export function buildOccurrenceIndex(samples, contexts, sites) {
  const siteById = new Map(sites.map(feature => [text(feature.properties.fid),feature]));
  const contextById = new Map(contexts.map(feature => [text(feature.properties.fid),feature]));
  const groups = new Map();
  const byFid = new Map();
  for (const sample of samples) {
    const p = sample.properties || {};
    const fid = text(p.fid);
    if (!/^\d+$/.test(fid)) continue;
    const context = contextById.get(text(p.context_id)) || siteById.get(text(p.context_id)) || null;
    let parent = text(context?.properties?.parent_id);
    let site = siteById.get(parent) || null;
    const visited = new Set();
    while (!site && parent && contextById.has(parent) && !visited.has(parent)) {
      visited.add(parent);
      parent = text(contextById.get(parent).properties.parent_id);
      site = siteById.get(parent) || null;
    }
    site ||= siteById.get(text(p.parent_context_id)) || siteById.get(text(p.context_id)) || null;
    if (!site && context?.properties.site_id != null) {
      const candidates = sites.filter(feature => feature.properties.site_id != null && text(feature.properties.site_id) === text(context.properties.site_id));
      if (candidates.length === 1) site = candidates[0];
    }
    const cp = context?.properties || {};
    const siteName = text(site?.properties.name || site?.properties.site_name_brain || cp.site_name_brain || cp.parent_context) || 'Site not recorded';
    const siteKey = site ? `site:${site.properties.fid}` : `unlinked:${cp.parent_id ?? p.parent_context_id ?? normal(siteName)}`;
    if (!groups.has(siteKey)) groups.set(siteKey,{key:siteKey,feature:site,name:siteName,contexts:new Map(),total:0});
    const group = groups.get(siteKey);
    const contextKey = text(p.context_id) || `label:${normal(p.context)}`;
    if (!group.contexts.has(contextKey)) group.contexts.set(contextKey,{
      key:contextKey,feature:context,name:text(cp.context_name || cp.name || p.context) || 'Context not recorded',records:[]
    });
    const branch = group.contexts.get(contextKey);
    const record = {fid,feature:sample,context,site,taxon:text(p.precise_taxon || p.taxon || p.species_orig_pub) || 'Unidentified taxon',id:text(p.id ?? p.fid)};
    record.search = normal([group.name,branch.name,record.taxon,record.id,`fid ${fid}`,p.sample_number,p.Family].join(' '));
    branch.records.push(record);
    group.total++;
    byFid.set(fid,record);
  }
  const result = [...groups.values()].sort((a,b) => collator.compare(a.name,b.name));
  for (const group of result) {
    group.contexts = [...group.contexts.values()].sort((a,b) => collator.compare(a.name,b.name));
    for (const context of group.contexts) context.records.sort((a,b) => collator.compare(a.taxon,b.taxon) || collator.compare(a.id,b.id));
  }
  return {groups:result,byFid};
}

export function mountOccurrenceBrowser(index, {onSelect,hrefFor}) {
  const tree = document.querySelector('#occurrence-tree');
  const search = document.querySelector('#occurrence-search');
  const counter = document.querySelector('#occurrence-count');
  const toggle = document.querySelector('#occurrence-sidebar-toggle');
  const layout = document.querySelector('.occurrence-layout');
  const content = document.querySelector('#occurrence-sidebar-content');
  let active = '';
  function collapsed(value) {
    layout.classList.toggle('is-collapsed',value);
    content.hidden = value;
    toggle.setAttribute('aria-expanded',String(!value));
    const label = value ? 'Show occurrence list' : 'Collapse occurrence list';
    toggle.setAttribute('aria-label',label);
    toggle.title = label;
  }
  collapsed(window.matchMedia('(max-width: 740px)').matches);
  toggle.addEventListener('click',() => collapsed(!layout.classList.contains('is-collapsed')));
  function setActive(fid) {
    active = text(fid);
    for (const link of tree.querySelectorAll('a[data-occurrence-fid]')) {
      if (link.dataset.occurrenceFid === active) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
  }
  function recordLink(record) {
    const link = el('a','occurrence-item');
    link.href = hrefFor(record.fid);
    link.dataset.occurrenceFid = record.fid;
    if (record.fid === active) link.setAttribute('aria-current','page');
    link.append(el('span','occurrence-item-name',record.taxon),el('small','',`Occurrence ${record.id} · FID ${record.fid}`));
    link.addEventListener('click',event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onSelect(record.fid);
      setActive(record.fid);
      if (window.matchMedia('(max-width: 740px)').matches) collapsed(true);
    });
    return link;
  }
  function accordion(name,count,kind,fill) {
    const details = el('details',`occurrence-${kind}`);
    const summary = el('summary','');
    summary.append(el('span','occurrence-branch-name',name),el('span','occurrence-branch-count',String(count)));
    const children = el('div','occurrence-branch');
    details.append(summary,children);
    let populated = false;
    details.addEventListener('toggle',() => {
      if (details.open && !populated) { fill(children); populated = true; }
    });
    return details;
  }
  function render() {
    const words = normal(search.value).split(/\s+/).filter(Boolean);
    const filtered = index.groups.map(group => ({...group,contexts:group.contexts.map(context => ({...context,records:context.records.filter(record => words.every(word => record.search.includes(word)))})).filter(context => context.records.length)})).filter(group => group.contexts.length);
    const total = filtered.reduce((sum,group) => sum + group.contexts.reduce((n,context) => n + context.records.length,0),0);
    counter.textContent = `${filtered.length} ${filtered.length === 1 ? 'site' : 'sites'} · ${total.toLocaleString('en')} ${total === 1 ? 'occurrence' : 'occurrences'}`;
    tree.replaceChildren(...filtered.map(group => accordion(group.name,group.contexts.reduce((n,context) => n + context.records.length,0),'site',children => {
      children.append(...group.contexts.map(context => accordion(context.name,context.records.length,'context',list => list.append(...context.records.map(recordLink)))));
    })));
    if (!filtered.length) tree.append(el('p','occurrence-no-results','No matching occurrences. Try another site, context, taxon or ID.'));
  }
  search.addEventListener('input',render);
  render();
  return {setActive};
}
