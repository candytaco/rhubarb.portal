# Portal 2 co-op replacement plan

This document records the plan for turning the TF2 STV viewer (dribble.tf fork) into a viewer for Portal 2 co-op demos, what has been implemented on the `claude/serene-babbage-f5sqt5` branch, and what remains. The parser logic follows the Python reference in gallantlab/DemoFiles (`DemoFiles/DemoParser/*.py` and `DemoFiles/Portal2/*.py`), which itself follows NeKzor/sdp for the demo format and UncraftedName/UntitledParser for entity decoding. Nothing about the demo format was re-derived here; where the port deviates from the Python, the deviation is listed in section 4.

## 1. Goal

Load one or two Portal 2 co-op demo files (`.dem`, demo protocol 4, network protocol 2001, game directory `portal2`) recorded by the two players of the same session, and replay the session in the browser: both players, their portals, cubes, floor buttons, doors and lasers in a 3D view of the map, with a merged event stream (portal shots, portal traversals, chat, console commands, pauses, level transitions, scanner pulses). A single first-person demo is also accepted; the partner then comes from the entity state that demo carries.

The 3D viewport occupies the left two thirds of a widescreen page. The right third holds placeholders for the two players' screen recordings, which a later phase plays back in sync with the demo clock.

## 2. Architecture

### 2.1 Parsing

Parsing runs in a Web Worker (`src/components/Analyse/Data/ParseWorker.ts`), as before. The TF2 WASM parser (`src/libs/parser2`) is removed. The worker uses `src/demofiles`, a module-for-module TypeScript port of gallantlab/DemoFiles:

| Python module | TypeScript module | Content |
|---|---|---|
| `DemoParser/BitBuffer.py` | `src/demofiles/DemoParser/BitBuffer.ts` | LSB-first bit reader, coord readers, UBitInt, field index |
| `DemoParser/Commands.py` | `src/demofiles/DemoParser/Commands.ts` | frame types, net/svc tables, Portal 2 user message table |
| `DemoParser/DemoFrame.py`, `DemoFrameData.py` | `src/demofiles/DemoParser/DemoFrame.ts` | frame header, CmdInfo, sequence, raw payloads |
| `DemoParser/UserCommands.py` | `src/demofiles/DemoParser/UserCommands.ts` | UserCmd fields, button bits, Portal 2 tail |
| `DemoParser/NetMessages.py` | `src/demofiles/DemoParser/NetMessages.ts` | net/svc message stream |
| `DemoParser/StringTables.py` | `src/demofiles/DemoParser/StringTables.ts` | StringTables frame, delta updates, LZSS, userinfo |
| `DemoParser/GameEvents.py` | `src/demofiles/DemoParser/GameEvents.ts` | event descriptors and decoding |
| `DemoParser/UserMessages.py` | `src/demofiles/DemoParser/UserMessages.ts` | Portal 2 user messages |
| `DemoParser/DataTables.py` | `src/demofiles/DemoParser/DataTables.ts` | send tables, server classes, flattened props |
| `DemoParser/Entities.py` | `src/demofiles/DemoParser/Entities.ts` | entity snapshot and property decoding |
| `DemoParser/DemofileParser.py` | `src/demofiles/DemoParser/DemofileParser.ts` | header, frame loop, tick normalisation, entity replay |
| `Portal2/Structures.py` | `src/demofiles/Portal2/Structures.ts` | tracked classes and properties, descriptors, histories |
| `Portal2/EntityTimeSeries.py` | `src/demofiles/Portal2/EntityTimeSeries.ts` | per-tick series from histories |
| `Portal2/Portal2DemoFileParser.py` | `src/demofiles/Portal2/Portal2DemoFileParser.ts` | one demo: positions, server ticks, chat, TTL, events, entity states |
| `Portal2/Portal2CoopDemoFilesParser.py` | `src/demofiles/Portal2/Portal2CoopDemoFilesParser.ts` | two demos merged on the server tick clock |
| numpy | `src/demofiles/Numeric.ts` | interp, unique, searchsorted, median, diff |

