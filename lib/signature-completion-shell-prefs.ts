/** 수업 종료 — 남은횟차/서명 창 각각 위치·크기 (기기 localStorage) */

/** v3 — 신체정보 위 / 서명 아래(전체 너비). 태블릿 가로에서 좁은 좌우 분할 제거 */
export const SIGNATURE_COMPLETION_SHELL_STORAGE_KEY =
  'onestep:signature-completion-shell:v4'

export type FloatingPanelRect = {
  /** 뷰포트 대비 left 비율 (0–1) */
  leftRatio: number
  /** 뷰포트 대비 top 비율 (0–1) */
  topRatio: number
  /** 사용 가능 영역 대비 너비 비율 (0–1) */
  widthRatio: number
  /** 사용 가능 영역 대비 높이 비율 (0–1) */
  heightRatio: number
}

export type SignatureCompletionShellPrefs = {
  /** true면 위치·크기 조절 불가 */
  locked: boolean
  insight: FloatingPanelRect
  signature: FloatingPanelRect
}

/** @deprecated v1 호환 — 읽기만 */
type LegacyShellPrefsV1 = {
  widthRatio?: number
  heightRatio?: number
  locked?: boolean
}

const VIEWPORT_MARGIN_PX = 8
const MIN_INSIGHT = { width: 280, height: 220 }
/** 서명 패널은 전체 너비·높이 1/3 기본 — 최소 높이를 너무 크게 두면 겹침 */
const MIN_SIGNATURE = { width: 280, height: 240 }

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function getViewportShellBounds() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  return {
    vw,
    vh,
    maxWidth: Math.max(MIN_INSIGHT.width, vw - VIEWPORT_MARGIN_PX * 2),
    maxHeight: Math.max(MIN_INSIGHT.height, vh - VIEWPORT_MARGIN_PX * 2),
  }
}

function defaultRectsForViewport(): Pick<
  SignatureCompletionShellPrefs,
  'insight' | 'signature'
> {
  const { vw, vh } = getViewportShellBounds()
  const gap = 10
  // 항상 위·아래 스택 — 태블릿 가로에서도 서명 폭을 최대로
  const topChrome = 44 // 잠금/초기화 바 여유
  const usableH = Math.max(
    MIN_INSIGHT.height + MIN_SIGNATURE.height,
    vh - VIEWPORT_MARGIN_PX * 2 - gap - topChrome,
  )
  // 신체정보 2/3 · 서명 1/3
  const insightH = Math.round((usableH * 2) / 3)
  const sigH = usableH - insightH
  const w = Math.min(Math.round(vw * 0.96), vw - VIEWPORT_MARGIN_PX * 2)
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.round((vw - w) / 2))
  const insightTop = VIEWPORT_MARGIN_PX + topChrome
  return {
    insight: {
      leftRatio: left / vw,
      topRatio: insightTop / vh,
      widthRatio: w / Math.max(1, vw - VIEWPORT_MARGIN_PX * 2),
      heightRatio: insightH / Math.max(1, vh - VIEWPORT_MARGIN_PX * 2),
    },
    signature: {
      leftRatio: left / vw,
      topRatio: (insightTop + insightH + gap) / vh,
      widthRatio: w / Math.max(1, vw - VIEWPORT_MARGIN_PX * 2),
      heightRatio: sigH / Math.max(1, vh - VIEWPORT_MARGIN_PX * 2),
    },
  }
}

export const DEFAULT_SIGNATURE_COMPLETION_SHELL_PREFS: SignatureCompletionShellPrefs =
  {
    locked: false,
    ...defaultRectsForViewport(),
  }

function clampPanelRect(
  rect: Partial<FloatingPanelRect> | null | undefined,
  fallback: FloatingPanelRect,
): FloatingPanelRect {
  return {
    leftRatio: clamp(
      typeof rect?.leftRatio === 'number' ? rect.leftRatio : fallback.leftRatio,
      0,
      0.95,
    ),
    topRatio: clamp(
      typeof rect?.topRatio === 'number' ? rect.topRatio : fallback.topRatio,
      0,
      0.95,
    ),
    widthRatio: clamp(
      typeof rect?.widthRatio === 'number' ? rect.widthRatio : fallback.widthRatio,
      0.28,
      1,
    ),
    heightRatio: clamp(
      typeof rect?.heightRatio === 'number'
        ? rect.heightRatio
        : fallback.heightRatio,
      0.28,
      1,
    ),
  }
}

