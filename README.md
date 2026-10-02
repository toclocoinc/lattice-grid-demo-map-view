# Map View: a fibre network map in 3D

A synthetic fibre network on Colchester's real street graph, shown as a live 3D map beside a
Lattice Grid table, bound through the `mapview` module (`createMapView`). Routes run along the
streets, coloured by status (live green, planned blue, backbone red) and dashed when proposed;
cabinets, splices and the exchange are icons on diamond badges above the 3D buildings; a legend
names them all. Filter or search the grid and the map follows; select a row and the map flies to
it; click a route or an icon and the grid selects its rows.

**The grid holds the network as latitude/longitude rows**: one row per route vertex (route id,
sequence, lat, lon, and the route-level street, status, length, premises passed and build date),
and one row per cabinet, splice or exchange (id, kind, status, the route it sits on, lat, lon).
Map View assembles each route from its vertex rows (`geometry: { lat, lng, route: { by, order } }`);
there is no precomputed path column. The grid groups the rows by route, so a route reads as one
summary line that opens onto its vertices.

## Data

- `data/streets.json`: the town centre's highways, fetched once from OpenStreetMap through the
  Overpass API by `tools/fetch-streets.js` and trimmed to class, name and geometry.
- `data/network.json`: the synthetic network, built on that street graph by
  `tools/build-network.js` (seeded; `node tools/build-network.js 1678` rebuilds the same file):
  one exchange, 7 backbone routes along the main roads, 86 distribution routes branching along side
  streets as a tree, 82 cabinets at branch junctions and 37 splice points.
- The page makes no Overpass call; it reads `data/network.json`.

The routes, cabinets and premises counts are synthetic: no real route, cabinet or address.

## Attribution

Street geometry: © OpenStreetMap contributors, available under the
[Open Database Licence (ODbL)](https://www.openstreetmap.org/copyright). Basemap: OpenFreeMap
Positron, © OpenMapTiles, data © OpenStreetMap contributors.

Run it locally with any static server, for example `python3 -m http.server 8080` from this
folder, then open `http://localhost:8080/`. No licence key is needed on localhost.

## Licence

The code in this repository is available under the MIT licence. See
[LICENSE](LICENSE). Lattice Grid itself is a separate commercial product, free to use on
localhost; keys for your own sites come from [latticegrid.dev](https://www.latticegrid.dev).
