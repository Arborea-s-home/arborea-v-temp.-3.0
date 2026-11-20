# ARBOREA · Homepage, atlante e dashboard

Estrai il contenuto dello ZIP direttamente nella radice del sito, accanto a `path_utils.js` e alle cartelle `data/` e `record_necropoli/`. Conferma la sostituzione dei file omonimi. Apri la radice del sito tramite il server HTTP locale.

| Percorso | Pagina |
| --- | --- |
| `/` | Homepage inglese con progetto, metodi, mappa, esempio di Lunghezzina e bibliografia |
| `/atlas/` | Atlante territoriale con cronologia, filtri, guida e crediti |
| `/dashboard/` | Dashboard di analisi dei taxa e dei contesti |
| `/record_necropoli/necropoli/index.html?all=1` | WebGIS |

Il menu globale collega anche i dettagli territoriali, le schede dei campioni, le informazioni di progetto e la pagina dei download. I link interni si adattano al prefisso di GitHub Pages. La mappa della homepage usa il modulo `basemap.js` già installato nel sito e i dati di ARBOREA. L'archivio contiene i soli file da aggiungere o sostituire.

## Dati della dashboard

`data/dashboard-corpus.json` è un estratto statico di `dabi_5_tipologie_riconciliate.gpkg`. Contiene 7.816 occorrenze, incluse 23 con un collegamento non risolto al contesto. Le famiglie provengono dalla relazione tassonomica del GeoPackage. Le categorie corrispondono al campo `category_2` di `legenda_taxa.csv` quando l'etichetta del taxon ha una corrispondenza univoca. Le date e i periodi provengono dai collegamenti cronologici del progetto.

Il caricamento dell'estratto avviene nel browser. Per aggiornare il corpus si deve sostituire questo JSON con una nuova estrazione. WebGIS, atlante e download continuano a leggere i rispettivi GeoJSON del sito.

Per i grafici quantitativi seleziona una serie definita da fonte bibliografica, tipo di resto e parte vegetale. Le quantità usano `qt` e richiedono coerenza con eventuali valori originali in `quantity` ed `entity`. Il peso usa solo valori esatti in grammi. “Fully quantified contexts only” richiede che tutti i record selezionati nello stesso contesto siano idonei per la serie scelta. Confrontabilità e denominatori dipendono dal protocollo della fonte.

Gli esempi sono sotto **More filters and examples**. L'esempio riconciliato di La Marmotta ha 10 occorrenze, con 3 quantità idonee e somme parziali di 2 per ciascuno dei due contesti. Santa Maria in Civita mostra 20 occorrenze con simboli di fonte e nessuna quantità numerica idonea.
