import { fitsSelection, MISSING, text } from './analysis.js';

const geography = ['region', 'province', 'site'];

export function filterValue(record, key) {
  if (key === 'site') return record.siteKey;
  if (key === 'region') return text(record.siteRegion || record.region) || MISSING;
  if (key === 'province') return text(record.siteProvince || record.province) || MISSING;
  return text(record[key]) || MISSING;
}

export function geographicalOptions(records, key, filters) {
  const parents = geography.slice(0, geography.indexOf(key));
  const choices = new Map();
  for (const row of records) {
    if (!parents.every(parent => !filters[parent] || filterValue(row, parent) === filters[parent])) continue;
    const value = filterValue(row, key);
    if (value) choices.set(value, key === 'site' ? row.siteLabel : value);
  }
  return choices;
}

export function reconcileGeography(records, filters) {
  for (const key of geography.slice(1)) {
    if (filters[key] && !geographicalOptions(records, key, filters).has(filters[key])) delete filters[key];
  }
}

export function exactRemains(row) {
  // Prefer the harmonised integer, with an exact source count as a fallback.
  if (row.count != null) return row.count;
  if (text(row.qt) || !/^(?:\d+)(?:[.,]0+)?$/.test(text(row.quantity))) return null;
  const value = Number(text(row.quantity).replace(',', '.'));
  if (!Number.isSafeInteger(value)) return null;
  if (text(row.entity) && !/^\d+(?:[.,]0+)?$/.test(text(row.entity))) return null;
  if (text(row.entity) && Number(text(row.entity).replace(',', '.')) !== value) return null;
  return value;
}

export function taxonMeasurement(measure) {
  const numeric = measure === 'quantity' ? exactRemains : row => row.weight;
  const eligible = row => measure !== 'contexts' && numeric(row) != null;
  return {
    numeric,
    eligible,
    value(records) {
      if (measure === 'contexts') return new Set(records.map(row => row.context_id)).size;
      const counted = records.filter(eligible);
      return counted.length ? counted.reduce((sum, row) => sum + numeric(row), 0) : null;
    }
  };
}

export function analyseTaxonGroups(scoped, groups, disjoint) {
  const byContext = new Map();
  for (const row of scoped) {
    if (!row.linked) continue;
    if (!byContext.has(row.context_id)) byContext.set(row.context_id, []);
    byContext.get(row.context_id).push(row);
  }
  const assigned = new Set();
  return groups.map(group => {
    const wants = row => group.items.some(item => fitsSelection(row, item, false));
    const contexts = new Map();
    const records = [];
    for (const [id, available] of byContext) {
      if (disjoint && assigned.has(id)) continue;
      const selected = available.filter(wants);
      if (!selected.length) continue;
      if (disjoint) assigned.add(id);
      const associates = available.filter(row => !wants(row) && row.taxonLabel !== MISSING);
      contexts.set(id, { id, context: selected[0], selected, associates });
      records.push(...selected);
    }
    return { ...group, records, contexts };
  });
}

export function associationResults(groups, key, quantitative) {
  const rows = new Map();
  const reporting = groups.map(group => ({ name: group.name, excluded: 0, partial: 0, noAssociates: 0, contexts: [] }));
  groups.forEach((group, index) => {
    const bins = new Map();
    const coverage = reporting[index];
    for (const context of group.contexts.values()) {
      if (!context.associates.length) {
        coverage.noAssociates++;
        continue;
      }
      if (quantitative) {
        const unknown = context.associates.filter(row => exactRemains(row) === null);
        if (unknown.length) {
          coverage.contexts.push({ ...context, unknown });
          if (unknown.length === context.associates.length) coverage.excluded++;
          else coverage.partial++;
        }
      }
      for (const row of context.associates) {
        const value = quantitative ? exactRemains(row) : 1;
        if (value === null) continue;
        const label = key === 'taxon' ? row.taxonLabel : text(row[key]) || MISSING;
        if (!bins.has(label)) bins.set(label, { ids: new Set(), count: 0, doubtful: false });
        const bin = bins.get(label);
        bin.ids.add(context.id);
        bin.doubtful ||= Boolean(row.categoryQualifiers?.[key]);
        bin.count += value;
      }
    }
    for (const [label, bin] of bins) {
      if (!rows.has(label)) rows.set(label, { label, values: groups.map(() => null) });
      rows.get(label).doubtful ||= bin.doubtful;
      rows.get(label).values[index] = quantitative ? bin.count : 100 * bin.ids.size / group.contexts.size;
    }
  });
  return { rows: [...rows.values()], reporting };
}

export function entityCell(records) {
  if (!records.length) return 'Absent';
  return [...new Set(records.map(row => text(row.entity) || 'Not declared'))].join(' · ');
}

export function contextShares(counts, denominator, groups) {
  return counts.map((count, i) => denominator && groups[i].items.length ? 100 * count / denominator : null);
}
