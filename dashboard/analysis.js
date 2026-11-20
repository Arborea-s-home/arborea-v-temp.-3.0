import { NOT_RECORDED, normaliseBotanicalRecord, normaliseCategory, isQualifiedCategory } from '../assets/record-vocabulary.js';

const empty = value => value == null || String(value).trim() === '';
export const text = value => empty(value) ? '' : String(value).trim();
export const unique = values => [...new Set(values)];
export const MISSING = NOT_RECORDED;

function asExactNumber(value, pattern) {
  const match = text(value).match(pattern);
  if (!match) return null;
  const number = Number(match[1].replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

const countPattern = /^(\d+)(?:[.,]0+)?$/;
export function recordedCount(record) {
  const qt = asExactNumber(record.qt, countPattern);
  if (qt === null) return null;
  if (!empty(record.quantity) && asExactNumber(record.quantity, countPattern) !== qt) return null;
  if (!empty(record.entity) && asExactNumber(record.entity, countPattern) !== qt) return null;
  return qt;
}

export function recordedWeight(record) {
  return asExactNumber(record.weight_g, /^(\d+(?:[.,]\d+)?)\s*(?:g)?$/i);
}

function sourceSeries(source) {
  // Ignore the terminal page range of the structured citation. Keep all wording in the detail.
  if (/;/.test(source)) return '';
  return source.replace(/_\s*(?:pp?\.?\s*)?\d+(?:\s*[-–]\s*\d+)?$/i, '');
}

export function reportingProfile(record) {
  const source = sourceSeries(text(record.bibliography));
  const remain = text(record.s_type);
  const part = text(record.s_part);
  if (!source || !remain || !part || remain === MISSING || part === MISSING || /[,;\/]|\band\b/i.test(part)) return '';
  return JSON.stringify([remain, part, source]);
}

export function readCorpus(data) {
  const contexts = new Map(data.contexts.map(row => [row.fid, {
    ...row, typology: normaliseCategory('typology', row.typology), typologyQualifier: isQualifiedCategory(row.typology) ? row.typology : ''
  }]));
  const contextProfiles = new Map();
  for (const context of contexts.values()) {
    const chain = [];
    let current = context;
    while (current && !chain.includes(current)) {
      chain.push(current);
      current = contexts.get(current.parent);
    }
    const site = chain.find(item => item.type === 'macro');
    const catalogueName = chain.find(item => item.site)?.site;
    const region = chain.find(item => item.region)?.region;
    const province = chain.find(item => item.province)?.province;
    contextProfiles.set(context.fid, {
      context_id: context.fid, linked: true, ancestry: chain.map(item => item.fid), ancestorNames: Object.fromEntries(chain.map(item=>[item.fid,item.name])),
      siteKey: site ? String(site.fid) : catalogueName ? `name:${catalogueName}` : '',
      siteLabel: site?.name || catalogueName || MISSING,
      contextLabel: context.name || MISSING,
      region, province,
      siteRegion: site?.region || region, siteProvince: site?.province || province,
      typology: context.typology, typologyQualifier: context.typologyQualifier, periods: context.periods ?? []
    });
  }
  const samples = data.samples.map(row => {
    const context = contextProfiles.get(row.context_id) ?? {
      linked: false, ancestry: [], siteKey: '', siteLabel: MISSING,
      contextLabel: text(row.context) || MISSING, typology: MISSING, periods: []
    };
    const botanical = normaliseBotanicalRecord(row);
    return {
      ...row, ...context, ...botanical,
      doubtful: Boolean(context.typologyQualifier || Object.keys(botanical.categoryQualifiers).length),
      taxonLabel: text(row.taxon) || text(row.species_orig_pub) || MISSING,
      count: recordedCount(row), weight: recordedWeight(row),
      profile: reportingProfile({ ...botanical, bibliography: row.bibliography })
    };
  });
  return { ...data, contexts, contextProfiles, samples, sampleIndex: new Map(samples.map(row => [row.fid, row])) };
}

export function fitsSelection(record, item, descendants) {
  switch (item.kind) {
    case 'context': return descendants ? record.ancestry.includes(Number(item.key)) : String(record.context_id) === item.key;
    case 'typology': return record.typology === item.key;
    case 'site': return record.siteKey === item.key;
    case 'taxon': return record.taxonLabel === item.key;
    case 'family': return text(record.family) === item.key;
    case 'category': return text(record.category) === item.key;
    default: return false;
  }
}

export const distinctContexts = records => new Set(records.filter(r => r.linked).map(r => r.context_id)).size;
export const distinctRecords = groups => [...new Map(groups.flatMap(g => g.records.map(r => [r.fid, r]))).values()];

export function measurement(measure, profile, records, fullOnly) {
  if (measure === 'contexts') return { numeric: () => null, eligible: () => false, value: distinctContexts };
  const key = measure === 'quantity' ? 'count' : 'weight';
  const numeric = record => profile && profile === record.profile ? record[key] : null;
  const incomplete = new Set(records.filter(record => numeric(record) === null).map(record => record.context_id));
  const eligible = record => numeric(record) !== null && (!fullOnly || (record.linked && !incomplete.has(record.context_id)));
  const value = records => {
    const values = records.filter(eligible).map(numeric);
    return values.length ? values.reduce((sum, n) => sum + n, 0) : null;
  };
  return { numeric, eligible, value };
}

export function documentedValues(records) {
  const values = unique(records.flatMap(record => {
    const parts = unique([text(record.quantity), text(record.entity), text(record.weight_g)].filter(Boolean));
    return parts.length ? parts : record.qt == null ? [] : [String(record.qt)];
  }));
  return values;
}
