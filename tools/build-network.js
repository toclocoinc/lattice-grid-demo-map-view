/**
 * Build the demo's synthetic fibre network on Colchester's real street graph
 * (BACKLOG-0001678). Seeded: the same seed writes the same file.
 *
 *   node tools/build-network.js [seed]     # data/streets.json -> data/network.json
 *
 * One exchange; backbone routes along the main roads out from it; distribution
 * routes branching along side streets as a tree; a cabinet at every branch
 * junction and splice points along the longer routes. Synthetic: no real
 * route, cabinet or premises count. Street geometry: © OpenStreetMap
 * contributors (ODbL).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SEED = Number(process.argv[2]) || 1678;
const DISTRIBUTION_SPACING = 105; // metres between distribution targets: sets how many routes
const SPLICE_EVERY = 230;         // metres between splice points along a route
const RADIUS = 1000;              // metres from the centre kept in the network

/** @param {number} seed the seed @returns {() => number} a Mulberry32 generator, 0 <= n < 1 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(SEED);

const { bbox, streets } = JSON.parse(readFileSync(new URL('../data/streets.json', import.meta.url), 'utf8'));
const CENTRE = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
const M_LAT = 111_190;
const M_LON = 111_190 * Math.cos((CENTRE[0] * Math.PI) / 180);

/** @param {number[]} a [lat, lon] @param {number[]} b [lat, lon] @returns {number} metres between them */
const metres = (a, b) => Math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LON);

// --- The street graph: a node per distinct vertex, an edge per consecutive pair. ---
/** @type {Map<string, {id: string, p: number[], edges: {to: string, m: number, cls: string, name: string}[]}>} */
const nodes = new Map();
/** @param {number[]} p [lat, lon] @returns {object} the node at that place */
const nodeAt = (p) => {
  const id = p.join(',');
  if (!nodes.has(id)) nodes.set(id, { id, p, edges: [] });
  return nodes.get(id);
};
for (const s of streets) {
  for (let i = 1; i < s.line.length; i++) {
    const a = nodeAt(s.line[i - 1]);
    const b = nodeAt(s.line[i]);
    if (a === b) continue;
    const m = metres(a.p, b.p);
    a.edges.push({ to: b.id, m, cls: s.class, name: s.name });
    b.edges.push({ to: a.id, m, cls: s.class, name: s.name });
  }
}
// Keep the largest connected piece inside the radius.
for (const n of nodes.values()) if (metres(n.p, CENTRE) > RADIUS) n.out = true;
for (const n of nodes.values()) n.edges = n.edges.filter((e) => !nodes.get(e.to).out);
for (const [id, n] of [...nodes]) if (n.out) nodes.delete(id);
let biggest = new Set();
const seen = new Set();
for (const start of nodes.keys()) {
  if (seen.has(start)) continue;
  const part = new Set([start]);
  const queue = [start];
  while (queue.length) for (const e of nodes.get(queue.pop()).edges) if (!part.has(e.to)) { part.add(e.to); queue.push(e.to); }
  part.forEach((id) => seen.add(id));
  if (part.size > biggest.size) biggest = part;
}
for (const id of [...nodes.keys()]) if (!biggest.has(id)) nodes.delete(id);

/** @param {number[]} p [lat, lon] @returns {object} the graph node nearest that place */
const nearest = (p) => { let best = null; let d = Infinity; for (const n of nodes.values()) { const x = metres(n.p, p); if (x < d) { d = x; best = n; } } return best; };

/**
 * Dijkstra from one or more sources.
 * @param {string[]} sources the source node ids
 * @param {(e: object) => number} cost the cost of an edge
 * @returns {{dist: Map<string, number>, parent: Map<string, string>}} the cost to each node and its parent
 */
function dijkstra(sources, cost) {
  const dist = new Map(sources.map((s) => [s, 0]));
  const parent = new Map();
  const todo = new Set(sources);
  while (todo.size) {
    let u = null;
    for (const id of todo) if (u === null || dist.get(id) < dist.get(u)) u = id;
    todo.delete(u);
    for (const e of nodes.get(u).edges) {
      const d = dist.get(u) + cost(e);
      if (d < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, d); parent.set(e.to, u); todo.add(e.to); }
    }
  }
  return { dist, parent };
}

/** The path from a source to a node, following parent links. @param {Map<string,string>} parent the links @param {string} id the node @returns {string[]} ids, source first */
const pathTo = (parent, id) => { const out = [id]; while (parent.has(out[0])) out.unshift(parent.get(out[0])); return out; };

const MAIN = { trunk: 0.5, primary: 0.55, secondary: 0.6, tertiary: 0.85 };
const exchange = nearest([CENTRE[0] - 0.0004, CENTRE[1] - 0.002]);

