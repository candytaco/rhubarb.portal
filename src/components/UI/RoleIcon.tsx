import { PLAYER_ROLE_COLORS, PLAYER_ROLE_NAMES, type PlayerRole } from '@constants/portal2'

export interface RoleIconProps {
  role: PlayerRole
  size?: string | number | undefined
  className?: string
}

/**
 * Round badge for a bot: blue for Atlas, orange for P-body, with the bot's initial
 */
export const RoleIcon = ({ role, size, className }: RoleIconProps) => {
  const iconSize =
    typeof size === 'string' ? size : typeof size === 'number' ? `${size}px` : '1.5rem'
  const letter = PLAYER_ROLE_NAMES[role].charAt(0)

  return (
    <svg
      viewBox="0 0 32 32"
      width={iconSize}
      height={iconSize}
      className={className}
      aria-label={PLAYER_ROLE_NAMES[role]}
      role="img"
    >
      <circle
        cx="16"
        cy="16"
        r="15"
        fill={PLAYER_ROLE_COLORS[role]}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="2"
      />
      <circle cx="11.5" cy="13" r="3" fill="#ffffff" opacity="0.9" />
      <circle cx="20.5" cy="13" r="3" fill="#ffffff" opacity="0.9" />
      <text
        x="16"
        y="26"
        textAnchor="middle"
        fontSize="9"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        fill="#ffffff"
        opacity="0.9"
      >
        {letter}
      </text>
    </svg>
  )
}
