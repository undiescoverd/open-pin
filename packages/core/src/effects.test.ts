import { describe, expect, it } from 'vitest';
import { commands, createProject } from './commands';
import { compactLayers, dropOnLayer, effectSummary, freeLayer, layerEnd, moveLayer, newEffect, nextBlurName, separateLayers } from './effects';
import { apply, createHistory, type Command } from './history';
import { parseProject, type Blur, type Project, type Source } from './schema';

const source: Source = { id: 'src1', file: 'sources/demo.webm', name: 'demo.webm', duration: 20, size: [1280, 800], fps: 30 };
const fresh = (): Project => createProject({ id: 'p1', name: 'Demo', source, now: 1 });
const run = (p: Project, ...cmds: Array<Command<Project>>): Project => cmds.reduce((h, c) => apply(h, c), createHistory(p)).present;

function region(id: string, start: number, end: number, layer = 0): Blur {
  return { id, name: id, source: 'src1', start, end, layer, effects: [newEffect('pixelate', `f_${id}`)], radius: 4, opacity: 1, fadeIn: 0, fadeOut: 0, keyframes: [{ time: start, rect: [0.1, 0.1, 0.2, 0.1] }] };
}
const layers = (blurs: Blur[]) => Object.fromEntries(blurs.map(b => [b.id, b.layer]));

describe('effect stacks', () => {
  it('a new effect has its default amount and colour; the summary names the ones switched on', () => {
    expect(newEffect('tint', 'f')).toEqual({ id: 'f', type: 'tint', on: true, amount: 35, color: '#FF5A4E' });
    expect(newEffect('blur', 'f')).toEqual({ id: 'f', type: 'blur', on: true, amount: 45 });
    expect(effectSummary({ effects: [newEffect('pixelate', 'a'), { ...newEffect('darken', 'b'), on: false }, newEffect('solid', 'c')] })).toBe('Pixelate + Solid fill');
    expect(effectSummary({ effects: [] })).toBe('No effects');
  });

  it('adds, reorders, switches, recolours and removes effects, each one undo step (acceptance check 22)', () => {
    let h = apply(createHistory(fresh()), commands.addBlur(region('b1', 0, 20), 2));
    for (const [i, type] of (['tint', 'desaturate', 'solid', 'blur'] as const).entries()) h = apply(h, commands.addEffect('b1', newEffect(type, `e${i}`), 3));
    expect(h.present.blurs[0]!.effects.map(e => e.type)).toEqual(['pixelate', 'tint', 'desaturate', 'solid', 'blur']);
    for (let i = 0; i < 4; i++) h = apply(h, commands.moveEffect('b1', 'e3', -1, 4));
    expect(h.present.blurs[0]!.effects[0]!.type).toBe('blur');
    h = apply(h, commands.moveEffect('b1', 'e3', -1, 4));
    h = apply(h, commands.updateEffect('b1', 'e2', { on: false }, 5));
    h = apply(h, commands.updateEffect('b1', 'e0', { color: '#13B8A6', amount: 140 }, 6));
    h = apply(h, commands.updateEffect('b1', 'f_b1', { color: '#13B8A6' }, 7));
    expect(h.present.blurs[0]!.effects.find(e => e.id === 'e0')).toMatchObject({ color: '#13B8A6', amount: 100 });
    expect(h.present.blurs[0]!.effects.find(e => e.id === 'f_b1')!.color).toBeUndefined();
    expect(h.past.map(e => e.label).slice(-6)).toEqual(['Apply effect earlier', 'Apply effect earlier', 'Apply effect earlier', 'Apply effect earlier', 'Switch effect off', 'Change effect colour']);
    h = apply(h, commands.removeEffect('b1', 'e1', 8));
    expect(h.present.blurs[0]!.effects).toHaveLength(4);
  });

  it('names new regions with a number nobody uses', () => {
    expect(nextBlurName([])).toBe('Blur 1');
    expect(nextBlurName([{ name: 'Blur 1' }, { name: 'Blur 3' }])).toBe('Blur 4');
    expect(nextBlurName([{ name: 'Blur 3' }, { name: 'Blur 2' }])).toBe('Blur 4');
    expect(nextBlurName([{ name: 'Email' }])).toBe('Blur 2');
  });
});

