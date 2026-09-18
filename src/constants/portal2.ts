// Portal 2 co-op constants for the viewer

export type PlayerRole = 'blue' | 'orange' | 'unknown'

// m_iTeamNum values of the two bots
export const TEAM_BLUE = 3
export const TEAM_ORANGE = 2

export const PLAYER_ROLE_NAMES: Record<PlayerRole, string> = {
  blue: 'Atlas',
  orange: 'P-body',
  unknown: 'Player',
}

export const PLAYER_ROLE_COLORS: Record<PlayerRole, string> = {
  blue: '#3d9bff',
  orange: '#ff8a1e',
  unknown: '#cccccc',
}

// portal colours by firing player role and portal number (1 = primary fire, 2 = secondary fire)
export const PORTAL_COLORS: Record<PlayerRole, [string, string]> = {
  blue: ['#2fa3ff', '#b05cff'],
  orange: ['#ff8a1e', '#ff3838'],
  unknown: ['#dddddd', '#999999'],
}

// portal dimensions in units (CProp_Portal half width and half height)
export const PORTAL_HALF_WIDTH = 32
export const PORTAL_HALF_HEIGHT = 54

// bot dimensions in units
export const PLAYER_HEIGHT = 72
export const PLAYER_RADIUS = 16
export const EYE_HEIGHT_STANDING = 64
export const EYE_HEIGHT_DUCKED = 28

// weighted storage cube edge length and floor button radius in units
export const CUBE_SIZE = 36
export const FLOOR_BUTTON_RADIUS = 40

// glTF bot models, served from public/models/players when present. The cloud environment cannot
// export them (see specs/portal2-coop-replacement.md section 5); null renders the placeholder.
export const BOT_MODEL_FILES: Record<PlayerRole, string | null> = {
  blue: '/models/players/atlas.glb',
  orange: '/models/players/pbody.glb',
  unknown: null,
}

// Rumble user message effects of the portal gun
export const RUMBLE_PORTALGUN_LEFT = 25
export const RUMBLE_PORTALGUN_RIGHT = 26
export const RUMBLE_PORTAL_PLACEMENT_FAILURE = 27

// The co-op campaign maps, in course order. Map assets are looked up under
// public/models/maps/<map name>/ and are absent until converted (section 5 of the plan).
export const PORTAL2_COOP_MAPS: string[] = [
  'mp_coop_start',
  'mp_coop_lobby_2',
  'mp_coop_lobby_3',
  'mp_coop_doors',
  'mp_coop_race_2',
  'mp_coop_laser_2',
  'mp_coop_rat_maze',
  'mp_coop_laser_crusher',
  'mp_coop_teambts',
  'mp_coop_fling_3',
  'mp_coop_infinifling_train',
  'mp_coop_come_along',
  'mp_coop_fling_1',
  'mp_coop_catapult_1',
  'mp_coop_multifling_1',
  'mp_coop_fling_crushers',
  'mp_coop_fan',
  'mp_coop_wall_intro',
  'mp_coop_wall_2',
  'mp_coop_catapult_wall_intro',
  'mp_coop_wall_block',
  'mp_coop_catapult_2',
  'mp_coop_turret_walls',
  'mp_coop_turret_ball',
  'mp_coop_wall_5',
  'mp_coop_tbeam_redirect',
  'mp_coop_tbeam_drill',
  'mp_coop_tbeam_catch_grind_1',
  'mp_coop_tbeam_laser_1',
  'mp_coop_tbeam_polarity',
  'mp_coop_tbeam_polarity2',
  'mp_coop_tbeam_polarity3',
  'mp_coop_tbeam_maze',
  'mp_coop_tbeam_end',
  'mp_coop_paint_come_along',
  'mp_coop_paint_redirect',
  'mp_coop_paint_bridge',
  'mp_coop_paint_walljumps',
  'mp_coop_paint_speed_fling',
  'mp_coop_paint_red_racer',
  'mp_coop_paint_speed_catch',
  'mp_coop_paint_longjump_intro',
  'mp_coop_separation_1',
  'mp_coop_tripleaxis',
  'mp_coop_catapult_catch',
  'mp_coop_2paints_1bridge',
  'mp_coop_paint_conversion',
  'mp_coop_bridge_catch',
  'mp_coop_laser_tbeam',
  'mp_coop_paint_rat_maze',
  'mp_coop_paint_crazy_box',
  'mp_coop_credits',
]

export const DEFAULT_MAP = 'mp_coop_laser_crusher'

// Console commands that are noise in the event log (voice toggles, sound cvars, key presses)
export const CONSOLE_COMMAND_NOISE = [
  /^cmd\d+ /,
  /^voice_/,
  /^dsp_/,
  /^room_type/,
  /^snd_/,
  /^gameui_/,
  /^ss_force/,
  /^exec /,
  /^cl_playermodel/,
  /^[+-]/,
]
