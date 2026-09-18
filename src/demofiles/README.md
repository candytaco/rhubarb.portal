# demofiles

TypeScript port of the Portal 2 co-op demo parser in [gallantlab/DemoFiles](https://github.com/gallantlab/DemoFiles), module for module. `DemoParser/` mirrors `DemoFiles/DemoParser/*.py` (bit reader, frames, net/svc message stream, string tables, game events, user messages, data tables, entity decoding) and `Portal2/` mirrors `DemoFiles/Portal2/*.py` (tracked classes and properties, per-tick series, the single-demo parser and the two-demo merge on the server tick clock). `Numeric.ts` replaces the numpy calls.

Class names are the Python names and method names are the Python names with a lowercase first letter. The modules import each other with explicit `.ts` extensions and use no browser or bundler features, so they run under Node for validation:

```
node --experimental-strip-types scripts/portal2/dump-demo.mts <demo.dem> [<partner demo.dem>]
```

Deviations from the Python are listed in `specs/portal2-coop-replacement.md`, section 4. The demo format itself is documented in the DemoFiles repository (`Demofile structure.md`).