describe('layers', () => {
  it('a new region goes on the lowest layer with room', () => {
    let p = run(fresh(), commands.addBlur(region('a', 0, 10), 2), commands.addBlur(region('b', 5, 15), 2), commands.addBlur(region('c', 12, 20), 2));
    expect(layers(p.blurs)).toEqual({ a: 0, b: 1, c: 0 });
    p = run(p, commands.addBlur(region('d', 0, 20), 2));
    expect(freeLayer(p.blurs, 0, 1)).toBe(1);
    expect(freeLayer(p.blurs, 0, 20)).toBe(3);
    expect(p.blurs.find(b => b.id === 'd')!.layer).toBe(2);
  });

  it('send to back, bring to front and one layer at a time, never leaving a layer empty (acceptance check 23)', () => {
    const blurs = ['a', 'b', 'c', 'd', 'e'].map((id, i) => region(id, i, 15 + i * 0.5, i));
    expect(moveLayer(blurs, 'c', 'back')).toBe(true);
    expect(layers(blurs)).toEqual({ c: 0, a: 1, b: 2, d: 3, e: 4 });
    moveLayer(blurs, 'c', 'front');
    expect(layers(blurs)).toEqual({ a: 0, b: 1, d: 2, e: 3, c: 4 });
    moveLayer(blurs, 'c', 'down');
    expect(layers(blurs)).toEqual({ a: 0, b: 1, d: 2, c: 3, e: 4 });
    expect(moveLayer(blurs, 'a', 'back')).toBe(false);
    expect(layerEnd(blurs, 'a')).toEqual({ top: false, bottom: true });
  });

  it('bring forward joins the next layer when it has room there', () => {
    const blurs = [region('a', 0, 5, 0), region('c', 6, 20, 0), region('b', 10, 20, 1)];
    moveLayer(blurs, 'a', 'up');
    expect(layers(blurs)).toEqual({ a: 1, b: 1, c: 0 });
    /* no layer above with room: a new one just past this one */
    moveLayer(blurs, 'a', 'up');
    expect(layers(blurs)).toEqual({ a: 2, b: 1, c: 0 });
    blurs.push(region('d', 0, 1, 9));
    compactLayers(blurs);
    expect(layers(blurs)).toEqual({ a: 2, b: 1, c: 0, d: 3 });
  });

  it('dragging a bar to a row moves it there if it fits, otherwise slots in a new layer past that row', () => {
    const blurs = [region('a', 0, 5, 0), region('b', 0, 20, 1), region('c', 10, 20, 2)];
    dropOnLayer(blurs, 'c', 0);
    expect(layers(blurs)).toEqual({ a: 0, b: 1, c: 0 });
    /* row 1 is taken by b at that time, so a gets a new layer just above it (it came from below) */
    dropOnLayer(blurs, 'a', 1);
    expect(layers(blurs)).toEqual({ a: 2, b: 1, c: 0 });
    /* already alone on top */
    dropOnLayer(blurs, 'a', 5);
    expect(layers(blurs)).toEqual({ a: 2, b: 1, c: 0 });
    dropOnLayer(blurs, 'a', -1);
    expect(layers(blurs)).toEqual({ a: 0, b: 2, c: 1 });
  });

  it('moving or trimming a bar stops at its neighbours on the same layer', () => {
    let p = run(fresh(), commands.addBlur(region('a', 0, 5), 2), commands.addBlur(region('b', 8, 12), 2));
    p = run(p, commands.placeBlur('b', { start: 3, end: 7, shift: true }, 3));
    expect(p.blurs.find(b => b.id === 'b')).toMatchObject({ start: 5, end: 9, layer: 0 });
    p = run(p, commands.placeBlur('b', { start: 1, end: 9, shift: false }, 4));
    expect(p.blurs.find(b => b.id === 'b')).toMatchObject({ start: 5 });
    /* jumping clean over a neighbour isn't allowed either */
    p = run(p, commands.placeBlur('b', { start: 0, end: 4, shift: true }, 5));
    expect(p.blurs.find(b => b.id === 'b')).toMatchObject({ start: 5, end: 9 });
    /* but dropping it on a new row moves it there */
    p = run(p, commands.placeBlur('b', { start: 1, end: 5, shift: true, row: 1 }, 6));
    expect(p.blurs.find(b => b.id === 'b')).toMatchObject({ start: 1, end: 5, layer: 1 });
  });

  it('deleting a region removes its layer if it was alone there', () => {
    const p = run(fresh(), commands.addBlur(region('a', 0, 10), 2), commands.addBlur(region('b', 5, 15), 2), commands.addBlur(region('c', 5, 15), 2), commands.removeBlur('b', 3));
    expect(layers(p.blurs)).toEqual({ a: 0, c: 1 });
  });

  it('a document with overlapping regions on one layer is separated on load', () => {
    separateLayers([region('x', 0, 5), region('y', 4, 6)]);
    const p = parseProject(JSON.parse(JSON.stringify({ ...fresh(), blurs: [region('a', 0, 10, 3), region('b', 5, 15, 3), region('c', 0, 2, 7)] })));
    expect(layers(p.blurs)).toEqual({ a: 0, b: 1, c: 2 });
  });
});
