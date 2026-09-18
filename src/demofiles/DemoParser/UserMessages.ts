// Port of gallantlab/DemoFiles DemoParser/UserMessages.py

import { BitBuffer } from './BitBuffer.ts'
import { Portal2UserMessageNames, Portal2UserMessages } from './Commands.ts'

/**
 * Base of a decoded Portal 2 user message.
 * The payload stays available as data for message types without a decoder.
 */
export class UserMessage {
  messageType: number | null = null // Portal2UserMessages value, null for types outside the table
  messageTypeValue: number | null = null // type byte as sent
  data: BitBuffer | null = null

  static read(_buffer: BitBuffer): UserMessage {
    return new UserMessage()
  }

  /** Name of the message type, or Unknown followed by the numeric type for types outside the table */
  get name(): string {
    if (this.messageType === null) {
      return `Unknown${this.messageTypeValue}`
    }
    return Portal2UserMessageNames[this.messageType]
  }

  /** Reads a fixed number of null-terminated strings, filling in empty strings once the payload is exhausted */
  static readStrings(buffer: BitBuffer, count: number): string[] {
    const strings: string[] = []
    for (let index = 0; index < count; index++) {
      if (buffer.bitsLeft < 8) {
        strings.push('')
      } else {
        strings.push(buffer.readString())
      }
    }
    return strings
  }

  /**
   * Decodes a user message payload through the Portal 2 message table
   * @param messageType  type byte of the SvcUserMessage
   * @param buffer       bit buffer over the payload
   * @returns decoded message, or a bare UserMessage holding the raw payload
   */
  static decode(messageType: number, buffer: BitBuffer): UserMessage {
    let reader: (buffer: BitBuffer) => UserMessage = UserMessage.read
    let enumType: number | null = null
    if (messageType in Portal2UserMessageNames) {
      enumType = messageType
      reader = Portal2UserMessageReaders[messageType] ?? UserMessage.read
    }
    const message = reader(buffer)
    message.messageType = enumType
    message.messageTypeValue = messageType
    message.data = buffer
    return message
  }
}

export class Geiger extends UserMessage {
  geigerRange: number = 0
  static read(buffer: BitBuffer): Geiger {
    const message = new Geiger()
    message.geigerRange = buffer.readByte()
    return message
  }
}

export class Train extends UserMessage {
  position: number = 0
  static read(buffer: BitBuffer): Train {
    const message = new Train()
    message.position = buffer.readByte()
    return message
  }
}

export class HudText extends UserMessage {
  text: string = ''
  static read(buffer: BitBuffer): HudText {
    const message = new HudText()
    message.text = buffer.readString()
    return message
  }
}

/** Chat text */
export class SayText extends UserMessage {
  client: number = 0
  text: string = ''
  wantsToChat: number = 0
  static read(buffer: BitBuffer): SayText {
    const message = new SayText()
    message.client = buffer.readByte()
    message.text = buffer.readString()
    message.wantsToChat = buffer.readByte()
    return message
  }
}

/** Formatted chat text: a format string, the sender name and up to four parameters */
export class SayText2 extends UserMessage {
  client: number = 0
  format: string = ''
  wantsToChat: number = 0
  sender: string = ''
  messages: string[] = []
  static read(buffer: BitBuffer): SayText2 {
    const message = new SayText2()
    message.client = buffer.readByte()
    message.format = buffer.readString()
    message.wantsToChat = buffer.readByte()
    message.sender = buffer.readString()
    message.messages = UserMessage.readStrings(buffer, 4)
    return message
  }
  /** The chat text: first of the four parameter strings */
  get text(): string {
    return this.messages[0] ?? ''
  }
}

export class TextMsg extends UserMessage {
  destination: number = 0
  messages: string[] = []
  static read(buffer: BitBuffer): TextMsg {
    const message = new TextMsg()
    message.destination = buffer.readByte()
    message.messages = UserMessage.readStrings(buffer, 5)
    return message
  }
}

