import { getPath } from '../path_utils.js';

async function initialiseMap(element) {
  const { L } = window;
  if (!L) throw new Error('Map library unavailable');
  const response = await fetch(getPath('data/project-regional-overview.json'));
  if (!response.ok) throw new Error(`Overview map HTTP ${response.status}`);
  const { regions, land } = await response.json();

  const map = L.map(element, {
    attributionControl: false, zoomControl: false, dragging: false, keyboard: false,
    touchZoom: false, doubleClickZoom: false, scrollWheelZoom: false, boxZoom: false,
    tapHold: false, zoomSnap: 0, zoomAnimation: false
  });
  const background = { color: '#cbd5cd', weight: .7, fillColor: '#f4f5ef', fillOpacity: 1 };
  L.geoJSON(land, { style: background, interactive: false }).addTo(map);
  L.geoJSON(regions, { style: background, interactive: false }).addTo(map);
  const shaded = L.geoJSON(regions, {
    style: ({ properties }) => ({ color: '#667f61', weight: .8, opacity: .85, fillColor: properties.fill, fillOpacity: .78 }),
    interactive: false
  }).addTo(map);

  const frame = () => {
    map.invalidateSize({ animate: false, pan: false });
    map.fitBounds(shaded.getBounds(), { padding: [14, 14], animate: false });
  };
  frame();
  new ResizeObserver(frame).observe(element);
}

const element = document.getElementById('project-map');
initialiseMap(element).catch(error => {
  console.error(error);
  element.classList.add('map-fallback');
  element.textContent = 'The overview is unavailable. Explore the landscape in the atlas.';
});
