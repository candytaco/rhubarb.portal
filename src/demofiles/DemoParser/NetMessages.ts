// Port of gallantlab/DemoFiles DemoParser/NetMessages.py

import { BitBuffer, bitLength, type Vector3Tuple } from './BitBuffer.ts'
import { NetSvcMessagesProtocol3, NetSvcMessagesProtocol4 } from './Commands.ts'
import { GameEventManager, type GameEvent } from './GameEvents.ts'
import type { EntityUpdate } from './Entities.ts'
import type { StringTableEntry, StringTableManager } from './StringTables.ts'
import { UserMessage } from './UserMessages.ts'

/** The parser state the message readers need */
export interface MessageStreamContext {
  newEngine: boolean
  networkProtocol: number | null
  isPortal2: boolean
  stringTableManager: StringTableManager | null
  gameEventManager: GameEventManager | null
}

/** Base of a decoded net/svc message */
export class NetMessage {
  static readonly messageName: string = 'NetMessage'
  messageType: number | null = null
  bitOffset: number = 0 // bit position of the type field within the frame payload

  static read(_buffer: BitBuffer, _parser: MessageStreamContext): NetMessage {
    return new NetMessage()
  }

  /** Name of the message class (stable under minification) */
  get name(): string {
    return (this.constructor as typeof NetMessage).messageName
  }
}

export class NetNop extends NetMessage {
  static readonly messageName = 'NetNop'
  static read(): NetNop {
    return new NetNop()
  }
}

export class NetDisconnect extends NetMessage {
  static readonly messageName = 'NetDisconnect'
  text: string = ''
  static read(buffer: BitBuffer): NetDisconnect {
    const message = new NetDisconnect()
    message.text = buffer.readString()
    return message
  }
}

export class NetFile extends NetMessage {
  static readonly messageName = 'NetFile'
  transferId: number = 0
  fileName: string = ''
  fileRequested: boolean = false
  unknown: boolean | null = null
  static read(buffer: BitBuffer, parser: MessageStreamContext): NetFile {
    const message = new NetFile()
    message.transferId = buffer.readInt()
    message.fileName = buffer.readString()
    message.fileRequested = buffer.readBool()
    if (parser.newEngine) {
      message.unknown = buffer.readBool()
    }
    return message
  }
}

export class NetSplitScreenUser extends NetMessage {
  static readonly messageName = 'NetSplitScreenUser'
  unknown: boolean = false
  static read(buffer: BitBuffer): NetSplitScreenUser {
    const message = new NetSplitScreenUser()
    message.unknown = buffer.readBool()
    return message
  }
}

/** Server tick with host frame timing */
export class NetTick extends NetMessage {
  static readonly messageName = 'NetTick'
  tick: number = 0
  hostFrameTime: number = 0
  hostFrameTimeStdDeviation: number = 0
  static read(buffer: BitBuffer): NetTick {
    const message = new NetTick()
    message.tick = buffer.readInt()
    message.hostFrameTime = buffer.readShort() / 100000
    message.hostFrameTimeStdDeviation = buffer.readShort() / 100000
    return message
  }
}

/** Console command sent over the network */
export class NetStringCmd extends NetMessage {
  static readonly messageName = 'NetStringCmd'
  command: string = ''
  static read(buffer: BitBuffer): NetStringCmd {
    const message = new NetStringCmd()
    message.command = buffer.readString()
    return message
  }
}

export class NetSetConVar extends NetMessage {
  static readonly messageName = 'NetSetConVar'
  conVars: [string, string][] = []
  static read(buffer: BitBuffer): NetSetConVar {
    const message = new NetSetConVar()
    const count = buffer.readByte()
    for (let index = 0; index < count; index++) {
      message.conVars.push([buffer.readString(), buffer.readString()])
    }
    return message
  }
}

