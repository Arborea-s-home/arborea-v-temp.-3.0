import { getPath } from "../../path_utils.js";
import { addBaseMap } from "../../basemap.js";
import { normaliseFeatures } from "../../assets/record-vocabulary.js";
import { renderSample } from "./sample-view.js";
import { buildOccurrenceIndex, mountOccurrenceBrowser } from "./occurrence-browser.js";

const root = document.querySelector("#sample-view");
const webgisPath = getPath("webgis/index.html");

const urls = {
  atlas: getPath("atlas/"),
  site: fid => webgisPath + "?" + new URLSearchParams({ fid }),
  context: (context, fid, view) => webgisPath + "?" + new URLSearchParams({
    ...(fid ? { fid } : { all: "1" }), context, view,
  }),
  sample: fid => "record_object.html?" + new URLSearchParams({ fid }),
};

const navRoutes = {
  project: getPath(""),
  atlas: urls.atlas,
  webgis: webgisPath + "?all=1",
  dashboard: getPath("dashboard/"),
  info: getPath("info/info.html"),
};

for (const link of document.querySelectorAll("[data-route]")) {
  const route = navRoutes[link.dataset.route];
  if (route) {
    link.href = route;
    link.hidden = false;
  }
}

async function loadData(path, type) {
  const response = await fetch(getPath("data/" + path));
  if (!response.ok) throw new Error(path + " returned " + response.status);
  return response[type]();
}

function parseTaxon(csv, taxonName) {
  if (!csv || !taxonName) return null;
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(cell.trim());
      cell = "";
      if (char === "\n") {
        rows.push(row);
        row = [];
      }
    } else {
      cell += char;
    }
  }
  if (row.length || cell) rows.push([...row, cell.trim()]);
  const [headers, ...data] = rows;
  const nameIndex = headers?.indexOf("valore") ?? -1;
  if (nameIndex < 0) return null;
  const found = data.find(item => item[nameIndex] === taxonName.trim());
  return found ? Object.fromEntries(headers.map((key, index) => [key, found[index] || ""])) : null;
}

function showMessage(message) {
  root.disposeRecord?.();
  root.disposeRecord = null;
  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");
  status.textContent = message;
  root.replaceChildren(status);
  root.removeAttribute("aria-busy");
}

function validKey(input) {
  return input !== null && input !== undefined && /^\d+$/.test(String(input));
}

async function startOccurrenceBrowser() {
  const [samples, contexts, sites, taxaCsv] = await Promise.all([
    loadData("samples.geojson", "json"),
    loadData("contesti.geojson", "json"),
    loadData("siti.geojson", "json"),
    loadData("legenda_taxa.csv", "text").catch(error => {
      console.warn("ARBOREA taxon reference unavailable", error);
      return "";
    }),
  ]);
  normaliseFeatures(samples, true);
  normaliseFeatures(contexts);
  normaliseFeatures(sites);
  const index = buildOccurrenceIndex(samples.features, contexts.features, sites.features);
  const browser = mountOccurrenceBrowser(index, {
    hrefFor: urls.sample,
    onSelect: fid => displayOccurrence(fid, true),
  });
  function displayOccurrence(fid, navigate = false) {
    if (navigate && new URLSearchParams(location.search).get('fid') !== String(fid)) {
      const url = new URL(location.href);
      url.searchParams.set('fid',fid);
      history.pushState(null,'',url);
    }
    browser.setActive(fid);
    const record = index.byFid.get(String(fid));
    if (!record) {
      showMessage(validKey(fid) ? 'Occurrence record not found. Choose another occurrence from the list.' : '');
      if (!validKey(fid)) {
        const intro = document.createElement('section');
        intro.className = 'occurrence-empty';
        const title = document.createElement('h1');
        title.textContent = 'Explore the occurrences';
        const explanation = document.createElement('p');
        explanation.textContent = 'Browse the list on the left: open a site, then a context, and choose an occurrence to read its full record.';
        const count = document.createElement('p');
        count.textContent = `${index.byFid.size.toLocaleString('en')} occurrences available. Search by site, context, taxon or record ID.`;
        intro.append(title,explanation,count);
        root.replaceChildren(intro);
      }
      document.title = 'Occurrences | ARBOREA';
      return;
    }
    const {feature:sample,context,site} = record;
    const p = sample.properties;
    const related = validKey(p.context_id) ? samples.features
      .map(feature => feature.properties)
      .filter(other => other && String(other.fid) !== String(fid) && validKey(other.fid) && String(other.context_id) === String(p.context_id))
      .sort((first,second) => Number(first.id ?? first.fid) - Number(second.id ?? second.fid)) : [];
    renderSample(root, {sample,context,site,related,taxon:parseTaxon(taxaCsv,p.precise_taxon),urls,addBaseMap});
    if (navigate) {
      window.scrollTo({top:0,behavior:'auto'});
      const title = root.querySelector('h1');
      if (title) { title.tabIndex = -1; title.focus({preventScroll:true}); }
    }
  }
  root.addEventListener('click',event => {
    const link = event.target.closest('.related-list a');
    if (!link || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href,location.href);
    if (url.pathname !== location.pathname || !validKey(url.searchParams.get('fid'))) return;
    event.preventDefault();
    displayOccurrence(url.searchParams.get('fid'),true);
  });
  window.addEventListener('popstate',() => displayOccurrence(new URLSearchParams(location.search).get('fid')));
  displayOccurrence(new URLSearchParams(location.search).get('fid'));
}

startOccurrenceBrowser().catch(error => {
  console.error("ARBOREA occurrence record unavailable", error);
  showMessage("The occurrence data could not be loaded. Please try again.");
  document.querySelector('#occurrence-count').textContent = 'Occurrence list unavailable.';
});
