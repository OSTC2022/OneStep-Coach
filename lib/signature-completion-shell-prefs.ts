/** 수업 종료 서명+상태창 셸 크기/잠금 설정 (기기 localStorage) */

export const SIGNATURE_COMPLETION_SHELL_STORAGE_KEY =
  'onestep:signature-completion-shell:v1'

export type SignatureCompletionShellPrefs = {
  /** 뷰포트 대비 너비 비율 (0–1) */
  widthRatio: number
  /** 뷰포트 대비 높이 비율 (0–1) */
  heightRatio: number
  /** true면 크기 조절 불가 */
  locked: boolean
}

export const DEFAULT_SIGNATURE_COMPLETION_SHELL_PREFS: SignatureCompletionShellPrefs =
  {
    widthRatio: 0.94,
    heightRatio: 0.9,
    locked: false,
  }

const MIN_WIDTH_PX = 320
const MIN_HEIGHT_PX = 420
const VIEWPORT_MARGIN_PX = 12

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function clampShellPrefs(
  prefs: Partial<SignatureCompletionShellPrefs> | null | undefined,
): SignatureCompletionShellPrefs {
  const base = DEFAULT_SIGNATURE_COMPLETION_SHELL_PREFS
  return {
    widthRatio: clamp(
      typeof prefs?.widthRatio === 'number' ? prefs.widthRatio : base.widthRatio,
      0.45,
      1,
    ),
    heightRatio: clamp(
      typeof prefs?.heightRatio === 'number'
        ? prefs.heightRatio
        : base.heightRatio,
      0.45,
      1,
    ),
    locked: Boolean(prefs?.locked),
  }
}

export function readSignatureCompletionShellPrefs(): SignatureCompletionShellPrefs {
  if (typeof window === 'undefined') {
    return DEFAULT_SIGNATURE_COMPLETION_SHELL_PREFS
  }
  try {
    const raw = window.localStorage.getItem(SIGNATURE_COMPLETION_SHELL_STORAGE_KEY)
    if (!raw) return DEFAULT_SIGNATURE_COMPLETION_SHELL_PREFS
    return clampShellPrefs(JSON.parse(raw) as SignatureCompletionShellPrefs)
  } catch {
    return DEFAULT_SIGNATURE_COMPLETION_SHELL_PREFS
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

export function getViewportShellBounds() {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768
  const maxWidth = Math.max(MIN_WIDTH_PX, vw - VIEWPORT_MARGIN_PX * 2)
  const maxHeight = Math.max(MIN_HEIGHT_PX, vh - VIEWPORT_MARGIN_PX * 2)
  return { vw, vh, maxWidth, maxHeight, minWidth: MIN_WIDTH_PX, minHeight: MIN_HEIGHT_PX }
}

export function prefsToShellSize(prefs: SignatureCompletionShellPrefs): {
  width: number
  height: number
} {
  const { maxWidth, maxHeight, minWidth, minHeight } = getViewportShellBounds()
  return {
    width: clamp(Math.round(maxWidth * prefs.widthRatio), minWidth, maxWidth),
    height: clamp(Math.round(maxHeight * prefs.heightRatio), minHeight, maxHeight),
  }
}

export function shellSizeToPrefs(
  width: number,
  height: number,
  locked: boolean,
): SignatureCompletionShellPrefs {
  const { maxWidth, maxHeight } = getViewportShellBounds()
  return clampShellPrefs({
    widthRatio: width / Math.max(1, maxWidth),
    heightRatio: height / Math.max(1, maxHeight),
    locked,
  })
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

export function applyShellResize(
  edge: ShellResizeEdge,
  start: { width: number; height: number; clientX: number; clientY: number },
  clientX: number,
  clientY: number,
): { width: number; height: number } {
  const { maxWidth, maxHeight, minWidth, minHeight } = getViewportShellBounds()
  const dx = clientX - start.clientX
  const dy = clientY - start.clientY

  let width = start.width
  let height = start.height

  if (edge.includes('e')) width = start.width + dx
  if (edge.includes('w')) width = start.width - dx
  if (edge.includes('s')) height = start.height + dy
  if (edge.includes('n')) height = start.height - dy

  return {
    width: clamp(Math.round(width), minWidth, maxWidth),
    height: clamp(Math.round(height), minHeight, maxHeight),
  }
}
