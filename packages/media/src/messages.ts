/* What to say when a recording can't be opened (docs/06-simplify-plan.md, "Honest messages"): what's wrong in plain words, then
   what to do about it. QuickTime Player is on every Mac and its Export As writes H.264, which every browser plays. */

const REEXPORT = 'Open it in QuickTime Player, choose File › Export As › 1080p (with "Use HEVC" off), and drop the new file here. Any editor\'s H.264 MP4 export works too.';

const NAMES: Readonly<Record<string, string>> = { avc: 'H.264', hevc: 'HEVC (H.265)', vp8: 'VP8', vp9: 'VP9', av1: 'AV1', prores: 'ProRes' };

/** A browser can't decode the video track; `codec` is what the container names it, or null when it's a codec we don't know. */
export function cantPlayMessage(codec: string | null): string {
  if (!codec) return `This recording is in a format browsers can't play (often ProRes, from a screen recorder's or editor's high-quality setting). ${REEXPORT}`;
  const name = NAMES[codec] ?? codec.toUpperCase();
  const elsewhere = codec === 'hevc' ? ' Chrome and Edge on a Mac or a Windows PC can usually play HEVC as it is.' : '';
  return `This browser can't play ${name} video. ${REEXPORT}${elsewhere}`;
}

/** The file isn't a video at all, or its container is damaged or of a kind we can't read. */
export const UNREADABLE = `This file couldn't be read as a video. If it's a screen recording, it may be damaged or in an unusual format. ${REEXPORT}`;
