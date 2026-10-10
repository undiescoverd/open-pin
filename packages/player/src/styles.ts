import { TOKENS_CSS } from './tokens';

/* The player's own small stylesheet (docs/03-design-system.md, "Player counterparts"), inside its Shadow DOM so the host page's CSS
   can't reach it. Colours come from design/tokens.json (tokens.ts); the guide's accent sets --wp-accent. */

export const CSS = `${TOKENS_CSS}
:host{display:block}
[hidden]{display:none!important}
.wp{container-type:inline-size;position:relative;display:flex;flex-direction:column;font:400 var(--wp-text-base)/1.45 var(--wp-font-ui);color:var(--wp-fg);background:var(--wp-panel);border:1px solid var(--wp-line);border-radius:var(--wp-radius-lg);overflow:hidden;outline:none;-webkit-tap-highlight-color:transparent;text-align:left}
.wp:focus-visible{box-shadow:0 0 0 2px var(--wp-sel)}
.wp:fullscreen{border:0;border-radius:0;background:var(--wp-app)}
.wp-stage{position:relative;aspect-ratio:var(--wp-aspect);background:var(--wp-app);overflow:hidden;user-select:none;-webkit-user-select:none}
.wp:fullscreen .wp-stage{flex:1;min-height:0;aspect-ratio:auto}
.wp-stage[data-wait]{cursor:pointer}
.wp-box{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.wp-box>canvas,.wp-box>video{position:absolute;inset:0;display:block;width:100%;height:100%}
.wp-box>video{object-fit:contain;visibility:hidden}
.wp-box>video.on{visibility:visible}
.wp-overlay{position:absolute;inset:0;display:grid;place-items:center;padding:16px;background:linear-gradient(180deg,rgba(14,17,22,.15),rgba(14,17,22,.55))}
.wp-card{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:min(420px,100%);padding:22px 26px;border-radius:16px;background:var(--wp-panel);box-shadow:var(--wp-shadow-pop);text-align:center}
.wp-card h2{margin:0;font:700 var(--wp-text-xl)/1.25 var(--wp-font-brand);text-wrap:balance;overflow-wrap:anywhere}
.wp-card p{margin:0;color:var(--wp-fg-muted)}
.wp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border:1px solid var(--wp-line);border-radius:var(--wp-radius-md);background:var(--wp-raised);color:var(--wp-fg);font:600 var(--wp-text-base)/1 var(--wp-font-ui);text-decoration:none;white-space:nowrap;cursor:pointer;transition:filter var(--wp-motion-ui) var(--wp-motion-ease-out),background var(--wp-motion-ui)}
.wp-btn:hover{filter:brightness(.96)}
.wp-btn:focus-visible,.wp-tick:focus-visible{outline:2px solid var(--wp-sel);outline-offset:2px}
.wp-btn:disabled{opacity:.45;cursor:default;filter:none}
.wp-acc{border-color:transparent;background:var(--wp-accent);color:var(--wp-on-accent)}
.wp-cta{border-color:var(--wp-accent);background:transparent}
.wp-quiet{border-color:transparent;background:transparent}
.wp-quiet:hover{background:var(--wp-raised);filter:none}
.wp-icon{width:36px;padding:0}
.wp svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wp-bar{display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px 14px;border-top:1px solid var(--wp-line)}
.wp-caption{margin:0;min-height:22px;font:600 var(--wp-text-md)/1.45 var(--wp-font-brand);overflow-wrap:anywhere}
.wp-controls{display:flex;align-items:center;gap:6px}
.wp-counter{min-width:44px;color:var(--wp-fg-muted);font-size:var(--wp-text-sm);font-variant-numeric:tabular-nums;text-align:center}
.wp-progress{position:relative;flex:1;height:6px;margin:0 10px;border:1px solid var(--wp-line);border-radius:999px;background:var(--wp-raised)}
.wp-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:999px;background:var(--wp-accent)}
.wp-tick{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;padding:0;border:2px solid var(--wp-panel);border-radius:50%;background:var(--wp-line-strong);cursor:pointer}
.wp-tick::before{content:"";position:absolute;inset:-8px}
.wp-tick.done{background:var(--wp-accent)}
.wp-hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(14,17,22,.8);color:#fff;font-size:var(--wp-text-sm);font-weight:500;white-space:nowrap;pointer-events:none}
.wp-spin{position:absolute;right:12px;top:12px;width:20px;height:20px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:wp-spin 0.8s linear infinite;pointer-events:none}
@keyframes wp-spin{to{transform:rotate(360deg)}}
.wp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@container (max-width:480px){.wp-counter{display:none}.wp-progress{margin:0 4px}.wp-card{gap:6px;padding:12px 16px;border-radius:12px}.wp-card h2{font-size:var(--wp-text-md)}.wp-card p{font-size:var(--wp-text-sm)}.wp-overlay{padding:8px}.wp-caption{font-size:var(--wp-text-base)}}
@media (prefers-reduced-motion:reduce){.wp *{transition:none!important}.wp-spin{animation-duration:2.4s}}
`;