export class NetSignonState extends NetMessage {
  static readonly messageName = 'NetSignonState'
  signonState: number = 0
  spawnCount: number = 0
  numServerPlayers: number | null = null
  playerNetworkIds: Uint8Array | null = null
  mapName: string | null = null
  static read(buffer: BitBuffer, parser: MessageStreamContext): NetSignonState {
    const message = new NetSignonState()
    message.signonState = buffer.readByte()
    message.spawnCount = buffer.readInt()
    if (parser.newEngine) {
      message.numServerPlayers = buffer.readInt()
      const idsLength = buffer.readInt()
      message.playerNetworkIds = buffer.readBytes(idsLength)
      const mapNameLength = buffer.readInt()
      message.mapName = mapNameLength > 0 ? buffer.readString(mapNameLength) : ''
    }
    return message
  }
}

/** Server description sent at sign-on */
export class SvcServerInfo extends NetMessage {
  static readonly messageName = 'SvcServerInfo'
  protocol: number = 0
  serverCount: number = 0
  isHltv: boolean = false
  isDedicated: boolean = false
  clientCrc: number = 0
  stringTableCrc: number | null = null
  maxClasses: number = 0
  mapMd5: Uint8Array | null = null
  mapCrc: number | null = null
  playerSlot: number = 0
  maxClients: number = 0
  tickInterval: number = 0
  operatingSystem: string = ''
  gameDirectory: string = ''
  mapName: string = ''
  skyName: string = ''
  hostName: string = ''
  static read(buffer: BitBuffer, parser: MessageStreamContext): SvcServerInfo {
    const message = new SvcServerInfo()
    message.protocol = buffer.readShort()
    message.serverCount = buffer.readInt()
    message.isHltv = buffer.readBool()
    message.isDedicated = buffer.readBool()
    message.clientCrc = buffer.readInt()
    // demo protocol 4 carries the string table CRC before the class count (UntitledParser); sdp reads
    // these 32 bits after maxClients, which misplaces the player slot
    message.stringTableCrc = parser.newEngine ? buffer.readUInt() : null
    message.maxClasses = buffer.readUShort()
    if (parser.networkProtocol === 24) {
      message.mapMd5 = buffer.readBytes(16)
      message.mapCrc = null
    } else {
      message.mapMd5 = null
      message.mapCrc = buffer.readUInt()
    }
    message.playerSlot = buffer.readByte()
    message.maxClients = buffer.readByte()
    message.tickInterval = buffer.readFloat()
    message.operatingSystem = buffer.readChar()
    message.gameDirectory = buffer.readString()
    message.mapName = buffer.readString()
    message.skyName = buffer.readString()
    message.hostName = buffer.readString()
    return message
  }
}

/** Send table sent over the network; the property bits are kept raw */
export class SvcSendTable extends NetMessage {
  static readonly messageName = 'SvcSendTable'
  needsDecoder: boolean = false
  data: BitBuffer | null = null
  static read(buffer: BitBuffer): SvcSendTable {
    const message = new SvcSendTable()
    message.needsDecoder = buffer.readBool()
    const length = buffer.readUShort()
    message.data = buffer.readSubBuffer(length)
    return message
  }
}

export class SvcClassInfo extends NetMessage {
  static readonly messageName = 'SvcClassInfo'
  classCount: number = 0
  createOnClient: boolean = false
  serverClasses: [number, string, string][] = []
  static read(buffer: BitBuffer): SvcClassInfo {
    const message = new SvcClassInfo()
    message.classCount = buffer.readUShort()
    message.createOnClient = buffer.readBool()
    if (!message.createOnClient) {
      const classIdBits = bitLength(message.classCount)
      for (let index = 0; index < message.classCount; index++) {
        message.serverClasses.push([
          buffer.readBits(classIdBits),
          buffer.readString(),
          buffer.readString(),
        ])
      }
    }
    return message
  }
}

export class SvcSetPause extends NetMessage {
  static readonly messageName = 'SvcSetPause'
  paused: boolean = false
  static read(buffer: BitBuffer): SvcSetPause {
    const message = new SvcSetPause()
    message.paused = buffer.readBool()
    return message
  }
}

