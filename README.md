# Hersleb — After Hours

A Blender-built browser survival horror prototype set at Hersleb videregående skole in Oslo. You are a student returning after the last bell. Collect your student ID, a fuse, and the archive key, restore the breaker, unlock the street gate, and escape. A pursuer patrols the halls, hears running, follows you around walls, and searches your last known position. Break its line of sight and hide in lockers.

The gameplay combines the warning sounds and hiding rhythm of **DOORS / Pressure** with **The Mimic**’s exploration and chases. Sounds are synthesized locally and the 3D assets are generated and editable in Blender.

## Location accuracy

The school and nearby streets/building footprints use actual OpenStreetMap data, with facade and roof details guided by public exterior references. This is **not yet a 1:1 reconstruction**. The interior floor plan, room positions, current facade dimensions/details, and surrounding building facades remain unverified. The playable room layout is provisional. Exact interiors require reliable plans, measurements, or current reference coverage; public exterior imagery cannot establish them.

See [location research](docs/LOCATION-RESEARCH.md) and [credits](CREDITS.md) for sources and limitations. A verified [Blender-to-Three.js X demo](https://x.com/sidahuj/status/1899584131455209503) matches the requested AI → Blender → browser workflow; the exact timeline post the user saw is unknown.

## Develop

Use Node.js 24 (pinned in `.nvmrc`) and Blender 4.3.2. The prepared cloud environment already has both. Each cloud task has an isolated checkout; use it directly without creating a Git worktree.

```sh
cd /workspace/Hersleb-Game-Blender
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm run dev
```

The development server listens on port 5173. It is checked internally during cloud onboarding. User-facing publication must use the Sites connector or another static host; a localhost address is not a published game.

```sh
npm test
npm run test:browser
npm run build
```

Browser tests use installed `/usr/bin/chromium` with verified local software WebGL rendering. They exercise the exported Blender scene, movement, pause, hiding, map navigation, item collection, power/gate requirements, and mobile layout. The production output is `dist/`; asset paths are relative so it can be hosted beneath a subpath.

## Edit Blender assets

The generator and editable `.blend` scenes are in `blender/`. Exported glTF files and gameplay metadata are in `public/models/`. The scene generator uses a local copy of the researched map data, so regeneration does not require network access.

The live Blender MCP connection was used to create the first-person flashlight/hand model, create and export the school scene, and inspect the resulting scene. MCP controls the Blender process; it is separate from any subagents that help write or research the project. The workspace retains the official MCP server, task-local addon bootstrap, and client in `/workspace/shared/`.

```sh
npm run assets
```

Asset regeneration is an explicit development action: it rewrites the generated Blender source scenes, glTF, and layout metadata. Dependency setup uses the committed exports and does not regenerate them.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Look; click and drag when pointer capture is unavailable |
| Shift | Sprint; drains stamina and makes noise |
| Ctrl / C | Crouch and move quietly |
| E | Collect, use, hide, or leave hiding |
| F | Flashlight |
| M / Tab | Exploration map |
| Escape | Pause |

Phones have a movement stick, drag-to-look, and action buttons. Look sensitivity, scare effects, and render quality can be adjusted under **How to play**. Audio starts after a user gesture; the sound button mutes it.

## Publication

The game is a static site and requires no API keys, login, database, or remote asset services to play. `npm run build` produces a deployment package in `dist/`. Sites publication cannot be confirmed until the Sites connector is callable in the session; a successful build alone does not publish it.
