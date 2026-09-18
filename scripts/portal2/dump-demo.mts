// Prints the inventory of a Portal 2 demo with the TypeScript port of gallantlab/DemoFiles, for
// validation against sdp and the targets in specs/portal2-coop-replacement.md.
//
//   node --experimental-strip-types scripts/portal2/dump-demo.mts <demo.dem> [<partner demo.dem>]

import fs from 'node:fs'

import { Portal2DemoFileParser } from '../../src/demofiles/Portal2/Portal2DemoFileParser.ts'
import { Portal2CoopDemoFilesParser } from '../../src/demofiles/Portal2/Portal2CoopDemoFilesParser.ts'
import {
  NetTick,
  SvcGameEvent,
  SvcPacketEntities,
  SvcUserMessage,
} from '../../src/demofiles/DemoParser/NetMessages.ts'
import { PlayerDescriptor, PortalDescriptor } from '../../src/demofiles/Portal2/Structures.ts'
import { matrixGet } from '../../src/demofiles/Numeric.ts'

const count = (counts: Record<string, number>, name: string) => {
  counts[name] = (counts[name] ?? 0) + 1
}

const parseDemo = (path: string): Portal2DemoFileParser => {
  const started = performance.now()
  const parser = new Portal2DemoFileParser(path, fs.readFileSync(path))
  console.log(`parsed ${path} in ${(performance.now() - started).toFixed(0)} ms`)
  return parser
}

