import { getPath } from '../path_utils.js';

const links = [
  ['project', 'Project', 'index.html#project'],
  ['atlas', 'Atlas', 'atlas/'],
  ['webgis', 'WebGIS', 'webgis/index.html?all=1'],
  ['occurrences', 'Occurrences', 'webgis/record_object/record_object.html'],
  ['dashboard', 'Dashboard', 'dashboard/'],
  ['credits', 'Credits &amp; Publications', 'info/info.html']
];

class ArboreaHeader extends HTMLElement {
  connectedCallback() {
    if (this.querySelector('header')) return;
    const controls = [...this.children];
    const current = this.dataset.page;
    const navLinks = links.map(([id, label, path]) =>
      `<a href="${getPath(path)}" data-section="${id}"${id === current ? ' aria-current="page"' : ''}>${label}</a>`
    ).join('');
    this.innerHTML = `<header class="arb-header">
      <a class="arb-brand" href="${getPath('index.html')}" aria-label="ARBOREA home">
        <img src="${getPath('images/logo_semplificato.png')}" alt="" width="35" height="35"><span>ARBOREA</span>
      </a>
      <button type="button" class="arb-menu" aria-expanded="false" aria-controls="arb-primary">Menu</button>
      <nav id="arb-primary" aria-label="Main navigation">${navLinks}</nav>
      <div class="arb-header-tools"></div>
    </header>`;
    this.querySelector('.arb-header-tools').append(...controls);
    const menu = this.querySelector('.arb-menu');
    const nav = this.querySelector('nav');
    const close = () => menu.setAttribute('aria-expanded', 'false');
    menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(menu.getAttribute('aria-expanded') === 'false')));
    nav.addEventListener('click', close);
    this.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
        close();
        menu.focus();
      }
    });

  }
}

customElements.define('arborea-header', ArboreaHeader);