// --- Backbone: the main roads out from the exchange, one spoke per bearing. ---
const mainRoads = dijkstra([exchange.id], (e) => e.m * (MAIN[e.cls] ?? 1.6));
const backbonePaths = [];
const SPOKES = 7;
for (let k = 0; k < SPOKES; k++) {
  const bearing = ((k + rand() * 0.5) / SPOKES) * 2 * Math.PI;
  const reach = 700 + rand() * 250;
  const target = nearest([exchange.p[0] + (Math.cos(bearing) * reach) / M_LAT, exchange.p[1] + (Math.sin(bearing) * reach) / M_LON]);
  if (target.id !== exchange.id) backbonePaths.push(pathTo(mainRoads.parent, target.id));
}

/**
 * Turn root-to-leaf paths that share a parent map into routes: each route runs
 * on down the heavier branch, and the lighter branches start routes of their own.
 * @param {string[][]} paths root-first paths through one tree
 * @returns {string[][]} the routes, as node ids
 */
function decompose(paths) {
  const children = new Map();
  const weight = new Map();
  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      weight.set(path[i], (weight.get(path[i]) || 0) + 1);
      if (i) { if (!children.has(path[i - 1])) children.set(path[i - 1], new Set()); children.get(path[i - 1]).add(path[i]); }
    }
  }
  const routes = [];
  /** @param {string[]} route the route so far, last node being walked from */
  const walk = (route) => {
    for (;;) {
      const kids = [...(children.get(route[route.length - 1]) || [])].sort((a, b) => weight.get(b) - weight.get(a));
      if (!kids.length) break;
      for (const side of kids.slice(1)) walk([route[route.length - 1], side]);
      route.push(kids[0]);
    }
    routes.push(route);
  };
  for (const root of new Set(paths.map((p) => p[0]))) walk([root]);
  return routes;
}
const backboneRoutes = decompose(backbonePaths);
const onBackbone = new Set(backboneRoutes.flat());

// --- Distribution: side streets branching off the backbone, as a tree. ---
const side = dijkstra([...onBackbone], (e) => e.m * (MAIN[e.cls] ? 2.5 : 1) * (0.9 + rand() * 0.5));
const candidates = [...nodes.values()].filter((n) => !onBackbone.has(n.id) && side.dist.has(n.id) && side.dist.get(n.id) > 60);
for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
const targets = [];
for (const c of candidates) if (targets.every((t) => metres(t.p, c.p) > DISTRIBUTION_SPACING)) targets.push(c);
const distributionRoutes = decompose(targets.map((t) => pathTo(side.parent, t.id)));

// --- Describe every route. ---
/** Metres of premises-bearing frontage per premises passed, by street class. */
const FRONTAGE = { residential: 11, tertiary: 15, unclassified: 13, secondary: 22, primary: 24, pedestrian: 9, living_street: 10, trunk: 40 };
/** @param {string[]} ids a route's node ids @returns {object} its street, length and premises passed */
function describe(ids) {
  const byName = new Map();
  let lengthM = 0;
  let premises = 0;
  for (let i = 1; i < ids.length; i++) {
    const e = nodes.get(ids[i - 1]).edges.find((x) => x.to === ids[i]);
    lengthM += e.m;
    premises += e.m / (FRONTAGE[e.cls] || 14);
    byName.set(e.name || 'Unnamed street', (byName.get(e.name || 'Unnamed street') || 0) + e.m);
  }
  const street = [...byName].sort((a, b) => b[1] - a[1])[0][0];
  return { street, lengthM: Math.round(lengthM), premises: Math.max(1, Math.round(premises * (0.8 + rand() * 0.4))) };
}

