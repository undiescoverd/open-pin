import { describe, expect, it } from 'vitest';
import { checkSupport } from './support';

const full = { VideoDecoder: class {}, OffscreenCanvas: class {}, navigator: { storage: { getDirectory: () => {} } } };

describe('checkSupport', () => {
  it('accepts a browser with WebCodecs, private file storage and offscreen canvases', () => {
    expect(checkSupport(full)).toEqual({ ok: true, missing: [] });
  });
  it('names what a browser like Safari or Firefox lacks', () => {
    expect(checkSupport({ ...full, VideoDecoder: undefined })).toEqual({ ok: false, missing: ['WebCodecs video decoding'] });
    expect(checkSupport({ OffscreenCanvas: class {}, navigator: {} }).missing).toEqual(['WebCodecs video decoding', 'private file storage']);
    expect(checkSupport({}).ok).toBe(false);
  });
});
