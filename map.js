import { createPopupContent } from './popup.js';
import { getPath } from './path_utils.js';
import { addBaseMap } from './basemap.js';

const MAP_COLORS = ['#dbe6d3', '#c5d6bb', '#abc49f', '#88aa78', '#5e8654'];
// Ancore nel corpo principale di ogni regione, indipendenti da isole e punte del confine.
const REGION_LABEL_ANCHORS = new Map([
  ['Toscana', [43.45, 11.13]],
  ['Umbria', [42.96, 12.48]],
  ['Marche', [43.35, 13.17]],
  ['Lazio', [41.98, 12.55]],
  ['Abruzzo', [42.23, 13.80]],
  ['Molise', [41.68, 14.60]]
]);

function normalizeTypes(typology) {
  return [...new Set(String(typology ?? '').split(/[,;]/).map(value => {
    const key = value.trim().toLowerCase().replace(/\.+$/, '');
    return key === 'settlment' ? 'settlement' : key;
  }).filter(Boolean))];
}

async function readData(path, format) {
  const response = await fetch(getPath(path));
  if (!response.ok) throw new Error(path + ': HTTP ' + response.status);
  return format === 'json' ? response.json() : response.text();
}

class MapManager {
  constructor() {
    this.map = L.map('map').setView([42.4, 12.4], 7);
    this.currentFields = null;
    this.activeBoundary = 'region';
    this.includeUndated = false;
    this.selection = { region: null, province: null };
    addBaseMap(this.map);

    // Ordine fasi (con accorpamenti richiesti)
    this.PHASES = [
      "Mesolitico",
      "Eneolitico",
      "Neolitico",
      "Età del Bronzo",
      "Età del Ferro / Villanoviano",
      "Periodo Etrusco / Orientalizzante",
      "Periodo Arcaico (Roma)",
      "Periodo Repubblicano (Roma)",
      "Periodo Imperiale (Roma)",
      "Tarda Antichità",
      "Medioevo",
      "Rinascimento",
      "Periodo Moderno",
      "Età contemporanea"
    ];

    // Normalizzatore per stringhe fase
    this.phaseSlug = (s) => s
      ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g,"")
      : "";

    // Lookup raw → fase standard (include alias/accorpamenti)
    this.phaseLookup = new Map();
    const aliases = {
      "etadelferro": "Età del Ferro / Villanoviano",
      "villanoviano": "Età del Ferro / Villanoviano",
      "periodoetrusco": "Periodo Etrusco / Orientalizzante",
      "periodoorientalizzante": "Periodo Etrusco / Orientalizzante",
      "mesolito": "Mesolitico" // tollera refuso
    };
    this.PHASES.forEach(p => this.phaseLookup.set(this.phaseSlug(p), p));
    Object.entries(aliases).forEach(([k,v]) => this.phaseLookup.set(k, v));

    // Range cronologico corrente (indici inclusivi). Default: tutto
    this.chronoFrom = 0;
    this.chronoTo = this.PHASES.length - 1;

