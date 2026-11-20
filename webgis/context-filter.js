const normalize = value => String(value ?? '').toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu,'').trim();
const node = (tag, label) => Object.assign(document.createElement(tag), {textContent:label || ''});
const nameOf = (feature, kind) => String(feature.properties?.name || feature.properties?.context_name || feature.properties?.site_name_brain || `${kind} ${feature.properties?.fid ?? ''}`);
const matches = (value, query) => normalize(query).split(/\s+/).every(word => normalize(value).includes(word));

// Follow parent IDs first; a BRAIN site ID is only safe when it identifies one site.
export function buildSiteContextIndex(features, sites) {
  const groups = sites.map(feature => ({feature, name:nameOf(feature,'Site'), contexts:[]}));
  const byFid = new Map(groups.map(group => [String(group.feature.properties.fid),group]));
  const contextsByFid = new Map(features.map(feature => [String(feature.properties.fid),feature]));
  const unlinked = [];
  for (const feature of features) {
    const p = feature.properties || {};
    let parent = String(p.parent_id ?? '');
    const visited = new Set();
    while (!byFid.has(parent) && contextsByFid.has(parent) && !visited.has(parent)) {
      visited.add(parent);
      parent = String(contextsByFid.get(parent).properties.parent_id ?? '');
    }
    let group = byFid.get(parent);
    if (!group && p.site_id != null) {
      const candidates = groups.filter(entry => entry.feature.properties.site_id != null && String(entry.feature.properties.site_id) === String(p.site_id));
      if (candidates.length === 1) group = candidates[0];
    }
    if (!group && p.parent_context) {
      const candidates = groups.filter(entry => normalize(entry.name) === normalize(p.parent_context));
      if (candidates.length === 1) group = candidates[0];
    }
    (group ? group.contexts : unlinked).push(feature);
  }
  groups.sort((a,b) => a.name.localeCompare(b.name,'en'));
  if (unlinked.length) groups.push({feature:null, name:'Contexts without a linked site', contexts:unlinked});
  for (const group of groups) group.contexts.sort((a,b) => nameOf(a,'Context').localeCompare(nameOf(b,'Context'),'en'));
  return groups;
}

