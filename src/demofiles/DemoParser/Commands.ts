// Port of gallantlab/DemoFiles DemoParser/Commands.py (the Portal 2 relevant tables; the
// Counter-Strike: Global Offensive numbering the Python keeps for reference is omitted).

/** Frame types of demo protocol 3 (Counter-Strike: Source, Portal 1) */
export const CommandProto24 = {
  Signon: 1,
  Packet: 2,
  SyncTick: 3,
  ConsoleCommand: 4,
  UserCommand: 5,
  DataTables: 6,
  Stop: 7,
  StringTables: 8,
} as const

/** Frame types of demo protocol 4 (Portal 2) */
export const CommandProto36 = {
  Signon: 1,
  Packet: 2,
  SyncTick: 3,
  ConsoleCommand: 4,
  UserCommand: 5,
  DataTables: 6,
  Stop: 7,
  CustomData: 8,
  StringTables: 9,
} as const

export interface CommandSet {
  readonly Signon: number
  readonly Packet: number
  readonly SyncTick: number
  readonly ConsoleCommand: number
  readonly UserCommand: number
  readonly DataTables: number
  readonly Stop: number
  readonly StringTables: number
  readonly CustomData?: number
}

/** Net/svc message types inside Signon and Packet payloads for demo protocol 4 (Portal 2) */
export const NetSvcMessagesProtocol4 = {
  NetNop: 0,
  NetDisconnect: 1,
  NetFile: 2,
  NetSplitScreenUser: 3,
  NetTick: 4,
  NetStringCmd: 5,
  NetSetConVar: 6,
  NetSignonState: 7,
  SvcServerInfo: 8,
  SvcSendTable: 9,
  SvcClassInfo: 10,
  SvcSetPause: 11,
  SvcCreateStringTable: 12,
  SvcUpdateStringTable: 13,
  SvcVoiceInit: 14,
  SvcVoiceData: 15,
  SvcPrint: 16,
  SvcSounds: 17,
  SvcSetView: 18,
  SvcFixAngle: 19,
  SvcCrosshairAngle: 20,
  SvcBspDecal: 21,
  SvcSplitScreen: 22,
  SvcUserMessage: 23,
  SvcEntityMessage: 24,
  SvcGameEvent: 25,
  SvcPacketEntities: 26,
  SvcTempEntities: 27,
  SvcPrefetch: 28,
  SvcMenu: 29,
  SvcGameEventList: 30,
  SvcGetCvarValue: 31,
  SvcCmdKeyValues: 32,
  SvcPaintmapData: 33,
} as const

/** Net/svc message types for demo protocol 3 (Counter-Strike: Source, Portal 1) */
export const NetSvcMessagesProtocol3 = {
  NetNop: 0,
  NetDisconnect: 1,
  NetFile: 2,
  NetTick: 3,
  NetStringCmd: 4,
  NetSetConVar: 5,
  NetSignonState: 6,
  SvcPrint: 7,
  SvcServerInfo: 8,
  SvcSendTable: 9,
  SvcClassInfo: 10,
  SvcSetPause: 11,
  SvcCreateStringTable: 12,
  SvcUpdateStringTable: 13,
  SvcVoiceInit: 14,
  SvcVoiceData: 15,
  SvcSounds: 17,
  SvcSetView: 18,
  SvcFixAngle: 19,
  SvcCrosshairAngle: 20,
  SvcBspDecal: 21,
  SvcUserMessage: 23,
  SvcEntityMessage: 24,
  SvcGameEvent: 25,
  SvcPacketEntities: 26,
  SvcTempEntities: 27,
  SvcPrefetch: 28,
  SvcMenu: 29,
  SvcGameEventList: 30,
  SvcGetCvarValue: 31,
  SvcCmdKeyValues: 32,
} as const

export type NetMessageName = keyof typeof NetSvcMessagesProtocol4

/** User message types of Portal 2, indexed by the type byte of a SvcUserMessage */
export const Portal2UserMessages = {
  Geiger: 0,
  Train: 1,
  HudText: 2,
  SayText: 3,
  SayText2: 4,
  TextMsg: 5,
  HUDMsg: 6,
  ResetHUD: 7,
  GameTitle: 8,
  ItemPickup: 9,
  ShowMenu: 10,
  Shake: 11,
  Tilt: 12,
  Fade: 13,
  VGUIMenu: 14,
  Rumble: 15,
  Battery: 16,
  Damage: 17,
  VoiceMask: 18,
  RequestState: 19,
  CloseCaption: 20,
  CloseCaptionDirect: 21,
  HintText: 22,
  KeyHintText: 23,
  SquadMemberDied: 24,
  AmmoDenied: 25,
  CreditsMsg: 26,
  LogoTimeMsg: 27,
  AchievementEvent: 28,
  UpdateJalopyRadar: 29,
  CurrentTimescale: 30,
  DesiredTimescale: 31,
  InventoryFlash: 32,
  CreditsPortalMsg: 33,
  IndicatorFlash: 34,
  ControlHelperAnimate: 35,
  TakePhoto: 36,
  Flash: 37,
  HudPingIndicator: 38,
  OpenRadialMenu: 39,
  AddLocator: 40,
  MPMapCompleted: 41,
  MPMapIncomplete: 42,
  MPMapCompletedData: 43,
  MPTauntEarned: 44,
  MPTauntUnlocked: 45,
  MPTauntLocked: 46,
  MPAllTauntsLocked: 47,
  PortalFXSurface: 48,
  PaintWorld: 49,
  PaintEntity: 50,
  ChangePaintColor: 51,
  PaintBombExplode: 52,
  RemoveAllPaint: 53,
  PaintAllSurfaces: 54,
  RemovePaint: 55,
  StartSurvey: 56,
  ApplyHitBoxDamageEffect: 57,
  SetMixLayerTriggerFactor: 58,
  TransitionFade: 59,
  ScoreboardTempUpdate: 60,
  ChallengeModCheatSession: 61,
  ChallengeModCloseAllUI: 62,
} as const

export type Portal2UserMessageName = keyof typeof Portal2UserMessages

/** Name of a Portal 2 user message type by its type byte */
export const Portal2UserMessageNames: Record<number, Portal2UserMessageName> = Object.fromEntries(
  Object.entries(Portal2UserMessages).map(([name, value]) => [value, name])
) as Record<number, Portal2UserMessageName>
