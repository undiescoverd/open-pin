/* Timecodes as the editor shows and accepts them: m:ss.cc (minutes, seconds, hundredths), e.g. 0:05.80 or 12:03.25. */

/**
 * Formats seconds as m:ss.cc, or m:ss.mmm with `digits` 3 (the transport readout). Rounds to the last digit first, so 59.996 reads
 * 1:00.00 rather than 0:60.00. Negative values clamp to 0.
 */
export function formatTimecode(seconds: number, digits: 2 | 3 = 2): string {
  const scale = 10 ** digits;
  const t = Math.round(Math.max(0, seconds) * scale) / scale;
  const minutes = Math.floor(t / 60);
  const rest = t - minutes * 60;
  return `${minutes}:${rest.toFixed(digits).padStart(digits + 3, '0')}`;
}

/**
 * Parses what someone types into a time field: plain seconds (`3.5`, `.5`, `12`), or m:ss with optional
 * fractions (`0:03.50`, `1:02`). A trailing `s` is allowed (`3.5s`). Returns null for anything else,
 * including m:ss with 60 or more seconds, which is almost always a typo.
 */
export function parseTimecode(input: string): number | null {
  const text = input.trim().replace(/s$/i, '');
  const ms = /^(\d+):(\d{1,2}(?:\.\d*)?)$/.exec(text);
  if (ms) {
    const minutes = Number(ms[1]), secs = Number(ms[2]);
    return secs < 60 ? minutes * 60 + secs : null;
  }
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : null;
}
