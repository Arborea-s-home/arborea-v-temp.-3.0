const MISSING = "Not recorded";

function value(input) {
  return typeof input === "string" || typeof input === "number" ? String(input).trim() : "";
}

function label(input) {
  const text = value(input);
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function element(tag, cls, ...content) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...content);
  return node;
}

const ICONS = {
  archive: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M3 4h18v4H3zM10 12h4"/>',
  book: '<path d="M4 5h6a2 2 0 0 1 2 2v13a3 3 0 0 0-3-3H4zm16 0h-6a2 2 0 0 0-2 2v13a3 3 0 0 1 3-3h5z"/>',
  pin: '<path d="M19 10c0 4.5-7 10-7 10S5 14.5 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm6-2v16m6-14v16"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  site: '<path d="m3 9 9-5 9 5H3zm2 10h14M3 21h18M7 10v8m5-8v8m5-8v8"/>',
  remains: '<path d="M18 4C10 4 5 7 5 13a5 5 0 0 0 5 5c6 0 8-7 8-14ZM5 20l8-9"/>',
  sprout: '<path d="M12 21v-8M12 13C6 13 3 10 3 6c5 0 9 2 9 7Zm0 1c0-5 4-8 9-8 0 5-4 8-9 8Z"/>',
  flame: '<path d="M12 3c1 4 6 6 6 12a6 6 0 1 1-12 0c0-2 1-4 3-6 0 2 1 3 2 4 0-3 2-6 1-10Z"/><path d="M10 18c0-1 1-2 2-3 1 1 2 2 2 3"/>',
  count: '<path d="M5 19v-5m5 5V9m5 10V5m5 14H3"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  external: '<path d="M13 4h7v7m0-7-9 9m-2-8H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-5"/>',
};

function icon(name, cls = "") {
  const shell = element("span", "icon " + cls);
  shell.setAttribute("aria-hidden", "true");
  shell.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
  return shell;
}

function imageAsset(source, cls) {
  const image = element("img", cls);
  image.src = source;
  image.alt = "";
  return image;
}

function sectionHeading(title, symbol, tone = "") {
  return element("div", "section-heading",
    icon(symbol, "icon-tile " + tone),
    element("h2", "", title),
  );
}

function resourceButton(link, logo, detail = "") {
  if (!link) return null;
  const title = link.textContent;
  link.className = "resource-button";
  const copy = element("span", "resource-copy", element("strong", "", title));
  if (detail) copy.append(element("small", "", detail));
  link.replaceChildren(
    element("span", "resource-logo", imageAsset(logo, "")),
    copy,
    icon("external", "resource-arrow"),
  );
  return link;
}

function trait(title, content, symbol, tone = "") {
  return element("div", "trait " + tone,
    icon(symbol, "trait-icon"),
    element("dt", "", title),
    element("dd", content ? "" : "missing", content || MISSING),
  );
}

function field(name, content, required = false) {
  if (!(content instanceof Node)) content = value(content);
  if (!content && !required) return null;
  return element("div", "field",
    element("dt", "", name),
    element("dd", content ? "" : "missing", content || MISSING),
  );
}

function list(...fields) {
  return element("dl", "field-list", ...fields.filter(Boolean));
}

function hrefLink(title, url, cls = "") {
  const link = element("a", cls, title);
  link.href = url;
  return link;
}

function external(title, input) {
  try {
    const url = new URL(value(input));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return hrefLink(title, url);
  } catch {
    return null;
  }
}

function action(title, url, symbol, primary = false, isExternal = false) {
  const link = hrefLink(title, url, primary ? "button button-primary" : "button");
  link.replaceChildren(icon(symbol, "button-icon"), title, icon(isExternal ? "external" : "arrow", "button-arrow"));
  return link;
}

function card(title, symbol, cls = "", tone = "") {
  return element("section", "card " + cls, sectionHeading(title, symbol, tone));
}

function taxonLabel(record) {
  return value(record.precise_taxon || record.taxon || record.species_orig_pub) || "Unidentified taxon";
}

