// Inserisci qui una chiave CARTO Basemaps autorizzata per il dominio del sito.
const CARTO_API_KEY = 'cb1_3ruy_1_f86fe36a82af8ad5ed666918';

export function addBaseMap(map, options = {}) {
  const key = CARTO_API_KEY.trim();
  if (!key) {
    console.warn('ARBOREA: configura la chiave CARTO in basemap.js.');
  }

  const url = `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`;
  return L.tileLayer(url, {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    ...options
  }).addTo(map);
}
