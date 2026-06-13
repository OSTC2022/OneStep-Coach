/** 모바일·태블릿 — 하단 시트형 Dialog (키보드 대응 포함) */
export const MOBILE_SHEET_DIALOG_CLASSES = [
  'max-lg:inset-x-0 max-lg:top-auto',
  'max-lg:bottom-[var(--visual-viewport-bottom-offset,0px)]',
  'max-lg:max-h-[min(92dvh,calc(100dvh-var(--visual-viewport-bottom-offset,0px)))]',
  'max-lg:translate-x-0 max-lg:translate-y-0',
  'max-lg:overflow-y-auto max-lg:overscroll-contain',
  'max-lg:rounded-b-none max-lg:rounded-t-2xl max-lg:border-b-0',
  'max-lg:pb-[max(1rem,env(safe-area-inset-bottom))]',
  'lg:top-[50%] lg:left-[50%] lg:translate-x-[-50%] lg:translate-y-[-50%]',
] as const

export const MOBILE_SHEET_ANIMATION_CLASSES = [
  'max-lg:data-[state=closed]:slide-out-to-bottom max-lg:data-[state=open]:slide-in-from-bottom',
  'max-lg:data-[state=closed]:zoom-out-95 max-lg:data-[state=open]:zoom-in-95',
] as const
