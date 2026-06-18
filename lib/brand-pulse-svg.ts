/** OneStep Coach — circle ring + ECG pulse (stroke only, integrated at 9↔3 o'clock) */
export const BRAND_PULSE_VIEWBOX = '0 0 24 24' as const

export const BRAND_PULSE_CIRCLE = { cx: 12, cy: 12, r: 9 } as const

export const BRAND_PULSE_STROKE_WIDTH = 1.9

export const BRAND_PULSE_GREEN = '#AAFF00' as const
export const BRAND_PULSE_APP_BG_INNER = '#1a1d1a' as const
export const BRAND_PULSE_APP_BG_OUTER = '#101310' as const
export const BRAND_PULSE_APP_SYMBOL_SCALE = 0.52

/** Top & bottom arcs — pulse line completes the horizontal diameter */
export const BRAND_PULSE_ARC_TOP = 'M3 12A9 9 0 011 21 12' as const
export const BRAND_PULSE_ARC_BOTTOM = 'M3 12A9 9 0 001 21 12' as const

/** Reference app-icon silhouette — edge-to-edge at 9↔3 o'clock */
export const BRAND_PULSE_LINE =
  'M3 12H6.25L7.1 6L8.65 12L12 18.5L15.35 9.5L16.9 12H21' as const

export const BRAND_PULSE_PATHS = [
  BRAND_PULSE_ARC_TOP,
  BRAND_PULSE_ARC_BOTTOM,
  BRAND_PULSE_LINE,
] as const

const STROKE_ATTRS = 'fill="none" stroke-linecap="butt" stroke-linejoin="miter"'

function pulsePathsMarkup(stroke: string, strokeWidth: number) {
  return BRAND_PULSE_PATHS.map(
    (d) =>
      `<path d="${d}" ${STROKE_ATTRS} stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
  ).join('')
}

export function buildBrandPulseSvgMarkup(options?: {
  stroke?: string
  strokeWidth?: number
  className?: string
  glow?: boolean
}) {
  const stroke = options?.stroke ?? 'currentColor'
  const strokeWidth = options?.strokeWidth ?? BRAND_PULSE_STROKE_WIDTH
  const className = options?.className ? ` class="${options.className}"` : ''
  const glow = options?.glow ?? false

  const glowFilter = glow
    ? `<defs><filter id="onestep-pulse-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="0.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
    : ''

  const filterAttr = glow ? ' filter="url(#onestep-pulse-glow)"' : ''

  return `<svg viewBox="${BRAND_PULSE_VIEWBOX}"${className}${filterAttr} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${glowFilter}${pulsePathsMarkup(stroke, strokeWidth)}</svg>`
}

/** PWA / app-icon — dark squircle + centered pulse symbol (reference image 1) */
export function buildBrandPulseAppIconSvg(options?: {
  size?: number
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
  symbolScale?: number
}) {
  const size = options?.size ?? 100
  const stroke = options?.stroke ?? BRAND_PULSE_GREEN
  const strokeWidth = options?.strokeWidth ?? BRAND_PULSE_STROKE_WIDTH
  const cornerRadius = options?.cornerRadius ?? size * 0.22
  const symbolScale = options?.symbolScale ?? BRAND_PULSE_APP_SYMBOL_SCALE
  const symbolSize = size * symbolScale
  const offset = (size - symbolSize) / 2

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="onestep-app-bg" cx="50%" cy="44%" r="72%">
      <stop offset="0%" stop-color="${BRAND_PULSE_APP_BG_INNER}"/>
      <stop offset="100%" stop-color="${BRAND_PULSE_APP_BG_OUTER}"/>
    </radialGradient>
    <filter id="onestep-app-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="0.75" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#onestep-app-bg)"/>
  <g filter="url(#onestep-app-glow)">
    <svg x="${offset}" y="${offset}" width="${symbolSize}" height="${symbolSize}" viewBox="0 0 24 24">
      ${pulsePathsMarkup(stroke, strokeWidth)}
    </svg>
  </g>
</svg>`
}
