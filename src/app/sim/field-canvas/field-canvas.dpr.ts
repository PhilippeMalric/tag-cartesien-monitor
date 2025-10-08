// Utilitaires Hi-DPI (devicePixelRatio) + resize

export function resizeCanvasToDPR(cv: HTMLCanvasElement) {
  let rect = cv.getBoundingClientRect();

  // Si le canvas est "display:none" au premier passage, fallback
  if (rect.width === 0 || rect.height === 0) {
    if (!cv.style.width)  cv.style.width  = '900px';
    if (!cv.style.height) cv.style.height = '600px';
    rect = cv.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      rect = new DOMRect(0, 0, 900, 600);
    }
  }

  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.max(1, Math.floor(rect.width  * dpr));
  const targetH = Math.max(1, Math.floor(rect.height * dpr));

  if (cv.width !== targetW || cv.height !== targetH) {
    cv.width = targetW;
    cv.height = targetH;
  }
  // garde cohérence CSS
  cv.style.width  = `${Math.max(1, Math.floor(rect.width))}px`;
  cv.style.height = `${Math.max(1, Math.floor(rect.height))}px`;
}

export function setupResizeObserver(
  el: HTMLElement,
  onResize: () => void
): ResizeObserver | null {
  if (!('ResizeObserver' in window)) return null;
  const ro = new ResizeObserver(() => onResize());
  ro.observe(el);
  return ro;
}