export function clampShellPrefs(
  prefs: Partial<SignatureCompletionShellPrefs> | null | undefined,
): SignatureCompletionShellPrefs {
  const defaults = defaultRectsForViewport()
  return {
    locked: Boolean(prefs?.locked),
    insight: clampPanelRect(prefs?.insight, defaults.insight),
    signature: clampPanelRect(prefs?.signature, defaults.signature),
  }
}

function migrateFromV1(raw: LegacyShellPrefsV1): SignatureCompletionShellPrefs {
  const defaults = defaultRectsForViewport()
  // v1은 단일 셸 비율만 있음 → 기본 분리 배치 + 잠금만 승계
  return clampShellPrefs({
    locked: Boolean(raw.locked),
    insight: defaults.insight,
    signature: defaults.signature,
  })
}

export function readSignatureCompletionShellPrefs(): SignatureCompletionShellPrefs {
  if (typeof window === 'undefined') {
    return DEFAULT_SIGNATURE_COMPLETION_SHELL_PREFS
  }
  try {
    const v3 = window.localStorage.getItem(SIGNATURE_COMPLETION_SHELL_STORAGE_KEY)
    if (v3) {
      return clampShellPrefs(JSON.parse(v3) as SignatureCompletionShellPrefs)
    }
    // 이전 버전(좌우 분할·다른 비율)은 버리고 위·아래 2/3·1/3 기본으로 교체
    try {
      window.localStorage.removeItem('onestep:signature-completion-shell:v3')
      window.localStorage.removeItem('onestep:signature-completion-shell:v2')
      window.localStorage.removeItem('onestep:signature-completion-shell:v1')
    } catch {
      /* ignore */
    }
    const next = clampShellPrefs({
      locked: false,
      ...defaultRectsForViewport(),
    })
    writeSignatureCompletionShellPrefs(next)
    return next
  } catch {
    return clampShellPrefs(defaultRectsForViewport())
  }
}

export function writeSignatureCompletionShellPrefs(
  prefs: SignatureCompletionShellPrefs,
) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      SIGNATURE_COMPLETION_SHELL_STORAGE_KEY,
      JSON.stringify(clampShellPrefs(prefs)),
    )
  } catch {
    /* quota */
  }
}

export type PanelPixelRect = {
  left: number
  top: number
  width: number
  height: number
}

export function prefsToPanelPixels(
  rect: FloatingPanelRect,
  min: { width: number; height: number },
): PanelPixelRect {
  const { vw, vh, maxWidth, maxHeight } = getViewportShellBounds()
  const width = clamp(
    Math.round(maxWidth * rect.widthRatio),
    min.width,
    maxWidth,
  )
  const height = clamp(
    Math.round(maxHeight * rect.heightRatio),
    min.height,
    maxHeight,
  )
  const maxLeft = Math.max(VIEWPORT_MARGIN_PX, vw - width - VIEWPORT_MARGIN_PX)
  const maxTop = Math.max(VIEWPORT_MARGIN_PX, vh - height - VIEWPORT_MARGIN_PX)
  const left = clamp(Math.round(vw * rect.leftRatio), VIEWPORT_MARGIN_PX, maxLeft)
  const top = clamp(Math.round(vh * rect.topRatio), VIEWPORT_MARGIN_PX, maxTop)
  return { left, top, width, height }
}

