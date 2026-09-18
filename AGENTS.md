# AGENTS.md — Operational Details for AI Agents

## Build & Dev

- **Package manager**: npm (`yarn` not installed). Install with `npm install --legacy-peer-deps`; `postprocessing` declares a peer dependency on an older `three` and a plain `npm install` fails on it
- **Build**: `npm run build` — completes in ~15s; the parse worker is bundled separately (`vite.config.mts` gives it the tsconfig path aliases through `worker.plugins`)
- **Type check**: `npx tsc --noEmit` — clean; keep it that way
- **Format**: `npx prettier --write <files>` with the repo config (`prettier.config.js`, Tailwind class sorting)
- **Dev server**: `npm run dev` (Vite)
- **Parser validation**: `node --experimental-strip-types scripts/portal2/dump-demo.mts <demo.dem> [<partner demo.dem>]` runs the parser under Node; targets for the public sdp demos are in `specs/portal2-coop-replacement.md` section 6. The `src/demofiles` modules must stay free of bundler and browser features and use `import type` for type-only imports so Node's type stripping accepts them
- **Sample demo**: `public/samples/portal2_coop.dem` (one player's demo of `mp_coop_laser_crusher`); the URL `/?demoUrl=/samples/portal2_coop.dem` loads it in a dev or preview server
- **Headless browser validation**: Playwright with Chromium needed `--use-angle=swiftshader --enable-unsafe-swiftshader --enable-webgl --ignore-gpu-blocklist` for WebGL, and `--no-proxy-server` in sandboxes that route Chromium through an HTTPS proxy; runtime perf logs are enabled with `?perf=true`
- **Converter config precedence**: `scripts/convert-config.json` overrides `scripts/convert-map.mjs` defaults when present. The checked-in config still points at Team Fortress 2 directories; retarget `game-dir`/`hl2-dir` to the Portal 2 install before converting co-op maps (spec section 5)
- **Converter validation reruns**: pass `--chunk-grid 8` explicitly while `scripts/convert-config.json` still pins `chunk-grid=4`; `--skip-material-truth true` skips the slow VPK material scan when validating chunking/visibility output
- **Converter resume path**: `node scripts/convert-map.mjs ... --metadata-only true` reuses the temp BSP/VMF/GLBs/lightmaps to finish skybox, teleports, visibility, and `conversion.json` after a late-stage failure; skybox conversion still needs `vtf2img` importable from the `python3` on `PATH`
- **Framework**: React + Three.js (react-three-fiber) + Zustand + Tailwind

## Project Structure

- `src/demofiles/` — TypeScript port of gallantlab/DemoFiles (`DemoParser/` demo format, `Portal2/` tracked entities, single-demo parser and two-demo merge, `Numeric.ts` numpy replacements)
- `src/components/Analyse/Data/` — Parse worker (`ParseWorker.ts`), its main-thread client (`SessionParser.ts`), the session assembly (`SessionBuilder.ts`) and the transferable session shape (`Session.ts`)
- `src/utils/session.ts` — Per-row accessors for player, portal and entity frames
- `src/constants/portal2.ts` — Roles, colours, dimensions, co-op map list, expected bot model files
- `src/components/Scene/` — 3D scene rendering (World, Actors, Portals, PuzzleElements, Skybox, Lights, Stickers)
- `src/components/DemoViewer.tsx` — Main playback engine
- `src/pages/ViewerPage.tsx` — Page grid: viewer in the left two thirds, recording placeholders and session details on the right
- `src/components/UI/` — UI panels (PlaybackPanel, SettingsPanel, EventLogPanel, EventFeed, PlayerStatuses, SessionSidebar)
- `src/zustand/store.ts` — Global state store
- `public/models/maps/<map>/` — Converted map assets (none checked in); `public/models/players/` — bot models `atlas.glb`, `pbody.glb` (none checked in)
- `specs/portal2-coop-replacement.md` — Plan, deviations from the Python reference, asset pipeline notes, validation targets

## Git

- Remote: `origin` (candytaco/rhubarb.portal), forked from bryjch/dribble.tf
