// Port of gallantlab/DemoFiles DemoParser/UserCommands.py

import { BitBuffer } from './BitBuffer.ts'

/**
 * Button bits in a user command
 * See https://github.com/alliedmodders/hl2sdk/blob/portal2/game/shared/in_buttons.h
 */
export const Buttons = {
  Attack: 1,
  Jump: 1 << 1,
  Duck: 1 << 2,
  Forward: 1 << 3,
  Back: 1 << 4,
  Use: 1 << 5,
  Cancel: 1 << 6,
  Left: 1 << 7,
  Right: 1 << 8,
  MoveLeft: 1 << 9,
  MoveRight: 1 << 10,
  Attack2: 1 << 11,
  Run: 1 << 12,
  Reload: 1 << 13,
  Alt1: 1 << 14,
  Alt2: 1 << 15,
  Score: 1 << 16,
  Speed: 1 << 17,
  Walk: 1 << 18,
  Zoom: 1 << 19,
  Weapon1: 1 << 20,
  Weapon2: 1 << 21,
  BullRush: 1 << 22,
  Grenade1: 1 << 23,
  Grenade2: 1 << 24,
  LookSpin: 1 << 25,
} as const

export type ButtonName = keyof typeof Buttons

/** Delta view angle in a user command */
export class ViewAngles {
  x: number | null = null
  y: number | null = null
  z: number | null = null
}

/** Delta position in a user command */
export class Movement {
  forward: number | null = null
  side: number | null = null
  up: number | null = null
}

/**
 * User command of a UserCmd frame
 */
export class UserCommand {
  command: number | null = null
  tick: number | null = null
  viewAngles: ViewAngles = new ViewAngles()
  movement: Movement = new Movement()
  buttons: number | null = null
  impulse: number | null = null
  weaponSelect: number | null = null
  weaponSubtype: number | null = null
  mouseDx: number | null = null
  mouseDy: number | null = null
  heldEntityIndex: number | null = null
  heldEntityThroughPortalIndex: number | null = null
  commandAcknowledgementsPending: number | null = null
  predictedPortalTeleports: number | null = null
  trailingBits: number = 0

  /**
   * Reads a user command from the payload of a UserCmd frame
   * @param data     payload
   * @param portal2  read the four Portal 2 specific fields after the mouse deltas
   */
  static read(data: Uint8Array, portal2: boolean = false): UserCommand {
    const buffer = new BitBuffer(data)
    const command = new UserCommand()

    command.command = buffer.readOptionalInt()
    command.tick = buffer.readOptionalInt()

    command.viewAngles.x = buffer.readOptionalFloat()
    command.viewAngles.y = buffer.readOptionalFloat()
    command.viewAngles.z = buffer.readOptionalFloat()

    command.movement.forward = buffer.readOptionalFloat()
    command.movement.side = buffer.readOptionalFloat()
    command.movement.up = buffer.readOptionalFloat()

    command.buttons = buffer.readOptionalUInt()
    command.impulse = buffer.readOptionalByte()

    if (buffer.readBool()) {
      command.weaponSelect = buffer.readBits(11)
      if (buffer.readBool()) {
        command.weaponSubtype = buffer.readBits(6)
      }
    }

    command.mouseDx = buffer.readOptionalShort()
    command.mouseDy = buffer.readOptionalShort()

    if (portal2) {
      command.heldEntityIndex = buffer.readOptionalShort()
      command.heldEntityThroughPortalIndex = buffer.readOptionalShort()
      command.commandAcknowledgementsPending = buffer.readOptionalUShort()
      command.predictedPortalTeleports = buffer.readOptionalByte()
    }

    command.trailingBits = buffer.bitsLeft
    return command
  }
}