export class HudMsg extends UserMessage {
  channel: number = 0
  x: number = 0
  y: number = 0
  color1: [number, number, number, number] = [0, 0, 0, 0]
  color2: [number, number, number, number] = [0, 0, 0, 0]
  effect: number = 0
  fadeInTime: number = 0
  fadeOutTime: number = 0
  holdTime: number = 0
  fxTime: number = 0
  text: string = ''
  static read(buffer: BitBuffer): HudMsg {
    const message = new HudMsg()
    message.channel = buffer.readByte()
    message.x = buffer.readFloat()
    message.y = buffer.readFloat()
    message.color1 = [buffer.readByte(), buffer.readByte(), buffer.readByte(), buffer.readByte()]
    message.color2 = [buffer.readByte(), buffer.readByte(), buffer.readByte(), buffer.readByte()]
    message.effect = buffer.readFloat()
    message.fadeInTime = buffer.readFloat()
    message.fadeOutTime = buffer.readFloat()
    message.holdTime = buffer.readFloat()
    message.fxTime = buffer.readFloat()
    message.text = buffer.readString()
    return message
  }
}

export class ResetHUD extends UserMessage {
  reset: number = 0
  static read(buffer: BitBuffer): ResetHUD {
    const message = new ResetHUD()
    message.reset = buffer.readByte()
    return message
  }
}

export class ItemPickup extends UserMessage {
  itemName: string = ''
  static read(buffer: BitBuffer): ItemPickup {
    const message = new ItemPickup()
    message.itemName = buffer.readString()
    return message
  }
}

export class Shake extends UserMessage {
  shakeCommand: number = 0
  amplitude: number = 0
  frequency: number = 0
  duration: number = 0
  static read(buffer: BitBuffer): Shake {
    const message = new Shake()
    message.shakeCommand = buffer.readByte()
    message.amplitude = buffer.readFloat()
    message.frequency = buffer.readFloat()
    message.duration = buffer.readFloat()
    return message
  }
}

export class Tilt extends UserMessage {
  tiltCommand: number = 0
  easeInOut: number = 0
  angle: [number, number, number] = [0, 0, 0]
  duration: number = 0
  time: number = 0
  static read(buffer: BitBuffer): Tilt {
    const message = new Tilt()
    message.tiltCommand = buffer.readByte()
    message.easeInOut = buffer.readByte()
    message.angle = [buffer.readFloat(), buffer.readFloat(), buffer.readFloat()]
    message.duration = buffer.readFloat()
    message.time = buffer.readFloat()
    return message
  }
}

export class Fade extends UserMessage {
  duration: number = 0
  holdTime: number = 0
  fadeFlags: number = 0
  color: [number, number, number, number] = [0, 0, 0, 0]
  static read(buffer: BitBuffer): Fade {
    const message = new Fade()
    message.duration = buffer.readUShort()
    message.holdTime = buffer.readUShort()
    message.fadeFlags = buffer.readUShort()
    message.color = [buffer.readByte(), buffer.readByte(), buffer.readByte(), buffer.readByte()]
    return message
  }
}

export class VGUIMenu extends UserMessage {
  menuName: string = ''
  show: number = 0
  keyValues: [string, string][] = []
  static read(buffer: BitBuffer): VGUIMenu {
    const message = new VGUIMenu()
    message.menuName = buffer.readString()
    message.show = buffer.readByte()
    const count = buffer.readByte()
    for (let index = 0; index < count; index++) {
      message.keyValues.push([buffer.readString(), buffer.readString()])
    }
    return message
  }
}

/** Controller rumble; the index is the RumbleLookup effect (portal gun shots are 25, 26 and 27) */
export class Rumble extends UserMessage {
  index: number = 0
  rumbleData: number = 0
  flags: number = 0
  static read(buffer: BitBuffer): Rumble {
    const message = new Rumble()
    message.index = buffer.readByte()
    message.rumbleData = buffer.readByte()
    message.flags = buffer.readByte()
    return message
  }
}

export class Battery extends UserMessage {
  battery: number = 0
  static read(buffer: BitBuffer): Battery {
    const message = new Battery()
    message.battery = buffer.readUShort()
    return message
  }
}

export class VoiceMask extends UserMessage {
  audiblePlayers: number[] = []
  serverBannedPlayers: number[] = []
  serverModEnabled: number = 0
  static read(buffer: BitBuffer): VoiceMask {
    const message = new VoiceMask()
    for (let index = 0; index < 2; index++) {
      message.audiblePlayers.push(buffer.readUInt())
      message.serverBannedPlayers.push(buffer.readUInt())
    }
    message.serverModEnabled = buffer.readByte()
    return message
  }
}