/** String table creation with its initial entries */
export class SvcCreateStringTable extends NetMessage {
  static readonly messageName = 'SvcCreateStringTable'
  tableName: string = ''
  maxEntries: number = 0
  entryCount: number = 0
  userDataFixedSize: boolean = false
  userDataSize: number = 0
  userDataSizeBits: number = 0
  flags: number = 0
  stringData!: BitBuffer
  entries: [number, StringTableEntry][] = []
  static read(buffer: BitBuffer, parser: MessageStreamContext): SvcCreateStringTable {
    const message = new SvcCreateStringTable()
    message.tableName = buffer.readString()
    message.maxEntries = buffer.readUShort()
    message.entryCount = buffer.readBits(bitLength(message.maxEntries))
    const dataLength = buffer.readBits(20)
    message.userDataFixedSize = buffer.readBool()
    message.userDataSize = message.userDataFixedSize ? buffer.readBits(12) : 0
    message.userDataSizeBits = message.userDataFixedSize ? buffer.readBits(4) : 0
    if (parser.newEngine) {
      message.flags = buffer.readBits(2)
    } else if ((parser.networkProtocol ?? 0) >= 15) {
      message.flags = buffer.readBits(1)
    } else {
      message.flags = 0
    }
    message.stringData = buffer.readSubBuffer(dataLength)
    if (parser.stringTableManager !== null) {
      parser.stringTableManager.createTable(message)
    }
    return message
  }
}

/** String table entry changes */
export class SvcUpdateStringTable extends NetMessage {
  static readonly messageName = 'SvcUpdateStringTable'
  tableId: number = 0
  tableName: string | null = null
  changedEntries: number = 0
  stringData!: BitBuffer
  entries: [number, StringTableEntry][] = []
  static read(buffer: BitBuffer, parser: MessageStreamContext): SvcUpdateStringTable {
    const message = new SvcUpdateStringTable()
    message.tableId = buffer.readBits(5)
    message.changedEntries = buffer.readBool() ? buffer.readUShort() : 1
    const dataLength = buffer.readBits(20)
    message.stringData = buffer.readSubBuffer(dataLength)
    if (parser.stringTableManager !== null) {
      parser.stringTableManager.updateTable(message)
    }
    return message
  }
}

export class SvcVoiceInit extends NetMessage {
  static readonly messageName = 'SvcVoiceInit'
  codec: string = ''
  quality: number = 0
  sampleRate: number | null = null
  static read(buffer: BitBuffer): SvcVoiceInit {
    const message = new SvcVoiceInit()
    message.codec = buffer.readString()
    message.quality = buffer.readByte()
    message.sampleRate = message.quality === 255 ? buffer.readFloat() : null
    return message
  }
}

export class SvcVoiceData extends NetMessage {
  static readonly messageName = 'SvcVoiceData'
  client: number = 0
  proximity: number = 0
  data: BitBuffer | null = null
  static read(buffer: BitBuffer): SvcVoiceData {
    const message = new SvcVoiceData()
    message.client = buffer.readByte()
    message.proximity = buffer.readByte()
    const length = buffer.readUShort()
    message.data = buffer.readSubBuffer(length)
    return message
  }
}

export class SvcPrint extends NetMessage {
  static readonly messageName = 'SvcPrint'
  text: string = ''
  static read(buffer: BitBuffer): SvcPrint {
    const message = new SvcPrint()
    message.text = buffer.readString()
    return message
  }
}

/** Sound events; the SoundInfo entries are kept raw */
export class SvcSounds extends NetMessage {
  static readonly messageName = 'SvcSounds'
  reliable: boolean = false
  soundCount: number = 0
  data: BitBuffer | null = null
  static read(buffer: BitBuffer): SvcSounds {
    const message = new SvcSounds()
    message.reliable = buffer.readBool()
    let length: number
    if (message.reliable) {
      message.soundCount = 1
      length = buffer.readBits(8)
    } else {
      message.soundCount = buffer.readBits(8)
      length = buffer.readBits(16)
    }
    message.data = buffer.readSubBuffer(length)
    return message
  }
}

