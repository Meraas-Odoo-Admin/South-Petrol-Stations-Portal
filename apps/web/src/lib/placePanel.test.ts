import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PANEL_EDGE, placePanel } from './placePanel.ts';

const desktop = { width: 1280, height: 900 };
const phone = { width: 390, height: 844 };
const field = (left: number, width: number, top = 400) => ({ top, bottom: top + 36, left, right: left + width, width });

test('the «إلى» calendar on «اليوم»: a narrow field near the left edge in RTL stays on screen', () => {
  // A 144px field at x=24; the calendar is 288px. Aligned to the field's right
  // edge it would start at -120 — the bug Mohamed saw.
  const placed = placePanel(field(24, 144), { width: 288, height: 320 }, desktop, true);
  assert.equal(placed.width, 288);
  assert.equal(placed.left, PANEL_EDGE);
  assert.ok(placed.left + placed.width <= desktop.width - PANEL_EDGE);
});

test('in RTL the panel starts at the field\'s right edge when there is room', () => {
  const placed = placePanel(field(600, 144), { width: 288, height: 320 }, desktop, true);
  assert.equal(placed.left + placed.width, 744);
});

test('at 390 px a panel wider than the screen is narrowed to fit, with a margin each side', () => {
  const placed = placePanel(field(20, 350), { width: 420, height: 320 }, phone, true);
  assert.equal(placed.width, phone.width - PANEL_EDGE * 2);
  assert.equal(placed.left, PANEL_EDGE);
});

test('a field near the right edge in LTR never pushes the panel off the right side', () => {
  const placed = placePanel(field(1200, 60), { width: 288, height: 320 }, desktop, false);
  assert.equal(placed.left + placed.width, desktop.width - PANEL_EDGE);
});

test('a panel opens upward when there is no room below and more room above', () => {
  const placed = placePanel(field(600, 144, 780), { width: 288, height: 320 }, desktop, true);
  assert.ok(placed.top < 780);
  assert.ok(placed.top >= PANEL_EDGE);
});

test('a panel opens downward when it fits below', () => {
  const placed = placePanel(field(600, 144, 100), { width: 288, height: 320 }, desktop, true);
  assert.equal(placed.top, 100 + 36 + 4);
});
