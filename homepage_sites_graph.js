// homepage_sites_graph.js
// Donut con drill-down Region → Province, tabella siti e link rapidi.
// Upgrade: pseudo-3D (extrusion) + shadow + gloss (specular) + inner shadow sul foro.
// UI: box scuro unico con header integrato (title + toggle + See all records) + body (grafico/lista).
// Fix: defer della ricostruzione chart fuori dalla pipeline eventi Chart.js (evita handleEvent undefined).

import { getPath } from "./path_utils.js";

/* =========================
   Utils colori (HSL/HEX) per shading
   ========================= */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function darkenColor(color, amount = 18) {
  if (!color || typeof color !== "string") return "rgba(0,0,0,0.25)";

  const hslMatch = color.match(/hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%/i);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    const nl = clamp(l - amount, 8, 85);
    return `hsl(${h} ${s}% ${nl}%)`;
  }

  const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const f = (x) => clamp(Math.round(x * (1 - amount / 100)), 0, 255);
    return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
  }

  return "rgba(0,0,0,0.28)";
}

/* =========================
   Chart.js plugins: shadow + extrusion + gloss + inner shadow
   ========================= */
function isDrawableArc(arc) {
  const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc;
  return [x, y, startAngle, endAngle, innerRadius, outerRadius].every(Number.isFinite)
    && innerRadius >= 0 && outerRadius > innerRadius && endAngle > startAngle;
}

const DonutShadowPlugin = {
  id: "donutShadow",
  beforeDatasetDraw(chart, _args, opts) {
    const o = opts || {};
    const ctx = chart.ctx;
    ctx.save();
    ctx.shadowColor = o.color ?? "rgba(0,0,0,0.35)";
    ctx.shadowBlur = o.blur ?? 18;
    ctx.shadowOffsetX = o.offsetX ?? 0;
    ctx.shadowOffsetY = o.offsetY ?? 10;
  },
  afterDatasetDraw(chart) {
    chart.ctx.restore();
  }
};

// pseudo-3D extrusion: disegna “spessore” sotto il dataset più esterno
const DonutExtrudePlugin = {
  id: "donutExtrude",
  beforeDatasetsDraw(chart, _args, opts) {
    let bestIdx = 0;
    let bestOuter = -Infinity;
    for (let i = 0; i < chart.data.datasets.length; i++) {
      const meta = chart.getDatasetMeta(i);
      const el = meta?.data?.find(isDrawableArc);
      const outer = el?.outerRadius ?? -Infinity;
      if (outer > bestOuter) {
        bestOuter = outer;
        bestIdx = i;
      }
    }
    chart.$_outerDsIndex = bestIdx;
    chart.$_extrudeOpts = opts || {};
  },
  beforeDatasetDraw(chart, args, _opts) {
    if (args.index !== chart.$_outerDsIndex) return;

    const opts = chart.$_extrudeOpts || {};
    const depth = clamp(opts.depth ?? 16, 0, 40);
    const steps = clamp(opts.steps ?? 14, 1, 80);
    const alpha = clamp(opts.alpha ?? 0.92, 0.05, 1);

    const arcs = chart.getDatasetMeta(args.index)?.data?.filter(isDrawableArc);
    if (!arcs?.length) return;

    const ctx = chart.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (let s = steps; s >= 1; s--) {
      const dy = (depth * s) / steps;

      arcs.forEach((arc) => {
        const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc;

        const baseColor = arc?.options?.backgroundColor;
        const shade = darkenColor(baseColor, 18 + (s * 10) / steps);
        ctx.fillStyle = shade;

        ctx.beginPath();
        ctx.arc(x, y + dy, outerRadius, startAngle, endAngle);
        ctx.arc(x, y + dy, innerRadius, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fill();
      });
    }

    ctx.restore();
  }
};

// gloss speculare: overlay “shine” per fetta (dataset più esterno)
const DonutGlossPlugin = {
  id: "donutGloss",
  afterDatasetsDraw(chart, _args, opts) {
    const o = opts || {};
    const idx = chart.$_outerDsIndex ?? 0;

    const arcs = chart.getDatasetMeta(idx)?.data?.filter(isDrawableArc);
    if (!arcs?.length) return;

    const ctx = chart.ctx;
    const strength = clamp(o.strength ?? 0.22, 0, 0.6);
    const mode = o.composite ?? "screen";

    ctx.save();
    ctx.globalCompositeOperation = mode;

    arcs.forEach((arc) => {
      const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, outerRadius, startAngle, endAngle);
      ctx.arc(x, y, innerRadius, endAngle, startAngle, true);
      ctx.closePath();
      ctx.clip();

      const g = ctx.createLinearGradient(
        x - outerRadius * 0.9,
        y - outerRadius * 0.9,
        x + outerRadius * 0.9,
        y + outerRadius * 0.9
      );
      g.addColorStop(0.0, `rgba(255,255,255,${strength})`);
      g.addColorStop(0.35, `rgba(255,255,255,${strength * 0.35})`);
      g.addColorStop(0.65, "rgba(255,255,255,0)");
      g.addColorStop(1.0, "rgba(255,255,255,0)");

      ctx.fillStyle = g;
      ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);

      ctx.restore();
    });

    ctx.restore();
  }
};

