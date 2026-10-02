/**
 * Fetch Colchester's street network once from OpenStreetMap (Overpass API) and
 * write the trimmed copy the demo ships: data/streets.json (BACKLOG-0001678).
 *
 *   node tools/fetch-streets.js              # ask the Overpass API (needs the network)
 *   node tools/fetch-streets.js overpass.json # trim a saved Overpass response instead
 *
 * The page never calls Overpass: it reads data/network.json, which
 * tools/build-network.js derives from data/streets.json.
 *
 * Street data: © OpenStreetMap contributors, available under the Open Database
 * Licence (ODbL), https://www.openstreetmap.org/copyright.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** The town centre of Colchester, Essex: south, west, north, east. */
const BBOX = [51.880, 0.888, 51.898, 0.922];
const CLASSES = 'trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian';
const QUERY = `[out:json][timeout:60];way["highway"~"^(${CLASSES})$"](${BBOX.join(',')});out geom;`;

/**
 * Ask the Overpass API, retrying while it is busy.
 * @returns {Promise<object>} the Overpass JSON
 */
async function overpass() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': 'lattice-grid-demo-map-view/1.0 (https://www.latticegrid.dev)', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(QUERY),
    });
    const text = await res.text();
    if (res.ok && text.startsWith('{')) return JSON.parse(text);
    await new Promise((done) => setTimeout(done, 20000));
  }
  throw new Error('Overpass stayed busy');
}

const source = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : await overpass();
const streets = source.elements
  .filter((e) => e.type === 'way' && e.geometry && e.geometry.length > 1)
  .map((e) => ({
    class: e.tags.highway,
    name: e.tags.name || '',
    // [lat, lon] to 5 decimal places, about a metre.
    line: e.geometry.map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]),
  }));
writeFileSync(new URL('../data/streets.json', import.meta.url), JSON.stringify({
  attribution: '© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright',
  bbox: BBOX,
  streets,
}));
console.log(`${streets.length} street ways`);