const dump = (parser: Portal2DemoFileParser) => {
  console.log('header', {
    map: parser.mapName,
    game: parser.gameDirectory,
    ticks: parser.numTicks,
    frames: parser.numFrames,
    time: parser.playbackTime,
    demoProtocol: parser.demoProtocol,
    networkProtocol: parser.networkProtocol,
  })

  const frameCounts: Record<string, number> = {}
  const netCounts: Record<string, number> = {}
  const userMessageCounts: Record<string, number> = {}
  const gameEventCounts: Record<string, number> = {}
  const commandNames = Object.fromEntries(
    Object.entries(parser.commandSet).map(([name, value]) => [value, name])
  )
  for (const frame of parser.frames) {
    count(frameCounts, commandNames[frame.command] ?? String(frame.command))
    for (const message of frame.packets) {
      count(netCounts, message.name)
      if (message instanceof SvcUserMessage && message.userMessage)
        count(userMessageCounts, message.userMessage.name)
      if (message instanceof SvcGameEvent && message.event)
        count(gameEventCounts, message.event.name)
    }
  }
  console.log('frames', JSON.stringify(frameCounts))
  console.log('net', JSON.stringify(netCounts))
  console.log('userMessages', JSON.stringify(userMessageCounts))
  console.log('gameEvents', JSON.stringify(gameEventCounts))
  console.log(
    'stringTables',
    parser.stringTables.map(table => `${table.name}:${table.entries.length}`).join(' ')
  )
  console.log(
    'sendTables',
    parser.dataTablesManager?.tables.length,
    'serverClasses',
    parser.dataTablesManager?.classes.length,
    'descriptors',
    parser.gameEventManager?.descriptors.length
  )
  const userinfo = parser.stringTableManager.tablesByName.get('userinfo')
  for (const entry of userinfo?.entries ?? []) {
    if (entry.playerInfo) {
      console.log('userinfo', entry.name, {
        name: entry.playerInfo.name,
        userId: entry.playerInfo.userId,
        guid: entry.playerInfo.guid,
        fake: entry.playerInfo.fakePlayer,
      })
    }
  }
  const firstUserCmd = parser.frames.find(frame => frame.command === parser.commandSet.UserCommand)
  if (firstUserCmd?.lastUserCommand) {
    const command = firstUserCmd.lastUserCommand
    console.log('firstUserCmd', {
      tick: firstUserCmd.tick,
      commandNumber: firstUserCmd.commandNumber,
      tickCount: command.tick,
      viewAngleX: command.viewAngles.x,
      viewAngleY: command.viewAngles.y,
      trailingBits: command.trailingBits,
    })
  }
  const trailing = new Set<number>()
  for (const frame of parser.frames) {
    if (frame.lastUserCommand) trailing.add(frame.lastUserCommand.trailingBits)
  }
  console.log('userCmd trailing bits', Array.from(trailing).join(','))
  const serverTicks = parser.getServerTicks()
  console.log(
    'netTick samples',
    JSON.stringify(serverTicks.slice(0, 3)),
    '...',
    JSON.stringify(serverTicks.slice(-3))
  )
  console.log('levelTransitionTicks', parser.getLevelTransitionTicks())
  console.log('pauses', JSON.stringify(parser.getPauseIntervals()))
  console.log(
    'ttl chat ticks',
    parser.getTTLTicks().length,
    'ttl commands',
    parser.getTTLCommandTicks().length
  )
  console.log('chat', JSON.stringify(parser.getChatMessages().slice(0, 5)))
  for (const [tick, event] of parser.getGameEvents().slice(0, 10)) {
    console.log('event', tick, event.name, JSON.stringify(event.values))
  }
  console.log('localPlayerEntityIndex', parser.getLocalPlayerEntityIndex())

  const started = performance.now()
  parser.parseEntityStates()
  console.log(
    `entity states in ${(performance.now() - started).toFixed(0)} ms, histories ${parser.entityHistories.size}`
  )
  const packetEntities = parser.frames.reduce(
    (total, frame) =>
      total + frame.packets.filter(message => message instanceof SvcPacketEntities).length,
    0
  )
  const netTicks = parser.frames.reduce(
    (total, frame) => total + frame.packets.filter(message => message instanceof NetTick).length,
    0
  )
  console.log(
    'packetEntities',
    packetEntities,
    'netTicks',
    netTicks,
    'traversals',
    parser.portalTraversals.length
  )

  const players = parser.getPlayerEntityIndices()
  console.log('players', players)
  const states = parser.getPlayerEntityStates()
  states.forEach((state, index) => {
    let firstRow = -1
    for (let row = 0; row < state.rows; row++) {
      if (!Number.isNaN(matrixGet(state, row, PlayerDescriptor.x))) {
        firstRow = row
        break
      }
    }
    console.log(
      'player',
      players[index],
      'firstRow',
      firstRow,
      firstRow >= 0
        ? {
            x: matrixGet(state, firstRow, PlayerDescriptor.x),
            y: matrixGet(state, firstRow, PlayerDescriptor.y),
            z: matrixGet(state, firstRow, PlayerDescriptor.z),
            team: matrixGet(state, firstRow, PlayerDescriptor.team),
            health: matrixGet(state, firstRow, PlayerDescriptor.health),
          }
        : null
    )
  })
  // the local player's entity origin against the CmdInfo view origin
  const localIndex = parser.getLocalPlayerEntityIndex()
  const [positions, ticks] = parser.getFramePositions()
  const localState = states[players.indexOf(localIndex ?? -1)]
  if (localState) {
    let checked = 0
    let maxDifference = 0
    for (let row = 0; row < ticks.length; row += Math.max(1, Math.floor(ticks.length / 20))) {
      const tick = ticks[row]
      const x = matrixGet(localState, tick, PlayerDescriptor.x)
      if (Number.isNaN(x)) continue
      checked++
      maxDifference = Math.max(
        maxDifference,
        Math.abs(x - matrixGet(positions, row, 0)),
        Math.abs(matrixGet(localState, tick, PlayerDescriptor.y) - matrixGet(positions, row, 1))
      )
    }
    console.log(
      'local origin vs view origin (x, y): checked',
      checked,
      'max difference',
      maxDifference.toFixed(2)
    )
  }
  const portals = parser.getPortalStates()
  portals.forEach((portal, slot) => {
    if (!portal) {
      console.log('portal slot', slot, 'never fired')
      return
    }
    let activations = 0
    let previous = 0
    let firstActive = -1
    for (let row = 0; row < portal.rows; row++) {
      const activated = matrixGet(portal, row, PortalDescriptor.activated)
      const value = Number.isNaN(activated) ? 0 : activated
      if (value - previous === 1) {
        activations++
        if (firstActive < 0) firstActive = row
      }
      previous = value
    }
    console.log(
      'portal slot',
      slot,
      'activations',
      activations,
      'first active row',
      firstActive,
      firstActive >= 0
        ? {
            x: matrixGet(portal, firstActive, PortalDescriptor.x),
            y: matrixGet(portal, firstActive, PortalDescriptor.y),
            z: matrixGet(portal, firstActive, PortalDescriptor.z),
            firedBy: matrixGet(portal, firstActive, PortalDescriptor.firedByPlayer),
          }
        : null
    )
  })
  console.log(
    'cubes',
    parser.getCubePositions().size,
    'floorButtons',
    parser.getFloorButtonStates().size,
    'doors',
    parser.getDoorStates().size,
    'lasers',
    parser.getLaserStates().size
  )
  const traversals = parser.getPortalTraversals()
  console.log(
    'portalTraversals rows',
    traversals.rows,
    'proximity intervals',
    parser.getPortalProximityIntervals().rows
  )
}

const [demoPath, partnerPath] = process.argv.slice(2)
if (!demoPath) {
  console.error(
    'usage: node --experimental-strip-types scripts/portal2/dump-demo.mts <demo.dem> [<partner demo.dem>]'
  )
  process.exit(1)
}

const parser = parseDemo(demoPath)
dump(parser)

if (partnerPath) {
  const partner = parseDemo(partnerPath)
  partner.parseEntityStates()
  const coop = new Portal2CoopDemoFilesParser(parser, partner)
  const axis = coop.getSynchronizedServerTicks()
  console.log('coop synchronized server ticks', axis.length, axis[0], axis[axis.length - 1])
  console.log('coop level transitions', JSON.stringify(coop.getLevelTransitionServerTicks()))
  console.log('coop ttl server ticks', coop.getTTLServerTicks().length)
  const [serverTicks, positions1, positions2] = coop.getPositions()
  console.log('coop positions', serverTicks.length, positions1.rows, positions2.rows)
  console.log(
    'coop players',
    coop.getPlayerEntityIndices(),
    'portals',
    coop.getPortalStates().map(portal => (portal ? portal.rows : null))
  )
  console.log(
    'coop traversals',
    coop.getPortalTraversals().rows,
    'proximity',
    coop.getPortalProximity().columns
  )
}
