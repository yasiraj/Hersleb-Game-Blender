# Hersleb location research

Public sources checked on 2 October 2026. The geographic layout can be grounded in real map data, and several school photographs establish visible architecture and materials. A complete, measured, current interior plan has not been found. The game must therefore describe itself as a prototype with mapped surroundings and partly referenced school architecture, rather than a verified 1:1 reconstruction.

## Verified school identity

- The school's official site gives the address **Herslebs gate 20B, 0561 Oslo**. The separate Elisenberg/FVO address is a different campus and must not be merged into this location.
- The [official school history](https://hersleb.vgs.no/om-skolen/om-oss/skolens-historie/) says the school was officially inaugurated on 6 January 1923 and was completely renovated as a videregående school in 2014. Historical references describe the building as taken into use in 1922; these are different events.
- [Oslo Byleksikon](https://oslobyleksikon.no/side/Hersleb_skole) identifies architect Harald Aars, the 1922 school building, the 2014 reopening, and the decorated staircase.
- [Norwegian Wikipedia](https://no.wikipedia.org/wiki/Hersleb_videreg%C3%A5ende_skole) places the school near **59.9181 N, 10.7641 E**. This article point is not a measured entrance position.

## Mapped school and surroundings

The public [OpenStreetMap API extract](https://www.openstreetmap.org/api/0.6/map?bbox=10.7615,59.9165,10.7670,59.9200) returned complete way coordinates for the selected area, roughly 308 by 390 metres before including the full geometry of ways crossing the query boundary. The saved research dataset is `/workspace/shared/hersleb-osm-layout.json`; the raw extract is `/workspace/shared/osm-school-area.source`.

The derived dataset contains 112 building ways, 181 street/path ways, and 341 nearby tagged point features. These counts describe selected map records; they are not a completeness guarantee for every structure around the school.

| OSM way | School component | Mapped metadata |
| --- | --- | --- |
| [868545068](https://www.openstreetmap.org/way/868545068) | School grounds | Named Hersleb videregående skole |
| [87949660](https://www.openstreetmap.org/way/87949660) | Long main wing | 4 building levels, 1 roof level, hipped roof |
| [1030903734](https://www.openstreetmap.org/way/1030903734) | Perpendicular street wing | 4 building levels, 1 roof level, hipped roof |
| [113869394](https://www.openstreetmap.org/way/113869394) | Low connecting arcade | 1 building level, 0 roof levels |
| [113869415](https://www.openstreetmap.org/way/113869415) | Wing at the far end of the arcade | 2 building levels, 1 roof level |

Mapped streets in the selected area include Herslebs gate, Lakkegata, Jens Bjelkes gate, Sars' gate, Siebkes gate, Vahls gate, Trondheimsveien and Heimdalsgata. The map records provide positions and centerlines, with some storey and roof tags. They do **not** establish current street widths, curb heights, ground elevations, every neighboring facade, roof construction or interiors. Missing heights must remain explicit assumptions.

### Coordinate contract

The dataset converts WGS84 longitude/latitude to an East/North tangent plane using WGS84 ECEF at reference `[10.7641, 59.9181]`, with elevation zero. It then translates and rotates into local game metres:

- Origin in East/North: `[40.6391, 1.7272]` metres.
- Game x axis in East/North: `[0.51681465, -0.85609732]`, approximately southeast.
- Game z axis in East/North: `[-0.85609732, -0.51681465]`, approximately southwest.
- `x = dot(ENU - origin, x_axis)` and `z = dot(ENU - origin, z_axis)`.
- Three.js uses these x/z coordinates directly, with y vertical. Blender uses `X = x`, `Y = -z`, `Z = height` so a glTF export has the same browser placement.

The main long wing runs horizontally in x; the courtyard lies toward positive z. Its mapped outer wall is about **78.47 m** long and its overall footprint bounds are `x[-39.24, 40.34]`, `z[-19.75, 2.28]`. This is a length calculated from community map coordinates, not a field survey. Keep the original polygons; scaling them to a convenient rectangular level would discard the real footprint. Suggested gameplay doors and spawn points in the JSON are explicitly fictional design positions, not surveyed entrances.

Map attribution: **© OpenStreetMap contributors**, [copyright and attribution](https://www.openstreetmap.org/copyright). The map database and the derived geographic records are subject to the [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Preserve source and attribution when distributing the mapped environment.

## Exterior references

The official history page contains a gallery called “bilder fra skolen i dag”. Useful publicly served images include:

- [Courtyard, autumn 2021](https://hersleb.vgs.no/siteassets/skolen/bilder-fra-skolen-i-dag/skolebygg-host-2021.jpg), captioned “Skolen høst 2021”, photo Marianne Stavrum: pale cream/yellow plaster, grey stone base, white windows, slate roof and raised courtyard entrances. It also shows a decorative stone fountain and modern colored benches.
- [Covered arcade](https://hersleb.vgs.no/siteassets/skolen/bilder-fra-skolen-i-dag/overbygg.jpg): a low arcade with repeated arches, square grey stone columns, cream vaulted soffits, an asphalt edge and picnic tables.
- [May 2024 gallery example](https://hersleb.vgs.no/siteassets/skolen/bilder-fra-skolen-i-dag/mai-2024_3.jpg): flowering courtyard tree and part of the cream facade. The filename dates the gallery item; it is not independent survey evidence or complete coverage of all facades.
- [Clock tower and inner corner](https://hersleb.vgs.no/siteassets/img_4341.jpg): cream tower, clock, copper-colored cupola, dormers and large vertical window stacks. Its image metadata has a file DateTime of December 2013; do not call this a 2026 photograph.
- [Chell Hill's courtyard photograph, 24 August 2014](https://upload.wikimedia.org/wikipedia/commons/c/c3/140824_Hersleb01.JPG): good overview of the courtyard, roof, arcade and landscape. The [file description](https://no.wikipedia.org/wiki/Fil:140824_Hersleb01.JPG) formally licenses it under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Credit “Photo: Chell Hill” when reproducing it. A legacy photographer template mentions 3.0; the current license section and structured data specify 4.0.

A [pre-renovation exterior photograph](https://upload.wikimedia.org/wikipedia/commons/1/19/Hersleb_skole.jpg) shows pink plaster. It must not override the newer cream facade references. The selected references are insufficient to verify every facade detail, building height or 2026 condition.

Official-school photographs were inspected as references and retained outside the game directory. No redistribution license was established for those images or the artwork they contain. Do not package them as game textures or copy student portraits/artwork into the game.

## Partial interior evidence

The following are genuine school references, but none is a full floor plan:

- [Plan 0 gallery photograph](https://hersleb.vgs.no/siteassets/skolen/bilder-fra-skolen-i-dag/bilde-med-kust-fra-gs.jpg), captioned “Plan 0 som galleri”, photo Marianne Stavrum: muted salmon/beige walls, deep sage-green rectangular openings, smooth dark grey floor, grey baseboards, a white suspended ceiling grid, circular pendant lights, white framed windows and square dark tables. The [canteen photograph](https://hersleb.vgs.no/siteassets/skolen/bilder-fra-skolen-i-dag/det-du-ikke-ser.jpg), credited Astrid Grytte, shows the same area.
- [Fresco hall/stair photograph](https://hersleb.vgs.no/siteassets/skolen/bilde-til-foreldremote.jpg) on the [official fresco page](https://hersleb.vgs.no/om-skolen/om-oss/freskene-vare/): cream arched openings, thick piers, dark smooth floor, black skirting, white ceiling beams, round dark-rim pendant lights and a stair ascending left with a timber handrail. “PLAN 2” is visible. The page was published in 2020 and updated in 2021; the photo capture date is not established.
- The fresco page places **Historien on plan 1**, **Naturen on plan 2**, and **Geografien on plan 3**. This establishes floor identities, not measured wall positions. Artwork is a reference feature; no permission to reproduce its image as a texture was established.
- The [official library page](https://hersleb.vgs.no/for-elever-og-foresatte/laringsstotte/bibliotek/) explicitly says the library is on **plan 1**, on the same floor as the reception, and describes a quiet zone with seven study spaces.
- The [official canteen page](https://hersleb.vgs.no/for-elever-og-foresatte/helse-og-velferd/kantinen-var/) places cleanup/recycling stations on **plan 0**.
- The history gallery captions a [dental training room photograph](https://hersleb.vgs.no/siteassets/skolen/bilder-fra-skolen-i-dag/tannlegekontoret.jpg) as “Tannlegekontor 2020”; this confirms another real room type, but not its dimensions or location.
- The [official Skaperverksted page](https://hersleb.vgs.no/for-elever-og-foresatte/laringsstotte/herslebs-makerspace/) explicitly places the makerspace on **plan 3** and links photographs of its equipment and work areas.

### Additional public documents and tour found during the renewed search

The school's published search script uses a public JSON endpoint, for example [search for “etasje”](https://hersleb.vgs.no/no/api/Search/?q=etasje&hitstoretrive=30). Unlike the initial search-page HTML, this endpoint supplies actual indexed results, including publicly downloadable documents.

- The [official 2025–2026 student handbook](https://hersleb.vgs.no/siteassets/dokumentarkiv/elevboken-2025-2026.pdf) is a 27-page PDF. It confirms the library on **plan 1** (page 11), IKT office on **plan 3** (page 12), and canteen on **plan 0** (page 14). Page 9 describes an occupied **plan 4**, reached by the rear stair beside the auditorium/IKT office. These floor identities must not be reduced to a literal reading of the OSM `building:levels=4` tag: the map's storey count does not describe all numbered interior levels or establish their heights.
- Page 11 of that handbook contains a clear library interior photograph: grey tile floor, cream walls, white ceiling beams, suspended linear lights, tall white windows, dark bookcases and a timber/glass study partition. It is a reference to visible materials, not a measured drawing. The academic-year label dates the document, not necessarily every photograph or the room's 2026 condition. Image reuse rights were not established.
- The [2024–2025 handbook](https://hersleb.vgs.no/siteassets/dokumentarkiv/elevboken-2024-2025-.pdf), 28 pages, independently describes the rear stair from plan 0/1 beside the auditorium and from plan 3 beside IKT up to plan 4 (page 8). Neither inspected handbook supplied a scaled, complete floor plan.
- The [official “Bli bedre kjent med skolen vår” article](https://hersleb.vgs.no/nyhetsarkiv/apen-dag-2.2-kl.-17-18-og-19/), published 25 January 2022 and updated 17 January 2023, embeds a film made for Åpen dag 2022: [Hersleb school film](https://www.youtube.com/watch?v=H7wAzXkPxoE). The embed was verified in the school page's HTML. Both the ordinary YouTube watch and embed requests returned proxy CONNECT 403, so the video was **not watched** and no additional geometry was inferred from it.
- The [current open-day article](https://hersleb.vgs.no/nyhetsarkiv/velkommen-til-apen-dag-52.-februar), published 17 December 2025 and updated 3 March 2026, explicitly says that KDA started in 2023–2024 and **entirely new workshops were built**. It also places the sports hall across the street. Thus even a recovered 2014 renovation drawing or the 2022 film would require checking against later workshop changes before claiming a current 1:1 interior. The article links 2025–2026 activity photographs but no measured plan.

The reachable official search returned no indexed hits for `plantegning`, `romkart`, `rømningsplan`, `ombygging`, `oppussing`, `renovering` or `virtuell`. This is a result of those queries on this site's index, not proof that plans do not exist. The inspected open-day pages, student handbooks and September 2025 parent-meeting presentation did not supply the missing measured geometry. Raw search responses and the downloaded PDFs are kept outside the game under `/workspace/shared/hersleb-deep-research/architecture/`; they are not bundled as assets.

The served classroom-corridor and “vakre buer inne” images display severe green bands in both the originals and the site's resized JPEG versions. They are unsuitable for establishing actual colors; do not model the corruption as a school feature.

Checked official homepage, history, profile, frescoes, library and canteen pages did not reveal a complete measured floor plan or a linked Matterport/360 tour. Standard sitemap and robots endpoints returned 404. This is a result of the inspected sources, not a claim that no public plans exist anywhere.

To complete a defensible 1:1 interior, the remaining necessary evidence is a current scaled plan for each floor, including numbered plan 4, connected staircase/room-door positions and current corridor/room photographs or a walkthrough tied to those plans. Plans must account for the documented 2023–2024 workshop changes. Complete exterior accuracy additionally requires measured heights and reference coverage of every facade and neighboring building in the chosen playable area.

## Public AI/Blender examples matching the requested approach

X search initially redirected to login. After the environment's network settings changed, public author profiles and specific post URLs were readable without authentication. The following post text was retrieved directly; videos were not watched or independently validated.

- [Siddharth Ahuja, 11 March 2025: Blender MCP dragon/dungeon demo](https://x.com/sidahuj/status/1899460492999184534): describes creating a “low-poly dragon guarding treasure” scene by prompts.
- [Siddharth Ahuja, 11 March 2025: Blender scene to interactive Three.js webpage](https://x.com/sidahuj/status/1899584131455209503): explicitly describes asking Claude to read a Blender scene and recreate it as an interactive Three.js webpage. This is the closest verified example of the requested browser asset pipeline.
- [Siddharth Ahuja, 30 September 2026: Blender MCP in Codex](https://x.com/sidahuj/status/2105296620577235212): describes viewing the viewport, selecting objects and editing them inside Codex.
- [Sonnet 5.5 castle benchmark, 29 September 2026](https://x.com/nemumusitocha/status/2104816710331363700), [shared by the Blender MCP author](https://x.com/sidahuj/status/2104822514010685686): explicitly mentions Sonnet 5.5 and Opus 5.5. It quotes an [earlier 6SOL/Astra comparison](https://x.com/nemumusitocha/status/2102560598932521393). These model names closely match the user's memory, but there is no evidence identifying the exact timeline post the user saw.
- The public [Blender MCP repository](https://github.com/ahujasid/blender-mcp), now branded “MCP for Blender”, documents the same scene-to-Three.js example and links a [video demo](https://www.youtube.com/watch?v=jxbNI5L7AH8). Its source license is MIT. It was inspected read-only under `/workspace/shared/reference-blender-mcp`.

These sources support the workflow of generating and inspecting 3D assets in Blender, then building interaction in a browser engine. A generated 3D castle or scene demo does not by itself establish a complete survival-horror game.

## Remaining research access limits

Normal HTTPS requests to Hersleb's official site, its public search API and PDFs, Norwegian Wikipedia, OpenStreetMap, Oslo Byleksikon, OsloBilder, Wikimedia image delivery and the specific X posts succeeded after the reported runtime update. Some older renovation/project references remained blocked by the proxy: `www.ifi.no`, `www.bygg.no`, `kulturpunkt.org` and Wikimedia Commons pages.

The renewed search specifically tested authoritative building-record and height-data services. [Oslo's public building-case information](https://www.oslo.kommune.no/plan-bygg-og-eiendom/innsyn-i-byggesaker/), [PBE Saksinnsyn](https://innsyn.pbe.oslo.kommune.no/saksinnsyn/), [Oslo's PBE map](https://od2.pbe.oslo.kommune.no/kart/), [Geonorge's catalogue](https://kartkatalog.geonorge.no/), [Geonorge downloads](https://nedlasting.geonorge.no/) and [Høydedata LaserInnsyn](https://hoydedata.no/LaserInnsyn2/) all returned proxy CONNECT 403 before their origins were reached. National Library and Arkivportalen catalogue requests were also blocked. No municipal case number, drawing attachment, completion drawing, classified LiDAR tile or measured eave/ridge height was obtained. This access result does not establish whether those services contain useful public school records. Historical photographs found on OsloBilder do not establish the current post-renovation interior.

The highest-value concrete public sources to make reachable are:

1. [PBE Saksinnsyn](https://innsyn.pbe.oslo.kommune.no/saksinnsyn/) for **Herslebs gate 20B**, to identify public 2012–2014 renovation/completion drawings and any later workshop alteration records. No relevant attachment ID has yet been verified.
2. The [officially linked school film](https://www.youtube.com/watch?v=H7wAzXkPxoE), to inspect the 2022 visible interior while preserving its date limitation.
3. [Bygg's cited 2014 project article](https://www.bygg.no/article/1206757!/) and [IFI's cited materials article](https://www.ifi.no/gammel-skole-blir-som-ny), potential architect/renovation/detail leads. Their publication names and URLs were retrieved from Wikipedia's citations; their article bodies remain inaccessible here.
4. [Geonorge](https://kartkatalog.geonorge.no/) and [Høydedata](https://hoydedata.no/LaserInnsyn2/), to identify appropriately dated roof/ground LiDAR coverage and then verify its datum, accuracy and license. A terrain-point elevation alone would not establish school wall or roof heights.

The municipal request manifests and precise access report are saved outside the repository at `/workspace/shared/hersleb-deep-research/municipal/FINDINGS.md`. Saving suggested allowed domains alone does not prove a running environment's network policy changed; a successful retry is required. No proxy bypass, disabled TLS verification, portal login, private-school access or contact with anyone was used. There is enough public evidence to improve the prototype, but not enough to claim the user's full 1:1 requirement is met.
