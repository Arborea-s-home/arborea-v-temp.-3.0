export const NOT_RECORDED = 'Not recorded';

const emptyTerms = new Set([
  '', '-', '—', 'n/a', 'n.a', 'n/d', 'n.d', 'na', 'nd', 'none', 'null',
  'not recorded', 'not reported', 'unknown', 'undefined', 'unspecified',
  'undetermined', 'indeterminate', 'undet', 'indet'
]);
const fold = value => String(value ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const isMissing = value => emptyTerms.has(value.replace(/\.+$/, ''));

function aliases(entries) {
  return new Map(entries.flatMap(([label, variants]) => variants.map(value => [value, label])));
}

const remainTypes = aliases([
  ['artefact', ['artifact', 'artifacts', 'artefacts']],
  ['fibre', ['fiber', 'fibres', 'fibers']],
  ['textile', ['textiles']]
]);

const plantParts = aliases([
  ['achene', ['achenes', 'achene (half)', 'achene (halfs)', 'achene (halves)', 'half achene']],
  ['acorn', ['acorns', 'acorn base', 'acorn bases', 'ghianda', 'ghiande']],
  ['artefact', ['artifact', 'artifacts', 'artefacts']],
  ['bud', ['buds']],
  ['branch', ['branches', 'young branches', 'small branches']],
  ['caryopsis', ['caryopses', 'caryopsis s', 'caryopsis (half)', 'caryopsis (halves)']],
  ['cone', ['cones', 'seed cone']],
  ['cone scale', ['cone scales', 'cone scale (unspecifieds)']],
  ['cotyledon', ['cotyledons']],
  ['endocarp', ['endocarps', 'edocarp']],
  ['exocarp', ['exocarps', 'epicarp']],
  ['fibre', ['fiber', 'fibres', 'fibers']],
  ['flower', ['flowers']],
  ['fruit', ['fruits', 'frutto', 'frutti', 'fruit (peponid)', 'fruit (pome)', 'fruits (pomes)', 'pome', 'pomes', 'syconium', 'berry', 'flesh of a grape']],
  ['fruit stone', ['fruit stones', 'pyrene']],
  ['glume', ['glumes']],
  ['glume base', ['glume bases', 'glumebases', 'glumebase', 'glume base fragment']],
  ['grain', ['grains', 'kernel', 'kernels']],
  ['half fragment', ['halves', 'healves']],
  ['leaf', ['leaves']],
  ['mericarp', ['mericalp', 'mericarps']],
  ['mesocarp', ['frammenti mesocarp', 'mesocarp fragment']],
  ['nut', ['nuts', 'nut (half)', 'nut (halves)', 'nutlets', 'nutlet']],
  ['pedicel', ['pedicels']],
  ['pericarp', ['pericalp', 'pericalpo', 'pericarps']],
  ['pip', ['pips']],
  ['rachis', ['rachises', 'rachid', 'rachis fragment', 'rachis fragments', 'rachis segment', 'rachis segments', 'rachis internode']],
  ['seed', ['seeds', 'seme', 'semi', 'seed (half)', 'seed (halves)', 'few seed', 'seeds and fragments', 'seed fragment', 'seed fragments', 'seed + healves']],
  ['spikelet', ['spikelets', 'spicklet', 'spicklets', 'spikelet base', 'spikelet bases', 'spikelet fork', 'spikelet forks', 'pseudomorph spikelet', 'fork']],
  ['stem', ['stems', 'fusto', 'pole', 'poles', 'stalk', 'stalks', 'culm', 'culm node', 'culm internode', 'culm node/internode', 'stubble']],
  ['chaff', ['pula']],
  ['nutshell', ['nut shell', 'nut-shell', 'nutshells']],
  ['seed coat', ['tegument', 'teguments', 'seed coats']],
  ['rind', ['peel', 'skin']],
  ['basal plate', ['basal plates']],
  ['tendril', ['tendrils']],
  ['thorn', ['thorns']],
  ['tunic', ['tunics']],
  [NOT_RECORDED, ['remain', 'remains', 'occurrence', 'sample']]
]);

const preservation = aliases([
  ['charring', ['charred', 'carbonisation', 'carbonization', 'carbonised', 'carbonized']],
  ['waterlogging', ['waterlogged', 'water-logged']],
  ['mineralisation', ['mineralization', 'mineralized', 'mineralised']],
  ['desiccation', ['desiccated']],
  ['mummification', ['mummified']],
  ['imprint', ['impression']],
  ['anaerobic conditions', ['anaerobic']]
]);

const contextTypes = aliases([
  ['sacred', ['secred', 'sacre']],
  ['settlement', ['settlment', 'settelment', 'settlemnt', 'settlements']],
  ['funerary', ['funerarial']],
  ['underwater', ['under-water', 'under water']],
  ['off-site', ['off site', 'offsite']]
]);

const dictionaries = {
  s_type: remainTypes,
  s_part: plantParts,
  s_foss: preservation,
  typology: contextTypes
};
const botanicalFields = ['s_type', 's_part', 's_foss'];
const ordered = values => [...new Set(values)].sort();
const combine = (value, parts, canon) => {
  const units = ordered(value.split(parts).filter(part => !isMissing(part.trim())).map(part => canon(part.trim())));
  return units.join(' / ') || NOT_RECORDED;
};

const qualifiers = /\?|\b(?:possible|possibly|probable|probably|partial|partially|uncertain|doubtful)\b/i;
export const isQualifiedCategory = value => qualifiers.test(fold(value));

export function normaliseCategory(field, value) {
  if (!Object.hasOwn(dictionaries, field)) return value;
  const label = fold(value).replace(/\?|\b(?:possible|possibly|probable|probably|partial|partially|uncertain|doubtful)\b/gi, '').replace(/\(\s*\)/g, '').trim().replace(/\s+/g, ' ');
  if (isMissing(label)) return NOT_RECORDED;
  const dictionary = dictionaries[field];
  const canon = key => dictionary.get(key) ?? key;
  if (field === 'typology') return combine(label, /\s*[,;/]\s*/, canon);
  if (field === 's_foss') return combine(label, /\s*[/+;,]\s*|\s+and\s+/, canon);
  if (field === 's_part') {
    const cleaned = label.replace(/\bspicklet(s?)\b/g, 'spikelet$1').replace(/\bglumebases\b/g, 'glume bases');
    const mapped = canon(cleaned);
    if (mapped !== cleaned) return mapped;
    // Keep mixed identifications and qualified parts together as one reported category.
    if (/[/,;+]|\band\b/.test(cleaned) && !/\bor\b/.test(cleaned)) {
      return combine(cleaned, /\s*[/,;+]\s*|\s+and\s+/, canon);
    }
    return cleaned;
  }
  return canon(label);
}

export function normaliseBotanicalRecord(record) {
  const qualifiers = { ...record.categoryQualifiers };
  for (const field of botanicalFields) {
    if (isQualifiedCategory(record[field])) qualifiers[field] = String(record[field]).trim();
  }
  return { ...Object.fromEntries(botanicalFields.map(field => [field, normaliseCategory(field, record[field])])), categoryQualifiers: qualifiers };
}

export function normaliseFeatures(data, specimen = false) {
  for (const feature of data.features) {
    const properties = feature.properties ??= {};
    if (specimen) Object.assign(properties, normaliseBotanicalRecord(properties));
    else properties.typology = normaliseCategory('typology', properties.typology);
  }
  return data;
}
