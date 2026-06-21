/** 수업 수정 팝업 안에서 열린 Select·Popover 등 — 배경 클릭 시 팝업 대신 먼저 닫힐 것 */
export function isLessonEditFloatingUIOpen(): boolean {
  return Boolean(
    document.querySelector('[data-slot="select-content"][data-state="open"]') ||
      document.querySelector('[data-slot="popover-content"][data-state="open"]') ||
      document.querySelector('[data-inline-picker-open="true"]'),
  )
}
