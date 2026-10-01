/**
 * A synthetic fibre build schedule for Colchester, Essex, for the map view demo
 * (BACKLOG-0001639). Seeded, so every load draws the same network.
 *
 * - about 2,000 premises (points), each planned, in build, or live, with the
 *   premises it passes (a house passes one, a block of flats many);
 * - 20 build zones (polygons) tiling the town centre, each with a status;
 * - 30 duct routes (lines) from the exchange out through the zones.
 *
 * Every row carries its place as GeoJSON in `geom`, so one grid and one map
 * view show all three. Synthetic: no real address, premises or route.
 */

/** The town centre, near Colchester's High Street. */
const CENTRE = [0.9036, 51.8892];

/** The exchange the duct routes leave from. */
const EXCHANGE = [0.8985, 51.8868];

const STATUSES = ['planned', 'build', 'live'];

/**
 * A seeded random number generator (Park–Miller).
 * @param {number} seed the seed
 * @returns {() => number} a function returning 0 ≤ n < 1
 */
function seeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * A number rounded to six decimal places (about 10 cm).
 * @param {number} n the number
 * @returns {number} the rounded number
 */
const r6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Build the schedule.
 * @param {number} [seed] the seed
 * @returns {object[]} the rows: premises, zones and ducts
 */
export function buildSchedule(seed = 1639) {
  const rand = seeded(seed);
  const rows = [];
  // Zones: a 5 x 4 tiling around the centre, each about 600 m by 450 m.
  const zoneW = 0.0088;
  const zoneH = 0.0041;
  const west = CENTRE[0] - zoneW * 2.5;
  const south = CENTRE[1] - zoneH * 2;
  const zones = [];
  for (let zy = 0; zy < 4; zy++) {
    for (let zx = 0; zx < 5; zx++) {
      const w = west + zx * zoneW;
      const s = south + zy * zoneH;
      const status = STATUSES[Math.floor(rand() * 3)];
      const id = `Z${String(zones.length + 1).padStart(2, '0')}`;
      zones.push({ id, w, s, status });
      rows.push({
        id, kind: 'zone', name: `Build zone ${id}`, status, premisesPassed: null, week: 40 + zones.length,
        geom: {
          type: 'Polygon',
          coordinates: [[[w, s], [w + zoneW, s], [w + zoneW, s + zoneH], [w, s + zoneH], [w, s]].map((p) => p.map(r6))],
        },
      });
    }
  }
  // Premises: 100 per zone, along short east-west streets, mostly in the
  // zone's own status.
  let n = 0;
  for (const zone of zones) {
    for (let i = 0; i < 100; i++) {
      const street = Math.floor(rand() * 6);
      const lng = zone.w + (0.05 + rand() * 0.9) * zoneW;
      const lat = zone.s + ((street + 0.5) / 6) * zoneH + (rand() - 0.5) * 0.00012;
      const flats = rand() < 0.08;
      const status = rand() < 0.75 ? zone.status : STATUSES[Math.floor(rand() * 3)];
      n++;
      rows.push({
        id: `P${String(n).padStart(4, '0')}`, kind: 'premises', name: `${10 + Math.floor(rand() * 180)} ${zone.id} Street ${street + 1}`,
        status, premisesPassed: flats ? 6 + Math.floor(rand() * 30) : 1, week: 40 + Math.floor(rand() * 26),
        geom: { type: 'Point', coordinates: [r6(lng), r6(lat)] },
      });
    }
  }
  // Ducts: from the exchange to a zone, bending once at a street corner.
  for (let d = 0; d < 30; d++) {
    const zone = zones[d % zones.length];
    const end = [zone.w + rand() * zoneW, zone.s + rand() * zoneH];
    const corner = [end[0], EXCHANGE[1] + (end[1] - EXCHANGE[1]) * rand()];
    rows.push({
      id: `D${String(d + 1).padStart(2, '0')}`, kind: 'duct', name: `Duct ${d + 1} to ${zone.id}`,
      status: STATUSES[Math.floor(rand() * 3)], premisesPassed: null, week: 38 + Math.floor(rand() * 20),
      geom: { type: 'LineString', coordinates: [EXCHANGE, corner, end].map((p) => p.map(r6)) },
    });
  }
  return rows;
}