The port keeps the Python class names and method names (first letter lowercased). The modules import each other with explicit `.ts` extensions and use no browser or bundler features, so they run unchanged under Node (`node --experimental-strip-types`) for validation against sdp, which is how the Python was validated. `scripts/portal2/dump-demo.mts` prints the same inventory as the Node script in the DemoFiles plan.

### 2.2 Session model

The worker turns one parser or one co-op parser into a `Portal2Session` (`src/components/Analyse/Data/Session.ts`), a plain object of typed arrays that transfers to the main thread without copying:

- `tickAxis`: the labels of the playback axis. One demo: demo ticks `0..numTicks-1`. Two demos: the consecutive server ticks covered by both demos (`Portal2CoopDemoFilesParser.getSynchronizedServerTicks`). Playback indexes this axis; every series below has one row per axis entry.
- `players`: one entry per player entity slot, in slot order, with the entity index, name and user id from the `userinfo` table, the role (blue for team 3, orange for team 2), which demo the player recorded (if any), a `PlayerDescriptor` series (origin, eye pitch and yaw, attached object, holding flag, health, life state, team, portal environment, server tick) and, for a player who recorded one of the demos, a `viewSeries` from the CmdInfo blocks (view origin and full view angles including roll) resampled onto the axis.
- `portals`: four series in `PortalSlot` order (player 1 portal 1, player 1 portal 2, player 2 portal 1, player 2 portal 2) with `PortalDescriptor` columns (entity index, placement origin, absolute angles, activated, is portal 2, fired by, linked portal, server tick), or null for a portal never fired.
- `cubes`, `floorButtons`, `doors`, `lasers`: series keyed by entity index and serial.
- `events`: the merged event list sorted by axis tick, each with the source demo index: game events (`portal_fired`, `player_landed`, `player_death`, `player_use`, `portal_player_portaled`, `player_team`, and every other decoded event), portal traversals from the entity-portalled ring buffer, chat, pauses, level transitions, TTL pulses.
- `chat`, `ttlTicks`, `pauseIntervals`, `levelTransitionTicks`, `traversals`: the same data in the shapes the panels use.
- `bounds`: min and max over every recorded origin, used for the camera and for the map fallback.
- `demos`: header fields of each demo, the local player entity index, the sync tick and the frame counts.

### 2.3 Two-demo merge

The merge is the DemoFiles co-op parser unchanged: each Packet frame's NetTick gives the server tick, `demoTicksToServerTicks` interpolates between packets, the axis is the intersection of both demos' server tick ranges, per-frame values are resampled onto it, entity histories from both demos are merged per (entity index, serial) with the recording player's own demo listed first because it carries that player's origin at full precision, and portal traversals reported by both demos are kept once at the earlier server tick. TTL chat messages from both demos are merged by clustering within half the median pulse spacing and repaired with `repairTTLs`.

### 2.4 Rendering

The scene (`src/components/Scene`) keeps the react-three-fiber structure, the three camera modes, stickers, drawing and the world loader. TF2-specific components (projectiles, heal beam, class models) are removed. New components read the session series at the current axis index:

- `Actors.tsx`: two bots. Position from the entity origin; eye from the view series when present. Models load from `public/models/players/atlas.glb` and `pbody.glb` when those files exist, otherwise a capsule placeholder in the role colour (see section 5).
- `Portals.tsx`: an elliptical ring at the placement origin, oriented by the absolute angles, coloured by role and portal number, shown while activated.
- `PuzzleElements.tsx`: cubes as boxes, floor buttons as discs whose colour follows the button state, doors as frames, lasers as lines between start and end while on.
- `World.tsx`: loads the converted map when the folder exists under `public/models/maps/<map>/`; otherwise shows a ground grid at the lowest recorded origin and the session bounds, with a notice instead of the previous blocking alert.

### 2.5 UI