export class SvcSetView extends NetMessage {
  static readonly messageName = 'SvcSetView'
  entityIndex: number = 0
  static read(buffer: BitBuffer): SvcSetView {
    const message = new SvcSetView()
    message.entityIndex = buffer.readBits(11)
    return message
  }
}

export class SvcFixAngle extends NetMessage {
  static readonly messageName = 'SvcFixAngle'
  relative: boolean = false
  angle: Vector3Tuple = [0, 0, 0]
  static read(buffer: BitBuffer): SvcFixAngle {
    const message = new SvcFixAngle()
    message.relative = buffer.readBool()
    message.angle = [buffer.readBitAngle(16), buffer.readBitAngle(16), buffer.readBitAngle(16)]
    return message
  }
}

export class SvcCrosshairAngle extends NetMessage {
  static readonly messageName = 'SvcCrosshairAngle'
  angle: Vector3Tuple = [0, 0, 0]
  static read(buffer: BitBuffer): SvcCrosshairAngle {
    const message = new SvcCrosshairAngle()
    message.angle = [buffer.readBitAngle(16), buffer.readBitAngle(16), buffer.readBitAngle(16)]
    return message
  }
}

export class SvcBspDecal extends NetMessage {
  static readonly messageName = 'SvcBspDecal'
  position: Vector3Tuple = [0, 0, 0]
  decalTextureIndex: number = 0
  entityIndex: number | null = null
  modelIndex: number | null = null
  lowPriority: boolean = false
  static read(buffer: BitBuffer): SvcBspDecal {
    const message = new SvcBspDecal()
    message.position = buffer.readVectorCoord()
    message.decalTextureIndex = buffer.readBits(9)
    if (buffer.readBool()) {
      message.entityIndex = buffer.readBits(11)
      message.modelIndex = buffer.readBits(11)
    }
    message.lowPriority = buffer.readBool()
    return message
  }
}

export class SvcSplitScreen extends NetMessage {
  static readonly messageName = 'SvcSplitScreen'
  splitScreenType: number = 0
  data: BitBuffer | null = null
  static read(buffer: BitBuffer): SvcSplitScreen {
    const message = new SvcSplitScreen()
    message.splitScreenType = buffer.readBits(1)
    const length = buffer.readBits(11)
    message.data = buffer.readSubBuffer(length)
    return message
  }
}

/** Game-specific user message */
export class SvcUserMessage extends NetMessage {
  static readonly messageName = 'SvcUserMessage'
  userMessageType: number = 0
  data!: BitBuffer
  userMessage: UserMessage | null = null
  static read(buffer: BitBuffer, parser: MessageStreamContext): SvcUserMessage {
    const message = new SvcUserMessage()
    message.userMessageType = buffer.readByte()
    const length = buffer.readBits(parser.newEngine ? 12 : 11)
    message.data = buffer.readSubBuffer(length)
    if (parser.isPortal2) {
      message.userMessage = UserMessage.decode(
        message.userMessageType,
        BitBuffer.fromRange(message.data)
      )
    }
    return message
  }
}

export class SvcEntityMessage extends NetMessage {
  static readonly messageName = 'SvcEntityMessage'
  entityIndex: number = 0
  classId: number = 0
  data: BitBuffer | null = null
  static read(buffer: BitBuffer): SvcEntityMessage {
    const message = new SvcEntityMessage()
    message.entityIndex = buffer.readBits(11)
    message.classId = buffer.readBits(9)
    const length = buffer.readBits(11)
    message.data = buffer.readSubBuffer(length)
    return message
  }
}