    if ('ResizeObserver' in window) {
      this.mapResize = new ResizeObserver(() => this.map.invalidateSize({ pan: false }));
      this.mapResize.observe(this.map.getContainer());
    }
    this.setupBoundaryButtons();
  }

  async loadData() {
    const [sites, regions, provinces, explanation] = await Promise.all([
      readData('data/siti.geojson', 'json'),
      readData('data/regions.geojson', 'json'),
      readData('data/provinces.geojson', 'json'),
      readData('data/spiegazione_dati.csv', 'text')
    ]);

    this.sitiFeatures = sites.features;
    this.regionsGeoJSON = regions;
    this.provincesGeoJSON = provinces;
    this.fieldDefinitions = Papa.parse(explanation, { header: true, skipEmptyLines: 'greedy' }).data;
    window.labelMap = Object.fromEntries(this.fieldDefinitions
      .filter(row => row.DENOMINAZIONE && row.ID)
      .map(row => [row.DENOMINAZIONE.trim(), row.ID.trim()]));

    this.regionByProvince = new Map();
    this.sitiFeatures.forEach(site => {
      const p = site.properties;
      const raw = p.parent_chronology_iccd;
      const phases = typeof raw === 'string' ? raw.split(';') : [];
      p._phasesNormalized = new Set(phases
        .map(phase => this.phaseLookup.get(this.phaseSlug(phase.trim())))
        .filter(Boolean));
      p._atlasTypes = normalizeTypes(p.typology);
      if (p.region && p.province) this.regionByProvince.set(p.province, p.region);
    });

    document.dispatchEvent(new CustomEvent('map:data-ready'));
    if (!this.geojsonLayer) this.updateMap();
  }

  passesType(site) {
    return this.currentFields === null || site.properties._atlasTypes.some(type => this.currentFields.includes(type));
  }

  setChronoSelectionByIndices(from, to) {
    this.chronoFrom = Math.min(from, to);
    this.chronoTo = Math.max(from, to);
    this.updateMap();
  }

  setIncludeUndated(include) {
    this.includeUndated = include;
    this.updateMap();
  }

  computePhaseCounts() {
    const counts = this.PHASES.map(() => 0);
    for (const site of this.sitiFeatures || []) {
      if (!this.passesType(site)) continue;
      for (const phase of site.properties._phasesNormalized) {
        counts[this.PHASES.indexOf(phase)]++;
      }
    }
    return counts;
  }

  updateMap(fields = this.currentFields) {
    this.currentFields = fields;
    if (!this.sitiFeatures) return;

    const phases = new Set(this.PHASES.slice(this.chronoFrom, this.chronoTo + 1));
    const inPeriod = this.sitiFeatures.filter(site => {
      const sitePhases = site.properties._phasesNormalized;
      return sitePhases.size ? [...sitePhases].some(phase => phases.has(phase)) : this.includeUndated;
    });
    const results = inPeriod.filter(site => this.passesType(site));
    this.countsByArea = Object.create(null);
    const typeCounts = new Map();
    for (const site of inPeriod) {
      const p = site.properties;
      const name = p[this.activeBoundary];
      for (const type of p._atlasTypes) {
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        if (name) {
          const counts = this.countsByArea[name] ??= Object.create(null);
          counts[type] = (counts[type] || 0) + 1;
        }
      }
    }

    const totals = new Map();
    for (const site of results) {
      const name = site.properties[this.activeBoundary];
      if (name) totals.set(name, (totals.get(name) || 0) + 1);
    }
    this.renderAreas(totals);
    document.dispatchEvent(new CustomEvent('map:results-change', { detail: { typeCounts, results } }));
  }

  renderAreas(totals) {
    const geojson = this.activeBoundary === 'province' ? this.provincesGeoJSON : this.regionsGeoJSON;
    const ranges = geojson.features.map(feature => totals.get(feature.properties.name) || 0).filter(Boolean);
    const min = ranges.length ? Math.min(...ranges) : 0;
    const max = ranges.length ? Math.max(...ranges) : 0;
    const typeFields = this.currentFields ?? Object.keys(window.labelMap);
    const style = ({ properties: { name } }) => {
      const selected = this.isSelectedArea(name);
      return {
        fillColor: this.getColor(totals.get(name) || 0, min, max),
        fillOpacity: .78,
        color: selected ? '#bc5a38' : '#667f61',
        weight: selected ? 2.3 : .8,
        opacity: selected ? 1 : .85
      };
    };
    if (this.geojsonLayer) this.map.removeLayer(this.geojsonLayer);
    this.areaStyle = style;
    this.geojsonLayer = L.geoJSON(geojson, {
      filter: ({ properties: { name } }) => totals.has(name),
      style,
      onEachFeature: (feature, layer) => {
        if (this.activeBoundary === 'region') {
          const label = document.createElement('span');
          const name = feature.properties.name;
          label.textContent = name;
          layer.bindTooltip(label, { permanent: true, direction: 'center', className: 'atlas-map-label' });
          layer.on('add', () => {
            const position = REGION_LABEL_ANCHORS.get(name) ?? layer.getBounds().getCenter();
            layer.getTooltip().setLatLng(position);
          });
        }
        this.bindPopupArea(feature, layer, typeFields);
        layer.on('click', () => {
          const name = feature.properties.name;
          const selection = this.activeBoundary === 'region'
            ? { region: name, province: null }
            : { region: this.regionByProvince.get(name) ?? null, province: name };
          this.selectArea(selection);
          document.dispatchEvent(new CustomEvent('map:area-select', { detail: selection }));
        });
      }
    }).addTo(this.map);
    this.selectArea(this.selection);
    this.updateLegend(min, max);
  }

  isSelectedArea(name) {
    const { region, province } = this.selection;
    if (this.activeBoundary === 'region') return !!region && name === region;
    return province ? name === province : !!region && this.regionByProvince.get(name) === region;
  }

  selectArea(selection) {
    this.selection = selection;
    if (!this.geojsonLayer) return;
    this.geojsonLayer.eachLayer(layer => {
      layer.setStyle(this.areaStyle(layer.feature));
      if (this.isSelectedArea(layer.feature.properties.name)) layer.bringToFront();
    });
  }

  bindPopupArea(feature, layer, selectedFields) {
    const name = feature.properties.name;
    const rowData = {};

    selectedFields.forEach(field => {
      rowData[field] = this.countsByArea[name]?.[field] || 0;
    });

    const popupContent = createPopupContent({
      rawName: name,
      fieldsArray: selectedFields,
      rowData,
      dataSource: this.countsByArea,
      group: this.activeBoundary   // 'region' oppure 'province'
    });

    const mapSize = this.map.getSize();
    const popupWidth = Math.max(1, Math.min(480, mapSize.x - 54));
    layer.bindPopup(popupContent.element ?? popupContent, {
      className: 'homepage-area-popup',
      maxWidth: popupWidth,
      minWidth: Math.min(260, popupWidth),
      maxHeight: Math.min(420, Math.max(120, Math.floor(mapSize.y * 0.72)))
    });
    if (typeof popupContent.showChart === 'function') {
      layer.on('popupopen', popupContent.showChart);
      layer.on('popupclose', popupContent.hideChart);
    }
  }

  getColor(value, min, max) {
    if (max === min) return MAP_COLORS[2];
    const ratio = (value - min) / (max - min);
    return MAP_COLORS[Math.min(MAP_COLORS.length - 1, Math.floor(ratio * MAP_COLORS.length))];
  }

  updateLegend(min, max) {
    document.getElementById('atlas-legend-title').textContent =
      this.activeBoundary === 'province' ? 'Siti per provincia' : 'Siti per regione';
    document.getElementById('min-val').textContent = min;
    document.getElementById('max-val').textContent = max;
    document.querySelectorAll('#gradient-bar span').forEach((swatch, index) => {
      swatch.style.setProperty('--sample-color', MAP_COLORS[index]);
    });
    const status = document.getElementById('atlas-map-status');
    status.textContent = max ? '' : 'Nessun sito mappabile con questi filtri.';
    status.hidden = max > 0;
  }

  setupBoundaryButtons() {
    const buttons = document.querySelectorAll('[data-boundary]');
    buttons.forEach(button => button.addEventListener('click', () => {
      if (this.activeBoundary === button.dataset.boundary) return;
      this.activeBoundary = button.dataset.boundary;
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      this.updateMap();
    }));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.mapManager = new MapManager();
  window.mapManager.loadData().catch(error => {
    const status = document.getElementById('atlas-map-status');
    status.textContent = 'Impossibile caricare la cartografia. Ricarica la pagina per riprovare.';
    status.hidden = false;
    document.getElementById('atlas-count-caption').textContent = 'Dati non disponibili';
    console.error('ARBOREA: caricamento della mappa', error);
  });
});
