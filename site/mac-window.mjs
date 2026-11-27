// NSWindow frames and WebKit screen rectangles are measured in points.
// Use coordinate differences because their desktop origins may differ.
export async function fitMacWindow(api, view) {
  const [position, size] = await Promise.all([api.getPosition(), api.getSize()]);
  const {availLeft, availTop, availWidth, availHeight} = view.screen;
  if (![availLeft, availTop, availWidth, availHeight, view.screenX, view.screenY].every(Number.isFinite)
      || availWidth <= 0 || availHeight <= 0) return;

  // Leave room to drag an oversized restored window. Keep an intentional, exact-size zoom.
  const fit = (length, available, minimum) => length <= available ? length
    : Math.min(available, Math.max(minimum, available - 32));
  const width = fit(size.width, availWidth, size.minWidth);
  const height = fit(size.height, availHeight, size.minHeight);
  const clamp = (value, start, length, available) => Math.max(start, Math.min(value, start + available - length));
  const left = clamp(view.screenX, availLeft, width, availWidth);
  const top = clamp(view.screenY, availTop, height, availHeight);
  const x = Math.round(position.x + left - view.screenX);
  const y = Math.round(position.y + top - view.screenY);
  const resized = width !== size.width || height !== size.height;
  if (resized) {
    await api.setSize({width, height, minWidth: Math.min(size.minWidth, width), minHeight: Math.min(size.minHeight, height)});
  }
  // setSize also centers the window; restore the chosen origin after changing its size.
  if (resized || x !== position.x || y !== position.y) await api.move(x, y);
}
