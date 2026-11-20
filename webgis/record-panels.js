import { getPath } from '../path_utils.js';
import { normaliseCategory } from '../assets/record-vocabulary.js';
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = new URL('./css/record-panels.css', import.meta.url).href;
document.head.append(css);
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const text = v => String(v ?? '').trim();
export function icon(name) {
 const paths = {pin:'M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Z M12 7v4',layers:'m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5',book:'M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3V4Zm9 2v15',leaf:'M5 20 17 6M5 16C2 5 12 3 20 3c0 10-4 17-12 15',info:'M12 11v6M12 7v1 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'};
 return `<span class="rp-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.info}"/></svg></span>`;
}
export const heading = (name, sym) => `<h3 class="rp-heading">${icon(sym)}${esc(name)}</h3>`;
export const chips = (...values) => [...new Set(values.filter(v=>text(v)))].map(v=>`<span class="rp-chip">${esc(v)}</span>`).join('');
export const fields = rows => `<dl class="rp-fields">${rows.filter(([,v])=>text(v)).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
export function overview(raw) {
 const s=text(raw); const m=/bibliography\s*:/i.exec(s);
 return {body:m?s.slice(0,m.index).trim():s,refs:m?s.slice(m.index+m[0].length).trim():''};
}
export function description(raw) {
 const content=text(raw); if(!content) return '<p class="rp-muted">No description recorded.</p>';
 const paragraphs=content.split(/\n\s*\n/); const first=paragraphs.shift();
 // Full text remains accessible in the same panel, including one very long paragraph.
 const cut=first.length>650?first.lastIndexOf(' ',650):-1;
 const start=cut>0?first.slice(0,cut):first;
 const rest=[cut>0?first.slice(cut):'',...paragraphs].filter(Boolean);
 return `<p class="rp-overview">${esc(start)}</p>${rest.length?`<details class="rp-details"><summary>Read the complete overview</summary>${rest.map(p=>`<p class="rp-overview">${esc(p)}</p>`).join('')}</details>`:''}`;
}
export function references(...raw) {
 const entries=[...new Set(raw.map(text).filter(Boolean))];
 return `<details class="rp-details rp-references"><summary>${icon('book')}Source references</summary>${entries.length?entries.map(x=>`<p class="rp-overview">${esc(x)}</p>`).join(''):'<p>No references recorded.</p>'}</details>`;
}
export function numericAmount(p) {
 for(const v of [p.qt,p.quantity]) {
  if(v===null || v===undefined || !text(v)) continue;
  const n=Number(text(v).replace(',','.'));
  if(Number.isFinite(n)&&n>=0) return n;
 }
 return null;
}
export function presencePanel(feature, samples) {
 const p=feature.properties || {}; const panel=document.createElement('div'); panel.className='rp-context';
 const groups=new Map();
 for(const s of samples) {const key=text(s.properties?.context)||'Unlabelled records'; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
 const taxa=new Set(samples.map(s=>text(s.properties?.precise_taxon||s.properties?.taxon)||'Unidentified taxon'));
 const numeric=samples.filter(s=>numericAmount(s.properties||{})!==null).length;
 const note=overview(p.c_notes);
 panel.innerHTML=`<div class="rp-chips">${chips(normaliseCategory('typology',p.typology),p.chronology_iccd,'Presence records',p.c_appr!=null?'Reliability '+p.c_appr:'')}</div>
 <div class="rp-stats">${[[samples.length,'occurrence records'],[taxa.size,'distinct taxa'],[groups.size,'record groups'],[numeric,'records with numeric quantity']].map(([n,l])=>`<div><strong>${n}</strong><span>${l}</span></div>`).join('')}</div>
 <div class="rp-context-grid"><section class="rp-card">${heading('About this context','book')}${description(note.body)}</section>
 <section class="rp-card">${heading('Context details','info')}${fields([['Part of',p.parent_context||p.site_name_brain],['Region / province',[p.region,p.province].filter(Boolean).join(' · ')],['Date as recorded',p.chron_orig],['Broader period',p.parent_chronology_iccd],['Context ID',p.fid],['BRAIN code',p.site_code]])}</section></div>
 <section class="rp-card rp-remains">${heading('Recorded remains','leaf')}<div class="rp-remain-controls"><p class="rp-muted">Occurrence records by source group. ${numeric} of ${samples.length} records have a numeric quantity; no quantitative proportions are inferred.</p><button type="button" class="rp-button rp-group">Combine groups</button></div><div class="rp-group-list"></div></section>${references(note.refs,p.bibliography)}`;
 const list=panel.querySelector('.rp-group-list'); let combined=false;
 function render() {
  list.replaceChildren();
  for(const [key,records] of combined?new Map([['All records',samples]]):groups) {
   const detail=document.createElement('details'); detail.className='rp-source-group';
   const distinct=new Set(records.map(s=>text(s.properties?.precise_taxon||s.properties?.taxon)));
   detail.innerHTML=`<summary><span>${esc(key)}<small>${records.length} records · ${distinct.size} taxa</small></span><span class="rp-expand">See records</span></summary>`;
   const table=document.createElement('div');table.className='rp-table-wrap';
   table.innerHTML=`<table class="rp-records"><thead><tr><th>Taxon / sample</th><th>Remain type</th><th>Plant part</th><th>Preservation</th><th>Quantity</th><th>Entity</th></tr></thead><tbody>${records.map(s=>{const r=s.properties||{};return `<tr><td><a href="${getPath('webgis/record_object/record_object.html')}?fid=${encodeURIComponent(r.fid)}">${/aceae$/i.test(r.precise_taxon||r.taxon||'') ? esc(r.precise_taxon||r.taxon) : `<i>${esc(r.precise_taxon||r.taxon||'Unidentified taxon')}</i>`}<small>Sample ${esc(r.id??r.fid)}</small></a></td><td>${esc(normaliseCategory('s_type',r.s_type))}</td><td>${esc(normaliseCategory('s_part',r.s_part))}</td><td>${esc(normaliseCategory('s_foss',r.s_foss))}</td><td>${esc(numericAmount(r)??'Not recorded')}</td><td>${esc(text(r.entity)||'Not declared')}</td></tr>`;}).join('')}</tbody></table>`;
   detail.append(table); list.append(detail);
  }
 }
 panel.querySelector('.rp-group').onclick=e=>{combined=!combined;e.currentTarget.textContent=combined?'Show source groups':'Combine groups';render();}; render(); return panel;
}
export function dialogKeys(dialog,close) {
 const previous=document.activeElement;
 const onKey=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  if(e.key!=='Tab')return;
  const nodes=[...dialog.querySelectorAll('button,a[href],input,summary,[tabindex="0"]')].filter(n=>n.getClientRects().length&&!n.disabled);
  if(!nodes.length){e.preventDefault();dialog.focus();return;}
  if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}
  else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}
 };
 dialog.addEventListener('keydown',onKey);dialog.tabIndex=-1;dialog.focus();
 return ()=>{dialog.removeEventListener('keydown',onKey);if(previous?.isConnected)previous.focus();};
}