export class CloseCaption extends UserMessage {
  hash: number = 0
  duration: number = 0
  fromPlayer: boolean = false
  static read(buffer: BitBuffer): CloseCaption {
    const message = new CloseCaption()
    message.hash = buffer.readUInt()
    message.duration = buffer.readBits(15)
    message.fromPlayer = buffer.readBool()
    return message
  }
}

export class CloseCaptionDirect extends CloseCaption {
  static read(buffer: BitBuffer): CloseCaptionDirect {
    const message = new CloseCaptionDirect()
    message.hash = buffer.readUInt()
    message.duration = buffer.readBits(15)
    message.fromPlayer = buffer.readBool()
    return message
  }
}

export class HintText extends UserMessage {
  text: string = ''
  static read(buffer: BitBuffer): HintText {
    const message = new HintText()
    message.text = buffer.readString()
    return message
  }
}

export class KeyHintText extends UserMessage {
  count: number = 0
  text: string = ''
  static read(buffer: BitBuffer): KeyHintText {
    const message = new KeyHintText()
    message.count = buffer.readByte()
    message.text = buffer.readString()
    return message
  }
}

export class CreditsMsg extends UserMessage {
  creditsType: number = 0
  static read(buffer: BitBuffer): CreditsMsg {
    const message = new CreditsMsg()
    message.creditsType = buffer.readByte()
    return message
  }
}

export class LogoTimeMsg extends UserMessage {
  time: number = 0
  static read(buffer: BitBuffer): LogoTimeMsg {
    const message = new LogoTimeMsg()
    message.time = buffer.readFloat()
    return message
  }
}

export class DesiredTimescale extends UserMessage {
  desiredTimescale: number = 0
  durationRealTimeSeconds: number = 0
  interpolationType: number = 0
  startBlendTime: number = 0
  static read(buffer: BitBuffer): DesiredTimescale {
    const message = new DesiredTimescale()
    message.desiredTimescale = buffer.readFloat()
    message.durationRealTimeSeconds = buffer.readFloat()
    message.interpolationType = buffer.readByte()
    message.startBlendTime = buffer.readFloat()
    return message
  }
}

export class CreditsPortalMsg extends UserMessage {
  creditsType: number = 0
  static read(buffer: BitBuffer): CreditsPortalMsg {
    const message = new CreditsPortalMsg()
    message.creditsType = buffer.readByte()
    return message
  }
}

/** Co-op ping indicator position */
export class HudPingIndicator extends UserMessage {
  position: [number, number, number] = [0, 0, 0]
  static read(buffer: BitBuffer): HudPingIndicator {
    const message = new HudPingIndicator()
    message.position = [buffer.readFloat(), buffer.readFloat(), buffer.readFloat()]
    return message
  }
}

export class MPMapCompleted extends UserMessage {
  branch: number = 0
  level: number = 0
  static read(buffer: BitBuffer): MPMapCompleted {
    const message = new MPMapCompleted()
    message.branch = buffer.readByte()
    message.level = buffer.readByte()
    return message
  }
}

export class MPMapIncomplete extends UserMessage {
  branch: number = 0
  level: number = 0
  static read(buffer: BitBuffer): MPMapIncomplete {
    const message = new MPMapIncomplete()
    message.branch = buffer.readByte()
    message.level = buffer.readByte()
    return message
  }
}

export class MPTauntEarned extends UserMessage {
  taunt: string = ''
  awardSilently: boolean = false
  static read(buffer: BitBuffer): MPTauntEarned {
    const message = new MPTauntEarned()
    message.taunt = buffer.readString()
    message.awardSilently = buffer.readBool()
    return message
  }
}

export class MPTauntUnlocked extends UserMessage {
  taunt: string = ''
  static read(buffer: BitBuffer): MPTauntUnlocked {
    const message = new MPTauntUnlocked()
    message.taunt = buffer.readString()
    return message
  }
}

export class MPTauntLocked extends UserMessage {
  taunt: string = ''
  static read(buffer: BitBuffer): MPTauntLocked {
    const message = new MPTauntLocked()
    message.taunt = buffer.readString()
    return message
  }
}

export class StartSurvey extends UserMessage {
  handle: number = 0
  static read(buffer: BitBuffer): StartSurvey {
    const message = new StartSurvey()
    message.handle = buffer.readUInt()
    return message
  }
}