/** Game event, decoded through the parser's game event manager */
export class SvcGameEvent extends NetMessage {
  static readonly messageName = 'SvcGameEvent'
  data!: BitBuffer
  event: GameEvent | null = null
  static read(buffer: BitBuffer, parser: MessageStreamContext): SvcGameEvent {
    const message = new SvcGameEvent()
    const length = buffer.readBits(11)
    message.data = buffer.readSubBuffer(length)
    if (parser.gameEventManager !== null) {
      message.event = parser.gameEventManager.readEvent(BitBuffer.fromRange(message.data))
    }
    return message
  }
}

/** Entity state update; the entity data is kept raw for the entity decoder */
export class SvcPacketEntities extends NetMessage {
  static readonly messageName = 'SvcPacketEntities'
  maxEntries: number = 0
  isDelta: boolean = false
  deltaFrom: number = -1
  baseline: boolean = false
  updatedEntries: number = 0
  dataLength: number = 0
  updateBaseline: boolean = false
  data!: BitBuffer
  entityUpdates: EntityUpdate[] = []
  static read(buffer: BitBuffer): SvcPacketEntities {
    const message = new SvcPacketEntities()
    message.maxEntries = buffer.readBits(11)
    message.isDelta = buffer.readBool()
    message.deltaFrom = message.isDelta ? buffer.readInt() : -1
    message.baseline = buffer.readBool()
    message.updatedEntries = buffer.readBits(11)
    message.dataLength = buffer.readBits(20)
    message.updateBaseline = buffer.readBool()
    message.data = buffer.readSubBuffer(message.dataLength)
    return message
  }
}

export class SvcTempEntities extends NetMessage {
  static readonly messageName = 'SvcTempEntities'
  entryCount: number = 0
  data: BitBuffer | null = null
  static read(buffer: BitBuffer): SvcTempEntities {
    const message = new SvcTempEntities()
    message.entryCount = buffer.readByte()
    const length = buffer.readBits(17)
    message.data = buffer.readSubBuffer(length)
    return message
  }
}

export class SvcPrefetch extends NetMessage {
  static readonly messageName = 'SvcPrefetch'
  soundIndex: number = 0
  static read(buffer: BitBuffer): SvcPrefetch {
    const message = new SvcPrefetch()
    message.soundIndex = buffer.readBits(13)
    return message
  }
}

export class SvcMenu extends NetMessage {
  static readonly messageName = 'SvcMenu'
  menuType: number = 0
  data: BitBuffer | null = null
  static read(buffer: BitBuffer): SvcMenu {
    const message = new SvcMenu()
    message.menuType = buffer.readShort()
    const length = buffer.readInt()
    message.data = buffer.readSubBuffer(length)
    return message
  }
}

/** Game event descriptors; builds the parser's game event manager */
export class SvcGameEventList extends NetMessage {
  static readonly messageName = 'SvcGameEventList'
  eventCount: number = 0
  data!: BitBuffer
  gameEventManager!: GameEventManager
  static read(buffer: BitBuffer, parser: MessageStreamContext): SvcGameEventList {
    const message = new SvcGameEventList()
    message.eventCount = buffer.readBits(9)
    const length = buffer.readBits(20)
    message.data = buffer.readSubBuffer(length)
    message.gameEventManager = GameEventManager.read(
      BitBuffer.fromRange(message.data),
      message.eventCount
    )
    parser.gameEventManager = message.gameEventManager
    return message
  }
}

export class SvcGetCvarValue extends NetMessage {
  static readonly messageName = 'SvcGetCvarValue'
  cookie: number = 0
  cvarName: string = ''
  static read(buffer: BitBuffer): SvcGetCvarValue {
    const message = new SvcGetCvarValue()
    message.cookie = buffer.readInt()
    message.cvarName = buffer.readString()
    return message
  }
}

export class SvcCmdKeyValues extends NetMessage {
  static readonly messageName = 'SvcCmdKeyValues'
  data: Uint8Array = new Uint8Array(0)
  static read(buffer: BitBuffer): SvcCmdKeyValues {
    const message = new SvcCmdKeyValues()
    const length = buffer.readInt()
    message.data = buffer.readBytes(length)
    return message
  }
}

