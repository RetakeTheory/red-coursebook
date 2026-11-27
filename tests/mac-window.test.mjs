import assert from 'node:assert/strict';
import test from 'node:test';
import {fitMacWindow} from '../site/mac-window.mjs';

async function restore(screen, frame, scale = 2) {
  const calls = [];
  const api = {
    getPosition: async () => ({x: frame.x, y: frame.y}),
    getSize: async () => ({width: frame.width, height: frame.height, minWidth: 560, minHeight: 460}),
    setSize: async size => calls.push(['size', size.width, size.height]),
    move: async (x, y) => calls.push(['move', x, y])
  };
  await fitMacWindow(api, {screen, screenX: 0, screenY: 0, devicePixelRatio: scale});
  return calls;
}

const retina = {availLeft: 48, availTop: 26, availWidth: 1392, availHeight: 874};
test('an oversized legacy window fits above the Dock in points at either display scale', async () => {
  const frame = {x: -400, y: 90, width: 2480, height: 1620};
  for (const scale of [1, 2]) {
    assert.deepEqual(await restore(retina, frame, scale), [['size', 1360, 842], ['move', 48, 58]]);
  }
});
test('keep valid and zoomed Mac windows at their saved size and position', async () => {
  assert.deepEqual(await restore(retina, {x: 120, y: 100, width: 900, height: 640}), []);
  assert.deepEqual(await restore(retina, {x: 48, y: 26, width: 1392, height: 874}), []);
});
test('an off-screen frame moves within a secondary display without resizing', async () => {
  const secondary = {availLeft: -1440, availTop: -180, availWidth: 1440, availHeight: 880};
  assert.deepEqual(await restore(secondary, {x: -270, y: 200, width: 800, height: 600}, 1),
    [['move', -800, 100]]);
});