export function panelPixelsToPrefs(
  pixels: PanelPixelRect,
  locked: boolean,
  other: { insight?: FloatingPanelRect; signature?: FloatingPanelRect },
  which: 'insight' | 'signature',
): SignatureCompletionShellPrefs {
  const { vw, vh, maxWidth, maxHeight } = getViewportShellBounds()
  const nextRect: FloatingPanelRect = {
    leftRatio: pixels.left / Math.max(1, vw),
    topRatio: pixels.top / Math.max(1, vh),
    widthRatio: pixels.width / Math.max(1, maxWidth),
    heightRatio: pixels.height / Math.max(1, maxHeight),
  }
  const defaults = defaultRectsForViewport()
  return clampShellPrefs({
    locked,
    insight: which === 'insight' ? nextRect : (other.insight ?? defaults.insight),
    signature:
      which === 'signature' ? nextRect : (other.signature ?? defaults.signature),
  })
}

/** 드래그 중 위치만 클램프 (크기 유지) */
export function clampPanelPosition(
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number } {
  const { vw, vh } = getViewportShellBounds()
  const maxLeft = Math.max(VIEWPORT_MARGIN_PX, vw - width - VIEWPORT_MARGIN_PX)
  const maxTop = Math.max(VIEWPORT_MARGIN_PX, vh - height - VIEWPORT_MARGIN_PX)
  return {
    left: clamp(Math.round(left), VIEWPORT_MARGIN_PX, maxLeft),
    top: clamp(Math.round(top), VIEWPORT_MARGIN_PX, maxTop),
  }
}

export type ShellResizeEdge =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw'

export function applyPanelResize(
  edge: ShellResizeEdge,
  start: PanelPixelRect & { clientX: number; clientY: number },
  clientX: number,
  clientY: number,
  min: { width: number; height: number },
): PanelPixelRect {
  const { vw, vh, maxWidth, maxHeight } = getViewportShellBounds()
  const dx = clientX - start.clientX
  const dy = clientY - start.clientY

  let { left, top, width, height } = start

  if (edge.includes('e')) width = start.width + dx
  if (edge.includes('w')) {
    width = start.width - dx
    left = start.left + dx
  }
  if (edge.includes('s')) height = start.height + dy
  if (edge.includes('n')) {
    height = start.height - dy
    top = start.top + dy
  }

  width = clamp(Math.round(width), min.width, maxWidth)
  height = clamp(Math.round(height), min.height, maxHeight)

  // 서쪽/북쪽 리사이즈 후 크기가 clamp되면 반대쪽 고정에 맞춰 left/top 보정
  if (edge.includes('w')) {
    left = start.left + start.width - width
  }
  if (edge.includes('n')) {
    top = start.top + start.height - height
  }

  const pos = clampPanelPosition(left, top, width, height)
  return { left: pos.left, top: pos.top, width, height }
}

export const PANEL_MIN_SIZES = {
  insight: MIN_INSIGHT,
  signature: MIN_SIGNATURE,
} as const

/** 하위 호환: 예전 단일 셸 API */
export function prefsToShellSize(prefs: SignatureCompletionShellPrefs): {
  width: number
  height: number
} {
  const insight = prefsToPanelPixels(prefs.insight, MIN_INSIGHT)
  const signature = prefsToPanelPixels(prefs.signature, MIN_SIGNATURE)
  return {
    width: Math.max(insight.width, signature.width),
    height: Math.max(insight.height, signature.height),
  }
}

export function shellSizeToPrefs(
  _width: number,
  _height: number,
  locked: boolean,
): SignatureCompletionShellPrefs {
  const current = readSignatureCompletionShellPrefs()
  return clampShellPrefs({ ...current, locked })
}

export function applyShellResize(
  edge: ShellResizeEdge,
  start: { width: number; height: number; clientX: number; clientY: number },
  clientX: number,
  clientY: number,
): { width: number; height: number } {
  const resized = applyPanelResize(
    edge,
    {
      left: 0,
      top: 0,
      width: start.width,
      height: start.height,
      clientX: start.clientX,
      clientY: start.clientY,
    },
    clientX,
    clientY,
    MIN_SIGNATURE,
  )
  return { width: resized.width, height: resized.height }
}

export function resetSignatureCompletionShellLayout(): SignatureCompletionShellPrefs {
  const next = clampShellPrefs({
    locked: false,
    ...defaultRectsForViewport(),
  })
  writeSignatureCompletionShellPrefs(next)
  return next
}
