import { useMemo } from 'react'
import { isMobile } from 'react-device-detect'

import type { Portal2Session, SessionChatMessage } from '@components/Analyse/Data/Session'
import { playerBySlot, roleColor } from '@utils/session'

const HUD_CHAT_TIME_SECONDS = 12
const HUD_CHAT_FADE_SECONDS = 2
const HUD_CHAT_MAX_LINES = 8

const getVisibleChat = (
  chat: SessionChatMessage[],
  row: number,
  intervalPerTick: number
): SessionChatMessage[] => {
  if (!chat.length) {
    return []
  }

  const maxAgeRows = Math.ceil(HUD_CHAT_TIME_SECONDS / intervalPerTick)
  const minRow = Math.max(0, row - maxAgeRows)

  const visible: SessionChatMessage[] = []
  for (let i = chat.length - 1; i >= 0; i--) {
    const entry = chat[i]
    if (entry.row > row) {
      continue
    }
    if (entry.row < minRow) {
      break
    }
    visible.push(entry)
    if (visible.length >= HUD_CHAT_MAX_LINES) {
      break
    }
  }

  visible.reverse()
  return visible
}

export interface ChatHudProps {
  session: Portal2Session
  tick: number
}

/**
 * Recent chat lines, coloured by the sender's bot. Scanner pulse messages (TTL) are not chat and
 * are kept out of the HUD; they appear as timeline markers instead.
 */
export const ChatHud = (props: ChatHudProps) => {
  const { session, tick } = props

  const intervalPerTick = session.intervalPerTick
  const visible = useMemo(
    () => getVisibleChat(session.chat, tick, intervalPerTick),
    [session, tick, intervalPerTick]
  )

  if (!visible.length || isMobile) {
    return null
  }

  return (
    <div className="text-outline pointer-events-none max-w-[46rem] select-none space-y-1">
      {visible.map((entry, idx) => {
        const ageSeconds = Math.max(0, (tick - entry.row) * intervalPerTick)
        const fadeStart = HUD_CHAT_TIME_SECONDS - HUD_CHAT_FADE_SECONDS
        const opacity =
          ageSeconds <= fadeStart
            ? 1
            : Math.max(0, Math.min(1, (HUD_CHAT_TIME_SECONDS - ageSeconds) / HUD_CHAT_FADE_SECONDS))

        const player = playerBySlot(session, entry.playerSlot)
        const name = player?.name ?? entry.sender

        return (
          <div
            key={`chat-${entry.row}-${idx}`}
            className="leading-snug"
            style={{ opacity, transition: 'opacity 120ms linear' }}
          >
            <span
              className="font-bold"
              style={{ color: player ? roleColor(player.role) : '#cccccc' }}
            >
              {name}
            </span>
            <span className="opacity-70">: </span>
            <span className="whitespace-pre-wrap">{entry.text}</span>
          </div>
        )
      })}
    </div>
  )
}
