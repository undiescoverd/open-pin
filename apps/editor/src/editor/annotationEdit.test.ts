import { describe, expect, it } from 'vitest';
import { autoPlacement, createAnnotation, dragHandle, handlePositions, moveAnnotation, rectBetween, resizeRect } from './annotationEdit';

const frame = { width: 1280, height: 800 };

describe('creating annotations', () => {
  it('draws a box between two corners, whichever way the pointer went', () => {
    expect(rectBetween([0.5, 0.6], [0.2, 0.3])).toEqual([0.2, 0.3, 0.3, expect.closeTo(0.3, 9)]);
    const a = createAnnotation('box', [0.5, 0.6], [0.2, 0.3], '#FF5A4E');
    expect(a).toMatchObject({ type: 'box', rect: [0.2, 0.3, expect.closeTo(0.3, 9), expect.closeTo(0.3, 9)] });
  });

  it('makes a default-size shape from a plain click, kept inside the frame', () => {
    const a = createAnnotation('spotlight', [0.99, 0.01], [0.99, 0.01], '#FF5A4E');
    expect(a.type === 'spotlight' && a.rect[0] + a.rect[2]).toBeLessThanOrEqual(1);
    expect(a.type === 'spotlight' && a.rect[1]).toBe(0);
  });

  it('treats a tiny movement as a click', () => {
    const a = createAnnotation('box', [0.5, 0.5], [0.505, 0.505], '#FF5A4E');
    expect(a.type === 'box' && a.rect[2]).toBeCloseTo(0.2, 9);
  });

  it('points an arrow from where it was dragged, or draws a default one ending at the click', () => {
    expect(createAnnotation('arrow', [0.1, 0.1], [0.6, 0.5], '#FF5A4E')).toMatchObject({ from: [0.1, 0.1], to: [0.6, 0.5] });
    expect(createAnnotation('arrow', [0.5, 0.5], [0.5, 0.5], '#FF5A4E')).toMatchObject({ to: [0.5, 0.5], from: [expect.closeTo(0.38, 9), expect.closeTo(0.4, 9)] });
  });

  it('makes a callout at the click with a placement that keeps it on the frame', () => {
    expect(createAnnotation('callout', [0.5, 0.2], [0.5, 0.2], '#FF5A4E')).toMatchObject({ type: 'callout', anchor: [0.5, 0.2], placement: 'bottom', text: 'Add a short note' });
    expect(autoPlacement([0.05, 0.5])).toBe('right');
    expect(autoPlacement([0.95, 0.5])).toBe('left');
    expect(autoPlacement([0.5, 0.9])).toBe('top');
  });
});

describe('moving annotations', () => {
  it('stops a box at the frame edge instead of squashing it', () => {
    const box = createAnnotation('box', [0.1, 0.1], [0.4, 0.3], '#FF5A4E');
    const moved = moveAnnotation(box, 5, -5);
    expect(moved.type === 'box' && moved.rect).toEqual([expect.closeTo(0.7, 9), 0, expect.closeTo(0.3, 9), expect.closeTo(0.2, 9)]);
  });

  it('moves an arrow as one piece and stops it at the edge', () => {
    const arrow = createAnnotation('arrow', [0.2, 0.2], [0.6, 0.5], '#FF5A4E');
    const moved = moveAnnotation(arrow, 0.8, 0);
    expect(moved.type === 'arrow' && moved.to[0]).toBeCloseTo(1, 9);
    expect(moved.type === 'arrow' && moved.from[0]).toBeCloseTo(0.6, 9);
  });

  it('clamps click markers and callouts to the frame', () => {
    expect(moveAnnotation({ id: 'c', type: 'click', at: [0.9, 0.5], color: '#FF5A4E', reveal: 0 }, 0.5, 0)).toMatchObject({ at: [1, 0.5] });
  });
});

describe('resizing rectangles', () => {
  const rect: [number, number, number, number] = [0.2, 0.2, 0.4, 0.3];
  it('keeps the opposite edge fixed', () => {
    const out = resizeRect(rect, 'se', 0.1, 0.1, frame);
    expect(out).toEqual([0.2, 0.2, expect.closeTo(0.5, 9), expect.closeTo(0.4, 9)]);
    const west = resizeRect(rect, 'w', 0.1, 0, frame);
    expect(west[0] + west[2]).toBeCloseTo(0.6, 9);
  });

  it('never goes under 8 px or past the frame', () => {
    const tiny = resizeRect(rect, 'e', -5, 0, frame);
    expect(tiny[2] * frame.width).toBeCloseTo(8, 6);
    const big = resizeRect(rect, 'nw', -5, -5, frame);
    expect(big[0]).toBe(0);
    expect(big[1]).toBe(0);
  });

  it('an edge handle changes one axis only', () => {
    const out = resizeRect(rect, 'n', 0.3, 0.05, frame);
    expect(out[0]).toBe(0.2);
    expect(out[2]).toBeCloseTo(0.4, 9);
    expect(out[1]).toBeCloseTo(0.25, 9);
  });

  it('dragHandle moves one end of an arrow', () => {
    const arrow = createAnnotation('arrow', [0.2, 0.2], [0.6, 0.5], '#FF5A4E');
    expect(dragHandle(arrow, 'to', 0.1, 0.1, frame)).toMatchObject({ from: [0.2, 0.2], to: [expect.closeTo(0.7, 9), expect.closeTo(0.6, 9)] });
  });
});

describe('handles', () => {
  it('gives rectangles eight, arrows two, and the rest none', () => {
    expect(handlePositions(createAnnotation('box', [0.1, 0.1], [0.4, 0.3], '#FF5A4E'))).toHaveLength(8);
    expect(handlePositions(createAnnotation('arrow', [0.1, 0.1], [0.4, 0.3], '#FF5A4E'))).toHaveLength(2);
    expect(handlePositions(createAnnotation('callout', [0.1, 0.1], [0.1, 0.1], '#FF5A4E'))).toHaveLength(0);
  });
});