/** @param {number} y year @param {number} m month, 1 to 12 @param {number} spanMonths how many months to spread over @returns {string} an ISO date in that span */
const dateIn = (y, m, spanMonths) => {
  const at = (y * 12 + m - 1) + Math.floor(rand() * spanMonths);
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}`;
};

const all = [
  ...backboneRoutes.map((ids) => ({ ids, type: 'backbone' })),
  ...distributionRoutes.map((ids) => ({ ids, type: 'distribution' })),
];
for (const r of all) Object.assign(r, describe(r.ids));
// Which route a branch starts from: the route whose body holds its first node.
const owner = new Map();
for (const r of all) r.ids.slice(1).forEach((id) => { if (!owner.has(id)) owner.set(id, r); });
for (const r of all) r.parent = r.type === 'backbone' ? null : (owner.get(r.ids[0]) || null);

// Status: the built part is near the exchange; a branch is never built before what it hangs from.
const RANK = { backbone: 0, live: 1, planned: 2, proposed: 3 };
const ahead = (r) => mainRoads.dist.get(r.ids[0]) ?? side.dist.get(r.ids[0]) ?? 0;
const dists = all.filter((r) => r.type === 'distribution').map((r) => ahead(r) + r.lengthM / 2);
const order = all.filter((r) => r.type === 'distribution').map((r, i) => ({ r, score: dists[i] * (0.75 + rand() * 0.5) })).sort((a, b) => a.score - b.score);
order.forEach(({ r }, i) => { r.want = i / order.length < 0.58 ? 'live' : i / order.length < 0.8 ? 'planned' : 'proposed'; });
for (const r of all) {
  if (r.type === 'backbone') r.status = 'backbone';
}
for (const { r } of order.sort((a, b) => (side.dist.get(a.r.ids[0]) || 0) - (side.dist.get(b.r.ids[0]) || 0))) {
  const parentRank = r.parent && r.parent.status ? RANK[r.parent.status] : 0;
  r.status = RANK[r.want] >= parentRank ? r.want : r.parent.status;
}
for (const r of all) {
  r.buildDate = r.status === 'backbone' ? dateIn(2021, 3, 18) : r.status === 'live' ? dateIn(2022, 6, 52)
    : r.status === 'planned' ? dateIn(2026, 11, 11) : dateIn(2027, 10, 15);
  if (r.type === 'backbone') r.premises = Math.round(r.premises * 0.3) + 4;
}
// Name the routes: BB-nn for the backbone, D-nnn along the distribution, by distance from the exchange.
let nb = 0;
let nd = 0;
for (const r of all.sort((a, b) => (a.type === b.type ? ahead(a) - ahead(b) : a.type === 'backbone' ? -1 : 1))) {
  r.id = r.type === 'backbone' ? `BB-${String(++nb).padStart(2, '0')}` : `D-${String(++nd).padStart(3, '0')}`;
}

// --- Cabinets at junctions, splices along the routes, one exchange. ---
const points = [{ kind: 'exchange', status: 'backbone', routeId: 'BB-01', street: 'Exchange', at: exchange.p }];
const used = new Set([exchange.id]);
for (const r of all) {
  const start = r.ids[0];
  if (r.parent && !used.has(start)) { used.add(start); points.push({ kind: 'cabinet', status: r.parent.status, routeId: r.parent.id, street: r.street, at: nodes.get(start).p }); }
  let since = 0;
  for (let i = 1; i < r.ids.length - 1; i++) {
    since += nodes.get(r.ids[i - 1]).edges.find((x) => x.to === r.ids[i]).m;
    const remaining = r.lengthM - since;
    if (since >= SPLICE_EVERY && remaining > 60 && !used.has(r.ids[i]) && !(children(r.ids[i]))) {
      used.add(r.ids[i]);
      points.push({ kind: 'splice', status: r.status, routeId: r.id, street: r.street, at: nodes.get(r.ids[i]).p });
      since = 0;
    }
  }
}
/** @param {string} id a node id @returns {boolean} whether another route starts there */
function children(id) { return all.some((r) => r.ids[0] === id); }
const counters = { exchange: 0, cabinet: 0, splice: 0 };
const PREFIX = { exchange: 'EX', cabinet: 'CAB', splice: 'SPL' };
const out = {
  attribution: '© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright. Network: synthetic, seeded.',
  seed: SEED,
  centre: [CENTRE[1], CENTRE[0]],
  routes: all.map((r) => ({
    id: r.id, type: r.type, status: r.status, street: r.street, lengthM: r.lengthM, premisesPassed: r.premises,
    buildDate: r.buildDate, vertices: r.ids.map((id) => nodes.get(id).p),
  })),
  nodes: points.map((p) => ({
    id: `${PREFIX[p.kind]}-${String(++counters[p.kind]).padStart(3, '0')}`, kind: p.kind, status: p.status,
    routeId: p.routeId, street: p.street, lat: p.at[0], lon: p.at[1],
  })),
};
writeFileSync(new URL('../data/network.json', import.meta.url), JSON.stringify(out));
const by = (k, xs) => xs.reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {});
console.log(JSON.stringify({
  routes: out.routes.length, byStatus: by('status', out.routes), byType: by('type', out.routes),
  vertexRows: out.routes.reduce((n, r) => n + r.vertices.length, 0),
  nodes: out.nodes.length, nodeKinds: by('kind', out.nodes),
  km: Math.round(out.routes.reduce((n, r) => n + r.lengthM, 0) / 100) / 10,
  premises: out.routes.reduce((n, r) => n + r.premisesPassed, 0),
}));