export class SvcPaintmapData extends NetMessage {
  static readonly messageName = 'SvcPaintmapData'
  data: BitBuffer | null = null
  static read(buffer: BitBuffer): SvcPaintmapData {
    const message = new SvcPaintmapData()
    const length = buffer.readInt()
    message.data = buffer.readSubBuffer(length)
    return message
  }
}

type NetMessageReader = (buffer: BitBuffer, parser: MessageStreamContext) => NetMessage

// message classes by name, shared by both protocol tables
export const NetMessageClasses: Record<string, NetMessageReader> = {
  NetNop: NetNop.read,
  NetDisconnect: NetDisconnect.read,
  NetFile: NetFile.read,
  NetSplitScreenUser: NetSplitScreenUser.read,
  NetTick: NetTick.read,
  NetStringCmd: NetStringCmd.read,
  NetSetConVar: NetSetConVar.read,
  NetSignonState: NetSignonState.read,
  SvcServerInfo: SvcServerInfo.read,
  SvcSendTable: SvcSendTable.read,
  SvcClassInfo: SvcClassInfo.read,
  SvcSetPause: SvcSetPause.read,
  SvcCreateStringTable: SvcCreateStringTable.read,
  SvcUpdateStringTable: SvcUpdateStringTable.read,
  SvcVoiceInit: SvcVoiceInit.read,
  SvcVoiceData: SvcVoiceData.read,
  SvcPrint: SvcPrint.read,
  SvcSounds: SvcSounds.read,
  SvcSetView: SvcSetView.read,
  SvcFixAngle: SvcFixAngle.read,
  SvcCrosshairAngle: SvcCrosshairAngle.read,
  SvcBspDecal: SvcBspDecal.read,
  SvcSplitScreen: SvcSplitScreen.read,
  SvcUserMessage: SvcUserMessage.read,
  SvcEntityMessage: SvcEntityMessage.read,
  SvcGameEvent: SvcGameEvent.read,
  SvcPacketEntities: SvcPacketEntities.read,
  SvcTempEntities: SvcTempEntities.read,
  SvcPrefetch: SvcPrefetch.read,
  SvcMenu: SvcMenu.read,
  SvcGameEventList: SvcGameEventList.read,
  SvcGetCvarValue: SvcGetCvarValue.read,
  SvcCmdKeyValues: SvcCmdKeyValues.read,
  SvcPaintmapData: SvcPaintmapData.read,
}

function buildTable(numbering: Record<string, number>): Map<number, NetMessageReader> {
  const table = new Map<number, NetMessageReader>()
  for (const [name, value] of Object.entries(numbering)) {
    table.set(value, NetMessageClasses[name])
  }
  return table
}

export const NetMessageTableProtocol4 = buildTable(NetSvcMessagesProtocol4)
export const NetMessageTableProtocol3 = buildTable(NetSvcMessagesProtocol3)

/**
 * Decodes the net/svc message stream of a Signon or Packet frame
 */
export class MessageStream {
  /**
   * @param data    frame payload
   * @param parser  parser providing engine flags and running state
   * @param tick    frame tick, for error messages
   */
  static read(
    data: Uint8Array,
    parser: MessageStreamContext,
    tick: number | null = null
  ): NetMessage[] {
    const table = parser.newEngine ? NetMessageTableProtocol4 : NetMessageTableProtocol3
    const buffer = new BitBuffer(data)
    const messages: NetMessage[] = []
    while (buffer.bitsLeft > 6) {
      const bitOffset = buffer.bitPosition
      const messageType = buffer.readBits(6)
      const reader = table.get(messageType)
      if (!reader) {
        throw new Error(`Unknown net message type ${messageType} at tick ${tick} bit ${bitOffset}`)
      }
      const message = reader(buffer, parser)
      message.messageType = messageType
      message.bitOffset = bitOffset
      messages.push(message)
    }
    return messages
  }
}
