# Map View: a fibre build schedule as a 3D map

A synthetic fibre build schedule for Colchester, Essex — about 2,000 premises, 20 build zones and
30 duct routes, seeded so every load draws the same network — shown as a live 3D map beside a
Lattice Grid table, bound through the `mapview` module (`createMapView`). Filter, search or group
the grid and the map follows; select a row and the map flies to it; click a feature on the map and
the grid selects and scrolls to its row. Run it locally with any static server, for example
`python3 -m http.server 8080` from this folder, then open `http://localhost:8080/`. No licence key
is needed on localhost.

## Licence

The code in this repository is available under the MIT licence. See
[LICENSE](LICENSE). Lattice Grid itself is a separate commercial product, free to use on
localhost; keys for your own sites come from [latticegrid.dev](https://www.latticegrid.dev).
