import { guideSize, planGuide } from '@waypost/core';
import type { PlayerHandle, PlayerState } from '@waypost/player';
import { loadRenderFonts } from '@waypost/render';
import { Dialog } from '@waypost/ui';
import { useEffect, useState } from 'react';
import { getEditor, selectionStepId, selectProject, selectStep, setPreviewOpen, useEditor } from '../state/store';

/* Preview (⌘↩): the guide in the same player a published guide uses, with its playback mode, controls, accent and call to action,
   so what you see here is what viewers get. Pictures and motion come from the recording directly (preview/media.ts).
   It opens at the selected step (on the start card when no step is selected), and closing it (Esc) selects the step it was
   showing, so the editor picks up where the preview left off. */

const MODE_TEXT = { guided: 'Viewer clicks Next: each step waits for the viewer.', auto: 'Plays by itself: steps move on after their pause.', video: 'Plain video: plays straight through.' };

/** The step the player is on: none on the start and end cards; the motion into a step, or out of it, counts as that step. */
function shownStep(state: PlayerState): number | null {
  return state.kind === 'start' || state.kind === 'end' ? null : state.index;
}

function PreviewPlayer({ aspect }: { aspect: number }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const state = getEditor();
    const project = selectProject(state);
    if (!host || !project || !state.media || !state.videoUrl) return;
    const { media: decoder, videoUrl, assetImages } = state;
    const plan = planGuide(project, { fonts: false });
    const steps = plan.guide.steps;
    if (steps.length === 0) return;
    const selected = steps.findIndex(s => s.id === selectionStepId(state.selection));
    let player: PlayerHandle | null = null;
    let dispose: (() => void) | null = null;
    let gone = false;
    /* the player loads with the first preview, not with the editor */
    void Promise.all([import('@waypost/player'), import('../preview/media'), loadRenderFonts()]).then(([{ mount }, { previewMedia }]) => {
      if (gone) return;
      const media = previewMedia(project, plan, decoder, videoUrl, assetImages);
      dispose = media.dispose;
      player = mount(host, plan.guide, { media, lazy: false, start: selected >= 0 ? selected : undefined });
    });
    return () => {
      gone = true;
      const at = player && shownStep(player.state);
      player?.destroy();
      dispose?.();
      const id = at === null || at === undefined ? undefined : steps[at]?.id;
      if (id && id !== selectionStepId(getEditor().selection)) selectStep(id);
    };
  }, [host]);
  /* as wide as the dialog, but never so tall that the controls drop below the screen */
  return <div ref={setHost} data-testid="preview-player" className="mx-auto w-full" style={{ maxWidth: `calc((92vh - 250px) * ${aspect.toFixed(4)})` }} />;
}

export function PreviewDialog() {
  const open = useEditor(s => s.previewOpen);
  const project = useEditor(selectProject);
  const mode = project?.guide.mode ?? 'guided';
  const [w, h] = project?.sources[0] ? guideSize(project) : [16, 10];
  return (
    <Dialog open={open} onOpenChange={setPreviewOpen} title="Preview" description="What viewers see when the guide is on your site." size="xl">
      <div className="flex flex-col gap-2">
        {open && <PreviewPlayer aspect={w / h} />}
        <p className="m-0 text-sm text-fg-muted">
          {MODE_TEXT[mode]} Change how it plays, the end button and the player's look in Export.
        </p>
      </div>
    </Dialog>
  );
}
