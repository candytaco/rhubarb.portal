#!/usr/bin/env bash
#
# Convert every mp_coop_* map in the game directory, with skybox conversion on
# and skyboxes written as PNG.  The maps are dealt out over 20 detached screen
# sessions named convert-coop-0 .. convert-coop-19, each converting its share
# one map at a time.  Attach with: screen -r convert-coop-0

mapNames=(
	mp_coop_catapult_1
	mp_coop_catapult_2
	mp_coop_catapult_wall_intro
	mp_coop_come_along
	mp_coop_credits
	mp_coop_doors
	mp_coop_fan
	mp_coop_fling_1
	mp_coop_fling_3
	mp_coop_fling_crushers
	mp_coop_infinifling_train
	mp_coop_laser_2
	mp_coop_laser_crusher
	mp_coop_lobby_2
	mp_coop_multifling_1
	mp_coop_paint_bridge
	mp_coop_paint_come_along
	mp_coop_paint_longjump_intro
	mp_coop_paint_redirect
	mp_coop_paint_red_racer
	mp_coop_paint_speed_catch
	mp_coop_paint_speed_fling
	mp_coop_paint_walljumps
	mp_coop_race_2
	mp_coop_rat_maze
	mp_coop_start
	mp_coop_tbeam_catch_grind_1
	mp_coop_tbeam_drill
	mp_coop_tbeam_end
	mp_coop_tbeam_laser_1
	mp_coop_tbeam_maze
	mp_coop_tbeam_polarity
	mp_coop_tbeam_polarity2
	mp_coop_tbeam_polarity3
	mp_coop_tbeam_redirect
	mp_coop_teambts
	mp_coop_turret_ball
	mp_coop_turret_walls
	mp_coop_wall_2
	mp_coop_wall_5
	mp_coop_wall_block
	mp_coop_wall_intro
)

scriptDir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scriptPath="$scriptDir/$(basename "${BASH_SOURCE[0]}")"
lockDir="$scriptDir/temp/locks"
sessionCount=18

if [ "${1:-}" != "--worker" ]; then
	for ((sessionIndex = 0; sessionIndex < sessionCount; sessionIndex++)); do
		screen -dmS "convert-coop-$sessionIndex" bash "$scriptPath" --worker
	done
	echo "Started $sessionCount screen sessions: convert-coop-0 .. convert-coop-$((sessionCount - 1))"
	exit 0
fi

mkdir -p "$lockDir"

for mapName in "${mapNames[@]}"; do
	lockFile="$lockDir/$mapName.lock"

	# noclobber makes the redirect fail when the lock file already exists, which
	# claims the map for this instance in one atomic step.
	if ! (set -o noclobber; echo "$$" > "$lockFile") 2>/dev/null; then
		echo "Skipping $mapName: claimed by PID $(cat "$lockFile")"
		continue
	fi

	echo "Converting $mapName"
	node "$scriptDir/convert-map.mjs" --map "$mapName" --skip-skybox false --skybox-image-format png
done