export class SetMixLayerTriggerFactor extends UserMessage {
  layer: string = ''
  group: string = ''
  factor: number = 0
  static read(buffer: BitBuffer): SetMixLayerTriggerFactor {
    const message = new SetMixLayerTriggerFactor()
    message.layer = buffer.readString()
    message.group = buffer.readString()
    message.factor = buffer.readFloat()
    return message
  }
}

export class TransitionFade extends UserMessage {
  fade: number = 0
  static read(buffer: BitBuffer): TransitionFade {
    const message = new TransitionFade()
    message.fade = buffer.readFloat()
    return message
  }
}

export class ScoreboardTempUpdate extends UserMessage {
  portalScore: number = 0
  timeScore: number = 0
  static read(buffer: BitBuffer): ScoreboardTempUpdate {
    const message = new ScoreboardTempUpdate()
    message.portalScore = buffer.readUInt()
    message.timeScore = buffer.readUInt()
    return message
  }
}

// message types whose payload is decoded; every other type keeps its raw payload in UserMessage.data
export const Portal2UserMessageReaders: Record<number, (buffer: BitBuffer) => UserMessage> = {
  [Portal2UserMessages.Geiger]: Geiger.read,
  [Portal2UserMessages.Train]: Train.read,
  [Portal2UserMessages.HudText]: HudText.read,
  [Portal2UserMessages.SayText]: SayText.read,
  [Portal2UserMessages.SayText2]: SayText2.read,
  [Portal2UserMessages.TextMsg]: TextMsg.read,
  [Portal2UserMessages.HUDMsg]: HudMsg.read,
  [Portal2UserMessages.ResetHUD]: ResetHUD.read,
  [Portal2UserMessages.GameTitle]: UserMessage.read,
  [Portal2UserMessages.ItemPickup]: ItemPickup.read,
  [Portal2UserMessages.Shake]: Shake.read,
  [Portal2UserMessages.Tilt]: Tilt.read,
  [Portal2UserMessages.Fade]: Fade.read,
  [Portal2UserMessages.VGUIMenu]: VGUIMenu.read,
  [Portal2UserMessages.Rumble]: Rumble.read,
  [Portal2UserMessages.Battery]: Battery.read,
  [Portal2UserMessages.VoiceMask]: VoiceMask.read,
  [Portal2UserMessages.RequestState]: UserMessage.read,
  [Portal2UserMessages.CloseCaption]: CloseCaption.read,
  [Portal2UserMessages.CloseCaptionDirect]: CloseCaptionDirect.read,
  [Portal2UserMessages.HintText]: HintText.read,
  [Portal2UserMessages.KeyHintText]: KeyHintText.read,
  [Portal2UserMessages.CreditsMsg]: CreditsMsg.read,
  [Portal2UserMessages.LogoTimeMsg]: LogoTimeMsg.read,
  [Portal2UserMessages.UpdateJalopyRadar]: UserMessage.read,
  [Portal2UserMessages.CurrentTimescale]: UserMessage.read,
  [Portal2UserMessages.DesiredTimescale]: DesiredTimescale.read,
  [Portal2UserMessages.CreditsPortalMsg]: CreditsPortalMsg.read,
  [Portal2UserMessages.HudPingIndicator]: HudPingIndicator.read,
  [Portal2UserMessages.MPMapCompleted]: MPMapCompleted.read,
  [Portal2UserMessages.MPMapIncomplete]: MPMapIncomplete.read,
  [Portal2UserMessages.MPTauntEarned]: MPTauntEarned.read,
  [Portal2UserMessages.MPTauntUnlocked]: MPTauntUnlocked.read,
  [Portal2UserMessages.MPTauntLocked]: MPTauntLocked.read,
  [Portal2UserMessages.MPAllTauntsLocked]: UserMessage.read,
  [Portal2UserMessages.RemoveAllPaint]: UserMessage.read,
  [Portal2UserMessages.RemovePaint]: UserMessage.read,
  [Portal2UserMessages.StartSurvey]: StartSurvey.read,
  [Portal2UserMessages.SetMixLayerTriggerFactor]: SetMixLayerTriggerFactor.read,
  [Portal2UserMessages.TransitionFade]: TransitionFade.read,
  [Portal2UserMessages.ScoreboardTempUpdate]: ScoreboardTempUpdate.read,
  [Portal2UserMessages.ChallengeModCheatSession]: UserMessage.read,
  [Portal2UserMessages.ChallengeModCloseAllUI]: UserMessage.read,
}