// inner shadow sul foro: “recessed look”
const DonutInnerShadowPlugin = {
  id: "donutInnerShadow",
  afterDatasetsDraw(chart, _args, opts) {
    const o = opts || {};
    const idx = chart.$_outerDsIndex ?? 0;

    const first = chart.getDatasetMeta(idx)?.data?.find(isDrawableArc);
    if (!first) return;

    const ctx = chart.ctx;
    const x = first.x;
    const y = first.y;
    const innerR = first.innerRadius;
    const outerR = first.outerRadius;

    const width = clamp(o.width ?? 16, 4, 40);
    const alpha = clamp(o.alpha ?? 0.35, 0, 1);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, outerR, 0, Math.PI * 2);
    ctx.arc(x, y, innerR, Math.PI * 2, 0, true);
    ctx.closePath();
    ctx.clip();

    const g = ctx.createRadialGradient(x, y, innerR, x, y, innerR + width);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.35})`);
    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, innerR + width, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
};

// Gli effetti sono locali ai due grafici a ciambella, così il grafico a barre
// dei popup (che usa lo stesso Chart.js) non riceve gli effetti per gli spicchi.
const SITE_DONUT_PLUGINS = [DonutShadowPlugin, DonutExtrudePlugin, DonutGlossPlugin, DonutInnerShadowPlugin];


// Chiavi uguali a quelle di siti.geojson. Gli abbinamenti non dipendono dai filtri.
const PROVINCES = {
  Ancona: ['AN', '#325d9c'],
  Arezzo: ['AR', '#73518b'],
  Campobasso: ['CB', '#446d68'],
  Chieti: ['CH', '#537146'],
  Firenze: ['FI', '#126149'],
  Frosinone: ['FR', '#a84b3a'],
  Grosseto: ['GR', '#af5237'],
  Isernia: ['IS', '#9b6413'],
  "L'Aquila": ['AQ', '#a84b3a'],
  Latina: ['LT', '#345d98'],
  Livorno: ['LI', '#356b9b'],
  Lucca: ['LU', '#177b6b'],
  Macerata: ['MC', '#406d4d'],
  'Massa Carrara': ['MS', '#865324'],
  Perugia: ['PG', '#137259'],
  'Pesaro Urbino': ['PU', '#996510'],
  Pescara: ['PE', '#315e91'],
  Pisa: ['PI', '#9b6413'],
  Pistoia: ['PT', '#4d618f'],
  Rieti: ['RI', '#496d43'],
  Roma: ['RM', '#126149'],
  Siena: ['SI', '#69783a'],
  Teramo: ['TE', '#996510'],
  Viterbo: ['VT', '#9b6413']
};

const REGION_COLORS = {
  Lazio: '#245849', Toscana: '#527d4e', Abruzzo: '#9b573d', Marche: '#39648a',
  Umbria: '#7e743c', Molise: '#795183'
};

const NO_REGION = 'Area non indicata';
const NO_PROVINCE = 'Provincia non indicata';

function provinceStyle(name) {
  if (PROVINCES[name]) return PROVINCES[name];
  if (name === NO_PROVINCE) return ['—', '#626e65'];
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const short = words.length > 1
    ? words.slice(0, 2).map(word => word[0]).join('')
    : name.slice(0, 2);
  const hue = [...name].reduce((sum, char) => (sum * 31 + char.codePointAt(0)) % 360, 0);
  return [short.toUpperCase(), 'hsl(' + hue + ' 42% 34%)'];
}

function byCount(items) {
  return [...items].sort(([nameA, a], [nameB, b]) => b.count - a.count || nameA.localeCompare(nameB, 'it'));
}

function searchKey(text) {
  return String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('it');
}

function recordPath(key, value) {
  return getPath('webgis/index.html?' + key + '=' + encodeURIComponent(value));
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function action(text, className, callback) {
  const button = node('button', className, text);
  button.type = 'button';
  button.addEventListener('click', callback);
  return button;
}

function link(text, key, value, label = text) {
  const arrow = text.endsWith('↗');
  const anchor = node('a', null, arrow ? text.slice(0, -1) : text);
  if (arrow) {
    const icon = node('span', 'atlas-link-arrow');
    icon.setAttribute('aria-hidden', 'true');
    anchor.append(icon);
  }
  anchor.href = recordPath(key, value);
  anchor.setAttribute('aria-label', label.replace('↗', '').trim());
  return anchor;
}

function buildIndex(sites) {
  const regions = new Map();
  for (const { properties: site } of sites) {
    const regionName = site.region || NO_REGION;
    const provinceName = site.province || NO_PROVINCE;
    if (!regions.has(regionName)) regions.set(regionName, { count: 0, provinces: new Map() });
    const region = regions.get(regionName);
    region.count++;
    if (!region.provinces.has(provinceName)) region.provinces.set(provinceName, { count: 0, sites: [] });
    const province = region.provinces.get(provinceName);
    province.count++;
    province.sites.push(site);
  }
  return regions;
}

export class SiteNavigator {
  constructor() {
    this.mode = 'chart';
    this.selection = { region: null, province: null };
    this.expanded = new Set();
    this.sites = [];
    this.index = new Map();
    this.query = '';
    this.listButton = document.getElementById('atlas-mode-list');
    this.chartButton = document.getElementById('atlas-mode-chart');
    this.listView = document.getElementById('atlas-list-view');
    this.list = document.getElementById('mapped-sites-container');
    this.distribution = document.getElementById('atlas-distribution');
    this.listButton.addEventListener('click', () => this.setMode('list'));
    this.chartButton.addEventListener('click', () => this.setMode('chart'));
    document.getElementById('atlas-site-search').addEventListener('input', event => {
      this.query = event.target.value.trim();
      this.renderList();
    });
    document.addEventListener('map:area-select', ({ detail }) => this.select(detail, false));
    this.distribution.textContent = 'Caricamento dei siti…';
  }

  setSites(sites) {
    this.sites = sites;
    this.index = buildIndex(sites);
    this.render();
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.render();
  }

  select({ region, province }, updateMap = true) {
    this.selection = { region, province };
    if (region) this.expanded.add(region);
    if (updateMap) window.mapManager.selectArea({
      region: region === NO_REGION ? null : region,
      province: province === NO_PROVINCE ? null : province
    });
    this.render();
  }

  render() {
    const focused = document.activeElement;
    const focusKey = focused?.dataset.atlasFocus;
    const focusInChart = this.distribution.contains(focused);
    const listMode = this.mode === 'list';
    this.listButton.setAttribute('aria-pressed', String(listMode));
    this.chartButton.setAttribute('aria-pressed', String(!listMode));
    this.listView.hidden = !listMode;
    this.distribution.hidden = listMode;

    clearTimeout(this.chartClickTimer);
    this.chart?.destroy();
    this.chart = null;
    if (listMode) this.renderList();
    else this.renderDistribution();

    if (focusKey) {
      const view = listMode ? this.list : this.distribution;
      const match = [...view.querySelectorAll('[data-atlas-focus]')].find(button => button.dataset.atlasFocus === focusKey);
      const fallback = focusInChart ? view.querySelector('.atlas-back') : null;
      (match ?? fallback)?.focus({ preventScroll: true });
    }
  }

  renderList() {
    this.list.replaceChildren();
    if (!this.sites.length) {
      this.list.append(node('p', 'atlas-empty', 'Nessun sito con questi filtri.'));
      return;
    }

    for (const [regionName, region] of byCount(this.index)) {
      const filtered = this.query ? this.findSites(regionName, region) : null;
      if (filtered && !filtered.size) continue;
      this.list.append(this.regionRow(regionName, region, filtered));
    }
    if (!this.list.childElementCount) this.list.append(node('p', 'atlas-empty', 'Nessun sito trovato.'));
  }

  findSites(regionName, region) {
    const query = searchKey(this.query);
    const matches = new Map();
    const matchesRegion = searchKey(regionName).includes(query);
    for (const [province, { sites }] of region.provinces) {
      const matchesProvince = searchKey(province).includes(query);
      const found = matchesRegion || matchesProvince ? sites : sites.filter(site =>
        searchKey([site.name, site.site_name_brain, site.site_code].filter(Boolean).join(' ')).includes(query)
      );
      if (found.length) matches.set(province, found);
    }
    return matches;
  }

  regionRow(regionName, region, filtered) {
    const row = node('section', 'atlas-region');
    const header = node('div', 'atlas-region-head');
    const selected = this.selection.region === regionName;
    const open = this.expanded.has(regionName);
    const regionButton = action(null, 'atlas-region-toggle', () => {
      if (open) {
        this.expanded.delete(regionName);
        if (selected) this.select({ region: null, province: null });
        else this.render();
      } else {
        this.select({ region: regionName, province: selected ? this.selection.province : null });
      }
    });
    regionButton.dataset.atlasFocus = 'region-' + regionName;
    regionButton.setAttribute('aria-expanded', String(open || !!filtered));
    const caret = node('span', null, open || filtered ? '⌄' : '›');
    caret.setAttribute('aria-hidden', 'true');
    regionButton.append(caret, node('span', null, regionName), node('span', 'atlas-region-count', region.count + ' siti'));
    header.append(regionButton);
    if (regionName !== NO_REGION) header.append(link('↗', 'region', regionName, 'Apri i siti di ' + regionName + ' nel WebGIS'));
    row.append(header);

    const bar = node('div', 'atlas-province-bar');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Province · ' + regionName);
    for (const [provinceName, province] of byCount(region.provinces)) {
      const [code, color] = provinceStyle(provinceName);
      const pressed = selected && this.selection.province === provinceName;
      const label = provinceName + ' · ' + province.count + ' siti';
      const button = action(code, null, () => this.select({ region: regionName, province: pressed ? null : provinceName }));
      button.dataset.atlasFocus = 'province-' + regionName + '-' + provinceName;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(pressed));
      button.style.setProperty('--province-color', color);
      button.style.setProperty('--size', province.count);
      bar.append(button);
    }
    row.append(bar);

    if (filtered) {
      for (const [province, sites] of filtered) row.append(this.siteList(province, sites));
    } else if (open && selected && this.selection.province && region.provinces.has(this.selection.province)) {
      const { province } = this.selection;
      row.append(this.siteList(province, region.provinces.get(province).sites));
    }
    return row;
  }

  siteList(province, sites) {
    const result = node('div', 'atlas-site-results');
    const title = node('h3');
    if (province === NO_PROVINCE) title.textContent = province;
    else title.append(link(province + ' ↗', 'province', province, 'Apri i siti della provincia di ' + province));
    const items = node('ul');
    for (const site of [...sites].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'))) {
      const li = node('li');
      const name = site.name || site.site_name_brain || 'Sito senza nome';
      if (site.fid == null) li.textContent = name;
      else li.append(link(name, 'fid', site.fid));
      items.append(li);
    }
    result.append(title, items);
    return result;
  }

  renderDistribution() {
    this.distribution.replaceChildren();
    const { region: regionName, province: provinceName } = this.selection;
    const region = this.index.get(regionName);

    if (regionName) {
      const back = action('← Regioni', 'atlas-back', () => this.select({ region: null, province: null }));
      back.dataset.atlasFocus = 'chart-back';
      this.distribution.append(back);
    }

    const heading = regionName ? regionName + ' · Province' : 'Distribuzione per regione';
    this.distribution.append(node('h2', null, heading));
    const items = byCount(regionName ? region?.provinces ?? [] : this.index);
    if (!items.length) {
      this.distribution.append(node('p', 'atlas-empty', 'Nessun sito con questi filtri.'));
      return;
    }
    const colors = items.map(([name]) => regionName ? provinceStyle(name)[1] : REGION_COLORS[name] ?? '#626e65');
    const province = region?.provinces.get(provinceName);
    const total = province?.count ?? region?.count ?? this.sites.length;

    const row = node('div', 'atlas-distribution-main');
    const frame = node('div', 'atlas-donut-wrap');
    const canvas = node('canvas');
    canvas.id = 'sites-pie';
    canvas.setAttribute('aria-hidden', 'true');
    const center = node('div', 'atlas-donut-center');
    center.append(node('strong', null, total), node('span', null, province ? provinceName : 'siti'));
    frame.append(canvas, center);
    row.append(frame);

    const legend = node('ul', 'atlas-donut-key');
    legend.setAttribute('aria-label', heading);
    items.forEach(([name, entry], i) => {
      const item = node('li');
      const button = action(null, null, () => this.choose(name, regionName));
      button.dataset.atlasFocus = 'chart-' + name;
      button.setAttribute('aria-label', name + ' · ' + entry.count + ' siti');
      if (regionName) button.setAttribute('aria-pressed', String(name === provinceName));
      const chip = node('i');
      chip.setAttribute('aria-hidden', 'true');
      chip.style.setProperty('--province-color', colors[i]);
      button.append(chip, node('span', null, name), node('b', null, entry.count));
      item.append(button);
      legend.append(item);
    });
    row.append(legend);
    this.distribution.append(row);

    const links = node('div', 'atlas-distribution-links');
    if (regionName && regionName !== NO_REGION) links.append(link('Apri scheda regionale ↗', 'region', regionName));
    if (province && provinceName !== NO_PROVINCE) links.append(link('Apri scheda provinciale ↗', 'province', provinceName));
    if (links.childElementCount) this.distribution.append(links);
    if (province) this.distribution.append(this.siteList(provinceName, province.sites));

    if (typeof window.Chart === 'function') this.drawDonut(canvas, items, colors, regionName, provinceName);
  }

  choose(name, regionName) {
    this.select(regionName ? { region: regionName, province: name } : { region: name, province: null });
  }

  openArea(name, regionName) {
    if (name === NO_REGION || name === NO_PROVINCE) {
      this.choose(name, regionName);
      return;
    }
    window.open(recordPath(regionName ? 'province' : 'region', name), '_blank', 'noopener');
  }

  drawDonut(canvas, items, colors, regionName, provinceName) {
    const names = items.map(([name]) => name);
    this.chart = new window.Chart(canvas, {
      type: 'doughnut',
      plugins: SITE_DONUT_PLUGINS,
      data: {
        labels: names,
        datasets: [{
          data: items.map(([, { count }]) => count),
          backgroundColor: colors,
          borderColor: '#f7f7f2',
          borderWidth: 2,
          hoverOffset: 7,
          offset: names.map(name => name === provinceName ? 9 : 0)
        }]
      },
      options: {
        cutout: '52%',
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 9 },
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 330 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ({ label, parsed }) => label + ': ' + parsed + ' siti' } },
          donutShadow: { blur: 8, offsetY: 4, color: 'rgba(32,45,41,.24)' },
          donutExtrude: { depth: 4, steps: 4, alpha: .6 },
          donutGloss: { strength: .19, composite: 'screen' },
          donutInnerShadow: { width: 6, alpha: .21 }
        },
        onClick: (event, elements) => {
          const name = names[elements[0]?.index];
          if (!name) return;
          clearTimeout(this.chartClickTimer);
          if (event.native?.ctrlKey || event.native?.metaKey) {
            this.openArea(name, regionName);
          } else {
            this.chartClickTimer = setTimeout(() => this.choose(name, regionName), 300);
          }
        }
      }
    });
    canvas.addEventListener('dblclick', event => {
      clearTimeout(this.chartClickTimer);
      const points = this.chart?.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true) ?? [];
      const name = names[points[0]?.index];
      if (name) this.openArea(name, regionName);
    });
  }
}
