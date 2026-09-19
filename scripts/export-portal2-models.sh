#!/usr/bin/env bash

scriptDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repoRoot="$(cd "$scriptDir/.." && pwd)"

blender -b -noaudio --python "$scriptDir/plumber_import_mdl.py" -- \
	--model "models/player/ballbot/ballbot.mdl=$repoRoot/public/models/players/atlas.glb" \
	--model "models/player/eggbot/eggbot.mdl=$repoRoot/public/models/players/pbody.glb" \
	--model "models/props/metal_box.mdl=$repoRoot/public/models/props/companion_cube.glb" \
	--model "models/props/reflection_cube.mdl=$repoRoot/public/models/props/reflection_cube.glb" \
	--model "models/props_gameplay/mp_ball.mdl=$repoRoot/public/models/props/mp_ball.glb" \
	--model "models/props_underground/underground_weighted_cube.mdl=$repoRoot/public/models/props/underground_weighted_cube.glb"
