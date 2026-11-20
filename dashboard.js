import { getPath } from './path_utils.js';
import { Tutorial } from './tutorial.js?v=20261118';
import { SiteNavigator } from './homepage_sites_graph.js?v=20261118';

const TYPE_LABELS = {
  settlement: 'Insediamenti',
  funerary: 'Funerari',
  sacred: 'Sacri',
  underwater: 'Subacquei',
  undet: 'Indeterminati'
};

function openTutorial() {
  if (!document.querySelector('.tutorial-overlay')) new Tutorial();
}

class Dashboard {
  constructor() {
    this.selectedFields = new Set();
    this.typeButtons = new Map();
    this.navigator = new SiteNavigator();
    document.getElementById('atlas-webgis').href = getPath('webgis/index.html?all=1');
    document.getElementById('atlas-guide').addEventListener('click', openTutorial);
    this.createFooter();

    document.addEventListener('map:results-change', ({ detail }) => this.updateResults(detail));
    document.addEventListener('map:data-ready', () => this.initFilters(), { once: true });
  }

  initFilters() {
    const definitions = window.mapManager.fieldDefinitions
      .filter(row => row.ambito?.trim().toLowerCase() === 'context type' && row.DENOMINAZIONE?.trim());
    const fields = [...new Set(definitions.map(row => row.DENOMINAZIONE.trim()))];
    const preferred = Object.keys(TYPE_LABELS);
    const ordered = [...preferred.filter(field => fields.includes(field)), ...fields.filter(field => !preferred.includes(field))];
    const container = document.getElementById('ambito-buttons');

    ordered.forEach(field => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'atlas-filter';
      button.dataset.field = field;
      button.setAttribute('aria-pressed', 'true');
      const name = document.createElement('span');
      name.textContent = TYPE_LABELS[field] ?? field;
      const count = document.createElement('span');
      count.className = 'atlas-filter-count';
      button.append(name, count);
      container.append(button);
      this.typeButtons.set(field, { button, count });
      this.selectedFields.add(field);

      button.addEventListener('click', () => {
        if (this.selectedFields.has(field)) this.selectedFields.delete(field);
        else this.selectedFields.add(field);
        button.setAttribute('aria-pressed', String(this.selectedFields.has(field)));
        window.mapManager.updateMap([...this.selectedFields]);
      });
    });

    window.mapManager.updateMap(ordered.length ? [...this.selectedFields] : null);

    try {
      if (localStorage.getItem('arborea_tutorial_seen_v1') !== '1') {
        setTimeout(openTutorial, 800);
      }
    } catch {
      // La guida resta accessibile dalla testata.
    }
  }

  updateResults({ typeCounts, results }) {
    const max = Math.max(1, ...[...this.typeButtons.keys()].map(field => typeCounts.get(field) ?? 0));
    for (const [field, { count, button }] of this.typeButtons) {
      const total = typeCounts.get(field) ?? 0;
      count.textContent = total;
      button.style.setProperty('--fill', total / max * 100 + '%');
    }
    const total = window.mapManager.sitiFeatures.length;
    document.getElementById('atlas-site-count').textContent = results.length + (results.length === 1 ? ' sito' : ' siti');
    document.getElementById('atlas-count-caption').textContent = results.length === total ? 'Nell’atlante' : 'Con i filtri correnti · ' + total + ' totali';
    this.navigator.setSites(results);
  }

  createFooter() {
    const footer = document.createElement('div');
    footer.className = 'atlas-sidebar-foot';
    if (new URLSearchParams(location.search).get('download') === '1') {
      const download = document.createElement('a');
      download.href = getPath('download/download_page.html');
      download.textContent = 'Esplora e scarica i dati';
      footer.append(download);
    }
    const credits = document.createElement('details');
    credits.className = 'credits credits--panel';
    credits.innerHTML = `<summary>Project Credits</summary>
      <div class="credits-grant">
        <p><strong>This website is intended as an online output of:</strong></p>
        <p>Project PE 0000020 CHANGES - CUP B53C22003780006, NRP Mission 4<br>
        Component 2 Investment 1.3, Funded by the European Union - NextGenerationEU</p>
        <p><strong>Directed by:</strong></p>
        <img src="${getPath('images/icons/logo_sapienza.png')}" alt="Sapienza" class="credits-sapienza">
      </div>
      <div class="author-info">
        <p>Produced and maintained by:</p>
        <img src="${getPath('images/logo_erasmo.svg')}" alt="Erasmo di Fonso" class="author-logo">
        <p class="contact-info">For questions or support please contact: <a href="mailto:erasmo.difonso@libero.it">erasmo.difonso@libero.it</a></p>
      </div>`;
    footer.append(credits);
    document.getElementById('sidebar').append(footer);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new Dashboard();
});
