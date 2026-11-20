const entities = {
  brain: {
    name: "BRAIN site",
    description: "The external BRAIN record to which an ARBOREA site can refer.",
    fields: [
      ["Identifier", "The BRAIN site code retained by ARBOREA as brain_ID."],
      ["Site name", "The place name as recorded by BRAIN."]
    ],
    relationship: "The BRAIN code provides a reference across the two databases."
  },
  site: {
    name: "ARBOREA site",
    description: "The archaeological complex that brings its contexts together.",
    fields: [
      ["Identifier and name", "ARBOREA site identifier and recorded place name."],
      ["BRAIN reference", "External site identifier, where available."],
      ["Location", "Coordinates, region and province."],
      ["Site description", "Typology, chronological phases and descriptive information."]
    ],
    relationship: "One site may contain multiple archaeological contexts."
  },
  context: {
    name: "Archaeological context",
    description: "The archaeological unit to which an occurrence is assigned.",
    fields: [
      ["Identity and hierarchy", "context_name, site_id and parent_id describe the context and its place in the hierarchy."],
      ["Dating", "chron_orig records the source dating. Chronological terms are linked separately."],
      ["Provenance", "Typology, notes, spatial precision, geometry and source information where available."]
    ],
    relationship: "A context may have sub-contexts, several occurrences and several chronological links."
  },
  occurrence: {
    name: "Botanical occurrence",
    description: "A botanical determination recorded in the samples table and associated with its archaeological provenance.",
    fields: [
      ["Provenance", "context_id links the occurrence to its context. sample_number retains the source sample reference, when available."],
      ["Identification", "The original taxon name, determination qualifiers and reference to the taxon vocabulary."],
      ["Material", "s_type, s_part and s_foss describe the remain type, plant part and preservation."],
      ["Reported evidence", "quantity, qt, entity and weight_g capture different forms of reporting. Records may also carry notes, AMS information and photographs."]
    ],
    relationship: "Multiple occurrences may derive from one physical sample. Several occurrences can share a taxon entry."
  },
  chronology: {
    name: "Chronology",
    description: "Controlled terms used to record archaeological periods and their subdivisions.",
    fields: [
      ["Term and hierarchy", "An ICCD label, level and parent term where applicable."],
      ["Date range", "Start and end values associated with the term."],
      ["Provenance", "Authority, source and publication year where documented."]
    ],
    relationship: "The context_chrono association supports many-to-many links between contexts and chronological terms."
  },
  taxon: {
    name: "Taxon thesaurus",
    description: "Reference entries used to associate botanical records with taxonomic names.",
    fields: [
      ["Name and rank", "Taxon, Family, genus, specie and subspecie describe the identification at the recorded level."],
      ["Additional information", "Taxonomic authorship, common names and notes where recorded."]
    ],
    relationship: "An occurrence retains its source identification alongside its vocabulary link."
  },
  bibliography: {
    name: "Bibliography",
    description: "References used to document the evidence and its provenance.",
    fields: [
      ["Citation", "Author, year, title and publication details."],
      ["Supporting information", "Pages and document references where recorded."],
      ["Associations", "Bibliographic linking records contain identifiers for contexts, occurrences and sources as applicable."]
    ],
    relationship: "One publication can document several records. Site records can also provide additional contextual reading."
  }
};

const inspector = document.querySelector("#entity-detail");
const entityButtons = Array.from(document.querySelectorAll("[data-entity]"));

function showEntity(button) {
  const entity = entities[button.dataset.entity];
  const title = document.createElement("h3");
  title.textContent = entity.name;
  const description = document.createElement("p");
  description.textContent = entity.description;
  const fields = document.createElement("dl");
  for (const [label, value] of entity.fields) {
    const field = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const details = document.createElement("dd");
    details.textContent = value;
    field.append(term, details);
    fields.append(field);
  }
  const relationship = document.createElement("p");
  relationship.className = "relationship";
  relationship.textContent = entity.relationship;
  inspector.replaceChildren(title, description, fields, relationship);
  for (const item of entityButtons) item.setAttribute("aria-pressed", String(item === button));
}

for (const button of entityButtons) button.addEventListener("click", () => showEntity(button));
showEntity(document.querySelector('[data-entity="site"]'));

for (const picture of document.querySelectorAll(".portrait img")) {
  const hideFailedImage = () => { picture.hidden = true; };
  picture.addEventListener("error", hideFailedImage);
  if (picture.complete && !picture.naturalWidth) hideFailedImage();
}