- `EventFeed` replaces the killfeed: events within a window before the current tick, colour coded by player.
- `EventLogPanel` replaces the match killfeed panel: every event with a text filter and type toggles; clicking seeks.
- `PlayerStatuses` shows the two bots: name, role, health, held object, portal environment, and both portals' state.
- `FocusedPlayer`, `ChatHud` (TTL pulses excluded from the HUD), `PlaybackPanel` (level transitions, pauses and TTL pulses as timeline markers; tick label from the axis; 60 ticks per second), `SettingsPanel` (portal, cube, laser and trail toggles; event seek buffer), `AboutPanel` (rebranded, Portal 2 co-op map list, sample demo), `DemoDropzone` (one or two `.dem` files), `UrlDemoNotice` (`?demoUrl=` and `?demoUrl2=`).
- Stickers: the class stickers become two bot stickers (blue, orange); symbol stickers stay. The saved setup format bumps to version 2.

### 2.6 Layout

`ViewerPage` is a grid on screens 1024 px and wider: the viewer in the left two thirds, a column on the right with two `RecordingPlaceholder` panels (player 1 and player 2) and the space reserved for their controls. Overlays are positioned relative to the viewer cell, not the window, and the POV camera aspect follows the canvas size. Below 1024 px the column stacks under the viewer.

## 3. Phases

1. Plan and survey (this document). Done.
2. DemoParser port. Done; validated against sdp's public `portal2.dem` and `portal2_coop.dem` (section 6).
3. Portal2 layer port and co-op merge. Done; the merge is exercised on a demo pair made of the same demo twice because no two-player recording of one session is available in the cloud environment. A pair of real partner demos has not been run through the merge yet.
4. Session model, worker, store. Done; `npx tsc --noEmit` and `npm run build` pass.
5. Scene and UI replacement, layout. Done; smoke tested in headless Chromium with the sample demo (section 6). Not exercised by hand: the drawing tools, saved setups and bookmarks after the sticker format change, and the POV camera on a two-demo session.
6. TF2 asset removal, branding, docs. Done.
7. Map assets for the co-op maps. Not possible in the cloud environment (section 5).
8. Bot models. Not possible in the cloud environment (section 5).
9. Screen recording playback in the placeholders (section 7).

## 4. Deviations from the Python reference

- numpy arrays are `Float64Array` or plain arrays; unset values are `NaN` as in the Python series.
- Steam ids (64-bit) are read as two 32-bit halves and kept as a decimal string.
- The header strings are decoded with `TextDecoder`; `frame.contains` (the bit-shifted substring search) is ported but unused because the level transition is found from the decoded console commands, as the Python does since phase 5 of its plan.
- Progress callbacks are added to `parseFile` and `parseEntities` for the worker's progress bar.
- `tickEventsToTRs` and `tickValuesToTRs` (per-TR aggregation for the scanner) are not ported; `repairTTLs` is, because the co-op TTL merge uses it.
- Laser series (`LaserDescriptor`: origin, start, end, on) are added on top of the tracked `CPortalLaser` class, which the Python tracks but exposes only as histories.
- Every user message type is decoded through the same table as the Python; undecoded types keep their payload.

## 5. Map assets and models (not done in the cloud environment)

The map pipeline (`scripts/convert-map.mjs`) needs the game files, bspsrc (Java) and Blender with the plumber VMF importer. None of these exist in the cloud environment, and the Portal 2 BSPs live inside `portal2/pak01_dir.vpk` rather than as loose files, so the converter also needs a VPK extraction step (`scripts/extract-vpk.py` covers the material scan, not map extraction). The checked-in `scripts/convert-config.json` still points `game-dir` and `hl2-dir` at a Team Fortress 2 install. To produce assets on a machine with Portal 2 installed:

1. Extract `maps/mp_coop_*.bsp` from `Portal 2/portal2/pak01_dir.vpk` (for example with `vpk` from the `vpk` Python package, already a dependency of `extract-vpk.py`).
2. Point `scripts/convert-config.json` at the Portal 2 directories: `game-dir` to `Portal 2/portal2`, `hl2-dir` to `Portal 2/platform` or the shared `hl2` content, and run `node scripts/convert-map.mjs --map mp_coop_wall_2 --bsp-path <extracted bsp>`.
3. Copy the output folder to `public/models/maps/mp_coop_wall_2/` (`textured_compressed.glb`, `conversion.json`, `lightmap_atlas.png`). `src/utils/game.ts` maps every co-op map name to its own folder; nothing else needs changing.
4. Skyboxes: the co-op maps use `sky_day01_01` and others named in `SvcServerInfo.skyName`; extract the six faces with `convert-vtf.py` into `public/models/skybox/<sky>/` and add the map to `MAP_SKYBOX_MAP`.

