// WKWebView can report screenX/screenY as zero for an off-screen window.
// Use the native frame origin and WebKit's display work area, both in desktop points.
export async function fitMacWindow(api, view) {
  const [position, size] = await Promise.all([api.getPosition(), api.getSize()]);
  const {availLeft, availTop, availWidth, availHeight} = view.screen;
  if (![availLeft, availTop, availWidth, availHeight, position.x, position.y].every(Number.isFinite)
      || availWidth <= 0 || availHeight <= 0) return;

  // Leave room to drag an oversized restored window. Keep an intentional, exact-size zoom.
  const fit = (length, available, minimum) => length <= available ? length
    : Math.min(available, Math.max(minimum, available - 32));
  const width = fit(size.width, availWidth, size.minWidth);
  const height = fit(size.height, availHeight, size.minHeight);
  const clamp = (value, start, length, available) => Math.max(start, Math.min(value, start + available - length));
  const x = Math.round(clamp(position.x, availLeft, width, availWidth));
  const y = Math.round(clamp(position.y, availTop, height, availHeight));
  const resized = width !== size.width || height !== size.height;
  if (resized) {
    await api.setSize({width, height, minWidth: Math.min(size.minWidth, width), minHeight: Math.min(size.minHeight, height)});
  }
  // setSize also centers the window; restore the chosen origin after changing its size.
  if (resized || x !== position.x || y !== position.y) await api.move(x, y);
}
