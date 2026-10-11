import { describe, expect, it } from 'vitest';
import { cantPlayMessage, UNREADABLE } from './messages';

describe('messages for recordings that cannot be opened', () => {
  it('names the codec in plain words and says how to get a file that plays', () => {
    expect(cantPlayMessage('hevc')).toMatch(/^This browser can't play HEVC \(H\.265\) video\. Open it in QuickTime Player, choose File › Export As › 1080p/);
    expect(cantPlayMessage('hevc')).toMatch(/Chrome and Edge on a Mac/);
    expect(cantPlayMessage('av1')).toMatch(/^This browser can't play AV1 video\./);
    expect(cantPlayMessage('av1')).not.toMatch(/Chrome and Edge/);
    expect(cantPlayMessage('prores')).toMatch(/^This browser can't play ProRes video\./);
  });

  it('never says "THIS video" for a codec it does not know, and suggests ProRes', () => {
    const message = cantPlayMessage(null);
    expect(message).toMatch(/ProRes/);
    expect(message).toMatch(/QuickTime Player/);
    expect(message).not.toMatch(/THIS/);
  });

  it('says what to do with a file it cannot read at all', () => {
    expect(UNREADABLE).toMatch(/QuickTime Player/);
  });
});
