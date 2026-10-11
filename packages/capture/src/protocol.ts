import { z } from 'zod';

/* What the editor page and the Waypost click-capture extension say to each other. The extension's bridge script runs on the editor's
   own page and passes these through `window.postMessage`; the page checks `source` and the shape of everything it receives, because
   any script on the page could send a message too. Nothing here ever leaves the browser. */

export const EDITOR_SOURCE = 'waypost-editor';
export const EXTENSION_SOURCE = 'waypost-extension';
export const PROTOCOL_VERSION = 1;

const MAX_LABEL = 80;
const MAX_CLICKS = 2000;

/** What kind of thing was clicked: it decides how the step is titled. */
export const ClickKindSchema = z.enum(['button', 'link', 'field', 'other']);
export type ClickKind = z.infer<typeof ClickKindSchema>;

/** One click in a recorded tab. `t` is wall-clock milliseconds (`Date.now()`), the same clock the editor stamps the start of its
    recording with, so a click's place in the video is `(t - startedAt) / 1000`. `x` and `y` are 0 to 1 across the tab's viewport. */
export const CapturedClickSchema = z.object({
  t: z.number().finite(),
  x: z.number().finite().transform(n => Math.min(1, Math.max(0, n))),
  y: z.number().finite().transform(n => Math.min(1, Math.max(0, n))),
  label: z.string().transform(s => s.slice(0, MAX_LABEL)),
  kind: ClickKindSchema,
  /** the browser's id for the tab, to tell the recorded tab's clicks from clicks made elsewhere */
  tab: z.number().int(),
  /** the tab's title at the time, for the same reason */
  title: z.string().transform(s => s.slice(0, 200)),
});
export type CapturedClick = z.infer<typeof CapturedClickSchema>;

export const EditorMessageSchema = z.discriminatedUnion('type', [
  z.object({ source: z.literal(EDITOR_SOURCE), type: z.literal('ping') }),
  /** begin logging clicks (the editor's recording has just started) */
  z.object({ source: z.literal(EDITOR_SOURCE), type: z.literal('start') }),
  /** stop logging and send what was logged */
  z.object({ source: z.literal(EDITOR_SOURCE), type: z.literal('stop') }),
]);
export type EditorMessage = z.infer<typeof EditorMessageSchema>;

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  /** the extension is installed (an answer to `ping`, and sent once when the bridge loads) */
  z.object({ source: z.literal(EXTENSION_SOURCE), type: z.literal('hello'), version: z.number().int() }),
  z.object({ source: z.literal(EXTENSION_SOURCE), type: z.literal('started') }),
  z.object({ source: z.literal(EXTENSION_SOURCE), type: z.literal('stopped'), clicks: z.array(CapturedClickSchema).max(MAX_CLICKS) }),
]);
export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;

/** The message in `data` if it is one the editor sent, otherwise null. */
export function parseEditorMessage(data: unknown): EditorMessage | null {
  const result = EditorMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** The message in `data` if it is one the extension sent, otherwise null. */
export function parseExtensionMessage(data: unknown): ExtensionMessage | null {
  const result = ExtensionMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}