export function mountContextFilter(features, sites, onNavigate) {
  const groups = buildSiteContextIndex(features, sites);
  const root = node('div');
  root.className = 'map-context-search';
  const quick = Object.assign(node('input'), {type:'search',placeholder:'Find a site or context…'});
  quick.setAttribute('aria-label','Search sites and contexts');
  quick.setAttribute('aria-expanded','false');
  quick.setAttribute('aria-controls','map-site-quick-results');
  const open = Object.assign(node('button','Browse sites'), {type:'button'});
  const results = node('div');
  results.id = 'map-site-quick-results';
  results.className = 'map-context-quick-results';
  results.hidden = true;
  const dialog = node('dialog');
  dialog.className = 'map-context-dialog';
  dialog.setAttribute('aria-label','Find a site or context');
  const close = Object.assign(node('button','Close'), {type:'button',className:'map-context-dismiss'});
  close.addEventListener('click',() => dialog.close());
  const search = Object.assign(node('input'), {type:'search',placeholder:'Site, context or FID'});
  search.setAttribute('aria-label','Search site or context name or FID');
  const filters = node('div');
  filters.className = 'map-context-fields';
  filters.append(search);
  const selectors = {};
  const entries = groups.flatMap(group => [group.feature,...group.contexts].filter(Boolean));
  const location = (feature, key, group) => feature?.properties?.[key] || group?.feature?.properties?.[key] || '';
  for (const [key,label] of [['region','Region'],['province','Province']]) {
    const select = node('select');
    select.setAttribute('aria-label',label);
    selectors[key] = select;
    filters.append(select);
    select.addEventListener('change',() => { if (key === 'region') selectors.province.value = ''; populate(); renderModal(); });
  }
  function populate() {
    for (const [key,select] of Object.entries(selectors)) {
      const previous = select.value;
      const choices = [...new Set(entries.filter(feature => key !== 'province' || !selectors.region.value || feature.properties.region === selectors.region.value).map(feature => feature.properties[key]).filter(Boolean))].sort((a,b) => a.localeCompare(b,'en'));
      select.replaceChildren(new Option(key === 'region' ? 'All regions' : 'All provinces',''),...choices.map(value => new Option(value,value)));
      if (choices.includes(previous)) select.value = previous;
    }
  }
  const modalResults = node('div');
  modalResults.className = 'map-context-choices';
  const counter = node('p');
  counter.setAttribute('aria-live','polite');
  const more = Object.assign(node('button','Show more sites'), {type:'button'});
  const reset = Object.assign(node('button','Reset search'), {type:'button'});
  let limit = 40;
  let panelId = 0;
  function hideQuick() { results.hidden = true; quick.setAttribute('aria-expanded','false'); }
  function navigate(kind, feature, group) {
    hideQuick();
    if (dialog.open) dialog.close();
    quick.value = '';
    onNavigate({kind, feature, contexts:group.contexts});
  }
  function action(feature, kind, group) {
    const button = Object.assign(node('button'), {type:'button',className:'map-location-action'});
    button.dataset.recordKind = kind;
    button.dataset.recordFid = feature.properties.fid;
    button.append(node('span',nameOf(feature,kind === 'site' ? 'Site' : 'Context')));
    const details = [kind === 'site' ? 'Site' : 'Context',location(feature,'province',group),location(feature,'region',group),`FID ${feature.properties.fid}`].filter(Boolean);
    button.append(node('small',details.join(' · ')));
    button.addEventListener('click',() => navigate(kind,feature,group));
    return button;
  }
  function rows(query, geographic = false) {
    const allowed = (feature,group) => !geographic || Object.entries(selectors).every(([key,select]) => !select.value || location(feature,key,group) === select.value);
    const out = [];
    for (const group of groups) {
      const siteMatches = group.feature && allowed(group.feature,group) && matches(`${group.name} ${group.feature.properties.fid}`,query);
      const children = group.contexts.filter(feature => allowed(feature,group) && (siteMatches || matches(`${nameOf(feature,'Context')} ${group.name} ${feature.properties.fid}`,query)));
      if (siteMatches || children.length) out.push({group,children});
    }
    return out;
  }
  function siteRow({group,children}) {
    const article = node('article');
    article.className = 'map-location-site';
    const header = node('div');
    header.className = 'map-location-site-head';
    if (group.feature) header.append(action(group.feature,'site',group));
    else header.append(Object.assign(node('span',group.name),{className:'map-location-unlinked'}));
    const childrenBox = node('div');
    childrenBox.id = `map-location-children-${++panelId}`;
    childrenBox.className = 'map-location-children';
    childrenBox.hidden = true;
    if (children.length) {
      const expand = Object.assign(node('button'), {type:'button',className:'map-location-expand'});
      expand.setAttribute('aria-expanded','false');
      expand.setAttribute('aria-controls',childrenBox.id);
      expand.setAttribute('aria-label',`Show contexts for ${group.name}`);
      expand.append(node('span',String(children.length)),Object.assign(node('i'),{className:'map-location-chevron'}));
      expand.addEventListener('click',() => {
        const opening = childrenBox.hidden;
        childrenBox.hidden = !opening;
        expand.setAttribute('aria-expanded',String(opening));
        expand.setAttribute('aria-label',`${opening ? 'Hide' : 'Show'} contexts for ${group.name}`);
        if (opening && !childrenBox.childElementCount) childrenBox.append(...children.map(feature => action(feature,'context',group)));
      });
      header.append(expand);
    }
    article.append(header,childrenBox);
    return article;
  }
  function renderQuick() {
    const found = rows(quick.value);
    results.replaceChildren(...found.map(siteRow));
    if (!found.length) results.append(node('p','No matching sites or contexts.'));
    results.hidden = false;
    quick.setAttribute('aria-expanded','true');
  }
  function renderModal() {
    const found = rows(search.value,true);
    modalResults.replaceChildren(...found.slice(0,limit).map(siteRow));
    if (!found.length) modalResults.append(node('p','No matching sites or contexts.'));
    more.hidden = found.length <= limit;
    counter.textContent = `${found.filter(entry => entry.group.feature).length} sites · ${found.reduce((total,entry) => total + entry.children.length,0)} contexts`;
  }
  quick.addEventListener('focus',renderQuick);
  quick.addEventListener('input',renderQuick);
  quick.addEventListener('keydown',event => {
    if (event.key === 'Escape') hideQuick();
    if (event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus(); }
  });
  root.addEventListener('keydown',event => { if (event.key === 'Escape' && !dialog.open) hideQuick(); });
  document.addEventListener('pointerdown',event => { if (!root.contains(event.target)) hideQuick(); });
  root.addEventListener('focusout',event => { if (!root.contains(event.relatedTarget)) hideQuick(); });
  open.addEventListener('click',() => { hideQuick(); renderModal(); dialog.showModal(); search.focus(); });
  search.addEventListener('input',() => { limit = 40; renderModal(); });
  more.addEventListener('click',() => { limit += 40; renderModal(); });
  reset.addEventListener('click',() => {
    search.value = '';
    for (const select of Object.values(selectors)) select.value = '';
    limit = 40;
    populate();
    renderModal();
  });
  dialog.append(close,node('h2','Find a site or context'),node('p','Choose a site to open its record, or expand it to choose a context. The map keeps its current filters.'),filters,counter,modalResults,more,reset);
  root.append(quick,open,results,dialog);
  const header = document.querySelector('.sb-header');
  if (header) header.after(root);
  else document.querySelector('#dashboard').prepend(root);
  populate();
  return root;
}