Bot models: export `models/player/ballbot/ballbot.mdl` (Atlas, blue) and `models/player/eggbot/eggbot.mdl` (P-body, orange) to glTF with the same Blender pipeline used for the TF2 player models, pack with gltfpack, and place them at `public/models/players/atlas.glb` and `public/models/players/pbody.glb`. `src/constants/portal2.ts` lists which model files are present; until then the placeholders render.

The TF2 map folders under `public/models/maps` (270 MB), the TF2 skyboxes, player and projectile models, the kill icons and the TF2 sample demo were removed from the working tree in this branch. They remain in git history.

## 6. Validation

`scripts/portal2/dump-demo.mts` prints, for a demo, the header, frame counts, net message counts, user message and game event inventories, string tables, send table and class counts, the first UserCmd, NetTick samples and the entity decoding result (every `SvcPacketEntities` consumed to its declared bit length). Against sdp's public demos it reproduces the targets from the DemoFiles plan: `portal2.dem` has 18 string tables, 307 send tables and 236 server classes, and its first UserCmd has command number 3299, tick count 100 and view angle Y 9.99755859375; `portal2_coop.dem` (`mp_coop_laser_crusher`) has 1547 Packet frames, 2072 UserCmd frames, 1545 `SvcPacketEntities`, two `player_team` events with user ids 2 and 3 and teams 3 and 2, and `userinfo` entries whose big-endian user ids are 2 and 3.

Feeding `portal2_coop.dem` twice as a demo pair gives 2079 synchronized server ticks, which checks the merge code path but not the alignment of two different recordings.

`public/samples/portal2_coop.dem` is sdp's public co-op demo (MIT licence, NeKzor/sdp), used by the About panel's sample button. It is a single player's demo, so the partner comes from entity state only.

The built viewer was loaded in headless Chromium (Playwright, SwiftShader WebGL) with `/?demoUrl=/samples/portal2_coop.dem`. The demo downloads, parses in the worker and plays: both bots (Zypeh as Atlas from the demo, Klooger as P-body from entity state), the orange and blue portals, the cubes and the laser render over the fallback grid; the event feed reports the portal traversal, the team joins and the three level transitions; the session panel lists the map, demo, clock and players. At 1920 x 1080 the canvas measures 1280 x 1080, the right column holds the two recording placeholders and the session details, and the page has no horizontal scroll; at 800 px wide the column stacks below the viewer. The only console errors are the Google Fonts requests, which the sandbox blocks. The life state of both players reads 2 (dead) from row 27 until they spawn at row 629, so the status bars show "Dead" during the intro; this matches the demo, not a decoding fault.

## 7. Open items

- Screen recording playback: each placeholder needs a `<video>` element, a per-recording offset against the session axis (recordings start before or after the demo), and a play/seek bridge from `playback.tick`. The offset can be estimated from the TTL pulses if the recordings show the scanner trigger, or set by hand in the settings panel.
- The map converter's material overrides and the `team_control_point` filter (`INVISIBLE_NODE_PREFIXES` in `World.tsx`) are TF2-specific; co-op maps have their own tool textures to hide (see `INVISIBLE_TOOL_MATERIALS` in `World.tsx`).
- The Vite dev server and `vite preview` compress responses, so the download progress of a demo requested by URL has no total and stays at 0% until the bytes arrive; the entry is then cleared and the parse progress takes over.
- The sticker symbol set and the saved setups are kept; setups saved under the TF2 build (version 1) are dropped on load.
- Portal 2 co-op maps larger than the current camera far plane (15000 units) do not need changes; the largest co-op map spans under 10000 units.