function scientificName(text, distinguishAuthority = false) {
  const name = element("span", "taxon-name");
  if (/aceae$/i.test(text)) { name.textContent = text; return name; }
  const tokens = text.split(/\s+/);
  let expectEpithet = false;
  for (const [index, token] of tokens.entries()) {
    if (index) name.append(" ");
    const rank = /^(subsp\.|ssp\.|var\.|f\.)$/.test(token);
    const epithet = (index === 1 || expectEpithet) && /^[a-z][a-z-]+$/.test(token);
    const genus = index === 0 && /^[A-Z][a-z-]+$/.test(token) && !/^(Undetermined|Unidentified)$/.test(token);
    if (genus || epithet) {
      name.append(element("i", "", token));
    } else {
      const authority = distinguishAuthority && index > 1 && !rank && /^(?:[A-Z]|\()/.test(token);
      name.append(authority ? element("span", "authority", token) : token);
    }
    expectEpithet = rank;
  }
  return name;
}

function citation(raw) {
  const text = value(raw);
  const parts = text.split("_").map(part => part.trim());
  if (parts.length < 4 || !/^\d{4}[a-z]?$/i.test(parts[1])) return text;
  const [author, year, title, publication, pages] = parts;
  const authorAndYear = author.endsWith(".") ? author : author + ".";
  return authorAndYear + " (" + year + "). " + title + ". " + publication +
    (pages ? ", pp. " + pages.replace("-", "–") : "") + ".";
}

function bulletSubtitle(...parts) {
  return parts.map(value).filter(Boolean).join(" · ");
}

function makeTaxonCard(properties, taxon) {
  const shell = card("Taxon reference", "sprout", "taxon-card");
  shell.append(list(
    field("Family", properties.Family || taxon.category_1),
    field("Genus", value(properties.genus) ? element("i", "", value(properties.genus)) : ""),
    field("Common names (Italian)", taxon.nome_com),
    field("Uses in taxon reference", taxon.usi_attestati),
  ));
  const acta = value(taxon.id_actaplantarum);
  const flori = value(taxon.id_floritaly);
  const resources = [
    acta && resourceButton(external("Acta Plantarum", "https://www.actaplantarum.org/flora/flora_info.php?id=" + encodeURIComponent(acta)), "sample-logos/acta.webp"),
    flori && resourceButton(external("FlorItaly", "https://dryades.units.it/floritaly/index.php?procedure=taxon_page&tipo=all&id=" + encodeURIComponent(flori)), "sample-logos/floritaly.webp"),
  ].filter(Boolean);
  const links = [
    external("Wikipedia ↗", taxon.wikipedia),
    external("Wikispecies ↗", taxon.wikispecies),
    external("Taxon image ↗", taxon.link_imm),
  ].filter(Boolean);
  if (resources.length) shell.append(element("div", "resource-grid", ...resources));
  if (links.length) shell.append(element("div", "ref-links", ...links));
  if (!shell.querySelector(".field") && !resources.length && !links.length) return null;
  return shell;
}

function makeEvidence(properties) {
  const shell = card("Botanical evidence", "remains", "evidence-card");
  const published = value(properties.species_orig_pub);
  const explicitQuantity = value(properties.quantity);
  const numericQuantity = value(properties.qt);
  const abundance = value(properties.entity);
  const weight = value(properties.weight_g);
  const image = external("Occurrence image ↗", properties.photo);
  shell.append(element("dl", "published-name",
    element("dt", "", "Identification as published"),
    element("dd", published ? "" : "missing", published ? scientificName(published) : MISSING),
  ));
  shell.append(element("dl", "traits",
    trait("Remain type", label(properties.s_type), "remains"),
    trait("Preservation", label(properties.s_foss), "flame", "warm"),
    trait("Plant part", label(properties.s_part), "sprout"),
    trait("Quantity as reported", explicitQuantity || numericQuantity, "count", "slate"),
  ));
  const details = [
    field("Numeric quantity", explicitQuantity && numericQuantity && explicitQuantity !== numericQuantity ? numericQuantity : ""),
    field("Relative abundance", abundance),
    field("Weight (g)", weight),
    field("Occurrence number in source", properties.sample_number),
    field("AMS dating record", properties.AMS),
    field("Occurrence notes", properties.s_notes),
    field("Discovery report", properties.discovery_report),
    field("Image", image),
  ].filter(Boolean);
  if (details.length) shell.append(list(...details));
  return shell;
}

function makeContext(properties, site, contextRecordUrl) {
  const shell = card("Archaeological context", "layers", "context-card", "warm");
  shell.id = "context-card";
  shell.tabIndex = -1;
  shell.append(
    element("p", "context-name", value(properties.context_name) || "Context " + value(properties.fid)),
    list(
      field("Context type", /^(undet\.?|indet\.?)$/i.test(value(properties.typology)) ? "Undetermined" : label(properties.typology), true),
      field("Context ID", properties.fid),
      field("Parent context", value(properties.parent_context) === value(site.name) ? "" : properties.parent_context),
      field("Notes", properties.c_notes),
    ),
  );
  if ([properties.chron_orig, properties.chronology_iccd, properties.parent_chronology_iccd].some(value)) {
    shell.append(element("div", "reading", element("h3", "", icon("clock"), "Context chronology"), list(
      field("As recorded", properties.chron_orig),
      field("ICCD period", properties.chronology_iccd),
      field("Broader period", properties.parent_chronology_iccd),
    )));
  }
  if (contextRecordUrl) shell.append(element("div", "actions inset-actions", action("Open full context record", contextRecordUrl, "layers")));
  return shell;
}

function makeSite(properties) {
  if (!Object.keys(properties).length) return null;
  const shell = card("Site", "site", "site-card", "slate");
  const code = value(properties.site_code);
  shell.append(
    element("p", "context-name", value(properties.site_name_brain || properties.name) || "Archaeological site"),
    list(
      field("Site type", label(properties.typology)),
      field("Region and province", bulletSubtitle(properties.region, properties.province)),
      field("Site chronology", properties.chronology_iccd),
    ),
  );
  if (code) shell.append(element("div", "resource-grid",
    resourceButton(hrefLink("BRAIN", "https://brainplants.successoterra.net/index.html"), "sample-logos/brain.webp", code),
  ));
  const wiki = value(properties.osm_wikipedia);
  const [lang, title] = wiki.split(/:(.*)/s);
  const commons = value(properties.osm_wikimedia_commons);
  const wd = value(properties.osm_wikidata);
  const links = [
    title && /^[a-z-]+$/.test(lang) && external("Wikipedia ↗", "https://" + lang + ".wikipedia.org/wiki/" + encodeURIComponent(title)),
    commons && external("Wikimedia Commons ↗", /^https?:/i.test(commons) ? commons : "https://commons.wikimedia.org/wiki/" + encodeURIComponent(commons)),
    /^Q\d+$/.test(wd) && external("Wikidata ↗", "https://www.wikidata.org/wiki/" + wd),
    external("Site website ↗", properties.osm_website),
  ].filter(Boolean);
  if (links.length) shell.append(element("div", "ref-links", ...links));
  return shell;
}

function polygonRings(geometry) {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function drawLocalGeometry(canvas, polygons, point) {
  const all = polygons.flat(2).concat(point ? [point] : []);
  const xValues = all.map(pair => pair[0]);
  const yValues = all.map(pair => pair[1]);
  const xMin = Math.min(...xValues);
  const yMin = Math.min(...yValues);
  const xRange = Math.max(...xValues) - xMin;
  const yRange = Math.max(...yValues) - yMin;
  const width = canvas.clientWidth || 520;
  const height = canvas.clientHeight || 220;
  const density = window.devicePixelRatio || 1;
  const lonScale = Math.cos((yMin + yRange / 2) * Math.PI / 180);
  const scale = Math.min(
    (width - 62) / (xRange * lonScale || .001),
    (height - 50) / (yRange || .001),
    90000,
  );
  const project = ([x, y]) => [
    width / 2 + (x - xMin - xRange / 2) * scale * lonScale,
    height / 2 - (y - yMin - yRange / 2) * scale,
  ];
  canvas.width = width * density;
  canvas.height = height * density;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(density, density);
  ctx.fillStyle = "#e9eee6";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d4ded3";
  ctx.beginPath();
  for (let x = 0; x < width; x += 27) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
  for (let y = 0; y < height; y += 27) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke();
  ctx.fillStyle = "#b8d0b8";
  ctx.strokeStyle = "#2f6752";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach((pair, index) => {
        const [x, y] = project(pair);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
  }
  ctx.fill("evenodd");
  ctx.stroke();
  if (polygons.length && Math.max(xRange * lonScale, yRange) * scale < 12) {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 14, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (point) {
    ctx.beginPath();
    ctx.arc(...project(point), 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ac552f";
    ctx.strokeStyle = "#fffdf8";
    ctx.fill();
    ctx.stroke();
  }
}

function makeMap(sample, context, site, addBaseMap, webgisUrl) {
  const isPoint = sample.geometry?.type === "Point";
  const point = isPoint && sample.geometry.coordinates?.slice(0, 2);
  const polygons = polygonRings(context?.geometry);
  const hasPoint = Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
  if (!polygons.length && !hasPoint) return null;

  const subtitle = bulletSubtitle(site.site_name_brain || site.name, site.province);
  const caption = element("figcaption", "map-caption");
  if (polygons.length) caption.append(element("span", "", element("i", "legend-area"), "Context geometry"));
  if (hasPoint) caption.append(element("span", "", element("i", "legend-marker"), "Recorded occurrence location"));
  const scale = hasPoint && value(sample.properties.samples_geoj_precision);
  if (scale) caption.append(element("span", "", "Precision class " + scale));
  if (webgisUrl) caption.append(element("div", "map-actions", action("Open site in WebGIS", webgisUrl, "map", false, true)));
  const fallbackNote = element("span", "", "ARBOREA geometries");
  caption.append(fallbackNote);

  const fallback = element("canvas", "map-backdrop");
  fallback.setAttribute("role", "img");
  fallback.setAttribute("aria-label", "Archaeological geometry around " + (subtitle || "the context"));
  const interactive = element("div", "map-canvas");
  interactive.hidden = true;
  const shell = element("figure", "card",
    element("div", "map-head", sectionHeading("Location", "map", "slate"), element("p", "map-subtitle", subtitle)),
    element("div", "map-frame", fallback, interactive),
    caption,
  );
  shell.id = "context-map";
  shell.tabIndex = -1;
  let map = null;
  const observers = [];
  function mount() {
    const renderFallback = () => drawLocalGeometry(fallback, polygons, hasPoint ? point : null);
    renderFallback();
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(renderFallback);
      observer.observe(fallback);
      observers.push(observer);
    }
    const L = window.L;
    if (!L || !addBaseMap) return;
    interactive.hidden = false;
    map = L.map(interactive, { scrollWheelZoom: false, maxZoom: 19, attributionControl: true });
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(() => map?.invalidateSize({pan:false}));
      observer.observe(interactive);
      observers.push(observer);
    }
    const layers = [];
    if (polygons.length) layers.push(L.geoJSON(context, {
      style: { color: "#245344", weight: 2, fillColor: "#749e80", fillOpacity: .35 },
    }));
    if (hasPoint) layers.push(L.circleMarker([point[1], point[0]], {
      radius: 6, color: "#fffdf8", weight: 2, fillColor: "#ac552f", fillOpacity: 1,
    }));
    const bounds = L.featureGroup(layers).addTo(map).getBounds();
    map.fitBounds(bounds, { padding: [25, 25], maxZoom: 15 });
    if (polygons.length) {
      const cb = layers[0].getBounds();
      const diagonal = map.latLngToContainerPoint(cb.getNorthEast()).distanceTo(map.latLngToContainerPoint(cb.getSouthWest()));
      if (diagonal < 12) L.circleMarker(cb.getCenter(), {
        radius: 13, color: "#245344", weight: 2, fill: false, interactive: false,
      }).addTo(map);
    }
    const tiles = addBaseMap(map);
    if (tiles?.once) {
      tiles.once("tileload", () => { fallbackNote.hidden = true; });
    }
  }
  return { shell, mount, destroy() { observers.forEach(observer => observer.disconnect()); map?.remove(); map = null; } };
}

function makeRelated(records, urlFor) {
  if (!records.length) return null;
  const shell = card("Other occurrences from this context", "grid", "related");
  shell.querySelector(".section-heading").append(element("span", "related-total", String(records.length)));
  const row = record => {
    const name = element("span", "related-name", scientificName(taxonLabel(record)));
    const identifier = element("span", "related-id", "Occurrence " + value(record.id ?? record.fid));
    const link = hrefLink(name, urlFor(value(record.fid)));
    link.replaceChildren(icon("remains", "icon-tile"),
      element("span", "related-copy", name, identifier),
      icon("arrow", "related-arrow"),
    );
    return element("li", "", link);
  };
  shell.append(element("ul", "related-list", ...records.slice(0, 4).map(row)));
  if (records.length > 4) {
    const extra = records.length - 4;
    shell.append(element("details", "", element("summary", "button", "Show " + extra + " more " + (extra === 1 ? "occurrence" : "occurrences")),
      element("ul", "related-list", ...records.slice(4).map(row))));
  }
  return shell;
}

export function renderSample(root, { sample, context, site, taxon, related, urls, addBaseMap }) {
  root.disposeRecord?.();
  root.disposeRecord = null;
  const p = sample.properties;
  const c = context?.properties || {};
  const s = site?.properties || {};
  const id = value(p.id ?? p.fid);
  const pageName = "Occurrence " + id;
  document.title = pageName + " | ARBOREA";
  const webgisUrl = value(s.fid) ? urls.site(s.fid) : "";
  const contextId = value(c.fid);
  const parentSite = value(s.fid || c.parent_id);
  const contextRecordUrl = contextId && urls.context(contextId, parentSite, "record");
  const contextMapUrl = contextId && urls.context(contextId, parentSite, "map");
  const location = makeMap(sample, context, s, addBaseMap, webgisUrl);
  const locationName = value(s.site_name_brain || s.name);
  const siteChip = webgisUrl && locationName ? hrefLink(locationName, webgisUrl) : locationName;
  const crumb = element("nav", "breadcrumb", element("ol", "",
    element("li", "", hrefLink("Atlas", urls.atlas)),
    ...(siteChip ? [element("li", "", siteChip)] : []),
    element("li", "", pageName),
  ));
  crumb.setAttribute("aria-label", "Breadcrumb");
  crumb.querySelector("li:last-child").setAttribute("aria-current", "page");

  const heroCopy = element("div", "hero-copy",
    element("span", "hero-id", icon("archive"), pageName),
    element("h1", "", scientificName(taxonLabel(p), true)),
  );
  const subtitle = bulletSubtitle(locationName, s.province || c.province, s.region || c.region);
  if (subtitle) heroCopy.append(element("p", "subtitle", icon("pin"), subtitle));
  const actions = [
    contextId && action("Open context record", contextRecordUrl || "#context-card", "layers", true),
    contextMapUrl ? action("Locate context in WebGIS", contextMapUrl, "map", false, true) : location && action("Locate context on map", "#context-map", "map"),
  ].filter(Boolean);
  if (actions.length) heroCopy.append(element("div", "actions", ...actions));
  const medallion = element("div", "hero-medallion", imageAsset("sample-brand.webp", ""));
  medallion.setAttribute("aria-hidden", "true");
  const hero = element("section", "hero", heroCopy, medallion);

  const left = element("div", "stack", makeEvidence(p));
  const taxonCard = makeTaxonCard(p, taxon || {});
  if (taxonCard) left.append(taxonCard);
  const siteCard = makeSite(s);
  if (siteCard) left.append(siteCard);
  const bibliography = citation(p.bibliography);
  if (bibliography) left.append(element("section", "card source-card",
    sectionHeading("Archaeobotanical source", "book", "warm"), element("p", "cite", bibliography)));

  const right = element("div", "stack");
  if (location) right.append(location.shell);
  if (contextId) right.append(makeContext(c, s, contextRecordUrl));


  const others = makeRelated(related, urls.sample);
  root.replaceChildren(crumb, hero, element("div", "columns" + (right.childElementCount ? "" : " single-column"), left, right));
  root.append(others || element("div", "related-gap"));
  root.removeAttribute("aria-busy");
  if (location) {
    try {
      location.mount();
      root.disposeRecord = location.destroy;
    } catch (error) {
      location.destroy();
      location.shell.querySelector(".map-canvas").hidden = true;
      console.warn("ARBOREA could not initialize the base map", error);
    }
  }
}
