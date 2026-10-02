# Hersleb scene sources

`hersleb-provisional.blend` is the editable school/courtyard scene. `caretaker.blend`
contains the original fictional pursuer. All exported shapes, materials and props
are authored procedurally in Blender; no school photographs or student artwork
are embedded as textures.

Regenerate the browser assets with Blender 4.3.2 or later:

```sh
blender --background --factory-startup --python-exit-code 1 --python blender/generate_assets.py
```

The self-contained generator reads `reference/hersleb-osm-layout.json` and writes
`public/models/environment.glb`, `environment.json`, and `enemy.glb`, plus the
two editable `.blend` files. Regeneration also preserves root-authored
`player-hands.blend`, `create_player_hands.py`, and `player-hands.glb`.

For an existing live Blender MCP session, execute the following code through its
`execute_blender_code` tool to generate and leave the school visible:

```python
import runpy
scene_module = runpy.run_path('/workspace/Hersleb-Game-Blender/blender/generate_assets.py')
scene_module['save_environment']()
```

The generator clears scene objects but does not reset Blender preferences or
disable installed addons. Background generation needs no MCP server.

## Fidelity and sources

The OpenStreetMap school footprints are in metres with no arbitrary scaling.
The main four-storey wing, perpendicular wing, single-storey arcade, additional
two-storey wing, nearby building outlines and street centerlines follow public
OSM geometry. Storey counts use available OSM tags; missing neighbor height tags
receive a provisional four-storey height.

The cream/yellow plaster, granite base, white divided windows, steep slate roofs,
copper dormers, cupolas, clock tower, and arched arcade are original geometric
interpretations of public exterior photographs. Official interior photographs
inform salmon/sage lower-floor colors, reflective grey flooring, ceiling grids,
and disc pendant lighting.

**The playable room plan, room locations, precise door/window placement, garden
detail, exit gate and all horror props are provisional. This is not a surveyed
1:1 exterior/interior reconstruction.** The public school library/reception are
documented on Plan 1; the current gameplay locates fictional versions at ground
level for a continuous, accessible route. A full 1:1 reconstruction needs
measured elevations, floor plans and authorized interior reference coverage.

Reference sources:

- [OpenStreetMap school area](https://www.openstreetmap.org/way/868545068)
- [Main school footprint](https://www.openstreetmap.org/way/87949660)
- [Perpendicular school wing](https://www.openstreetmap.org/way/1030903734)
- [Low arcade](https://www.openstreetmap.org/way/113869394)
- [Additional school wing](https://www.openstreetmap.org/way/113869415)
- [Official Hersleb history and photographs](https://hersleb.vgs.no/om-skolen/om-oss/skolens-historie/)
- [Hersleb skole, public Wikimedia reference](https://no.wikipedia.org/wiki/Hersleb_skole)

Map-derived geometry/data: © OpenStreetMap contributors, licensed under the
[Open Database License](https://www.openstreetmap.org/copyright). Preserve OSM
attribution and comply with ODbL requirements when redistributing the derived
layout dataset. Photograph rights are separate; photos are research references
and are not included in these assets.

## Integration contract

All metadata uses THREE world coordinates in metres: x horizontal, y up, z depth.
Generator helpers convert `(x, y, z)` to Blender `(x, -z, y)`, and Blender's glTF
export maps it back to the intended THREE axes. Ground level is y=0. All game
routes are flat and require no jumping.

- `spawn`: `[4,0,20]`, facing the fictional entrance `[4,0,0]`.
- Main horizontal hall: x approximately −38 to 39, z −11.5 to −7.5.
- `bounds` and `navBounds`: `{minX,maxX,minZ,maxZ}`.
- `colliders`: `{id,min:[x,y,z],max:[x,y,z],kind}` AABBs.
- `lights`: `{position,color,intensity,distance,kind}` browser point lights.
- `interactables`: items, breaker, and exit with `position`, `kind`, `meshName`
  and `interactionDistance`; named item mesh nodes contain `interactableId` extras.
- `hideSpots`: reachable trigger `position` and ground-level `hidePosition`.
- `locations`: display labels and flat rectangular `bounds`.
- Remove the `exit-gate` collider after unlocking, then escape through z=46.
- The gate mesh is `exit_gate_leaf`; the breaker mesh is `breaker_panel`.
- Named pickup meshes: `collect_student-id`, `collect_fuse`,
  `collect_archive-key`. Hiding lockers are part of the static environment mesh.

The static environment is batched into one mesh with shared materials, plus
five separately controllable interaction meshes. No compression decoder,
textures, external material files, cameras or light extensions are needed to
load the exported GLBs in a standard Three.js GLTFLoader.
