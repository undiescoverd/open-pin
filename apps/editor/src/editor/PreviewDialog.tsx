import { guideSize, planGuide } from '@waypost/core';
import type { PlayerHandle } from '@waypost/player';
import { loadRenderFonts } from '@waypost/render';
import { Dialog } from '@waypost/ui';
import { useEffect, useState } from 'react';
import { getEditor, selectProject, setPreviewOpen, useEditor } from '../state/store';

/* Preview (⌘↩): the guide in the same player a published guide uses, with its playback mode, controls, accent and call to action,
   so what you see here is what viewers get. Pictures and motion come from the recording directly (preview/media.ts). */

const MODE_TEXT = { guided: 'Guided: each step waits for the viewer.', auto: 'Auto: steps move on by themselves after their pause.', video: 'Video: plays straight through.' };

function PreviewPlayer({ aspect }: { aspect: number }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const state = getEditor();
    const project = selectProject(state);
    if (!host || !project || !state.media || !state.videoUrl) return;
    const { media: decoder, videoUrl, assetImages } = state;
    const plan = planGuide(project, { fonts: false });
    if (plan.guide.steps.length === 0) return;
    let player: PlayerHandle | null = null;
    let dispose: (() => void) | null = null;
    let gone = false;
    /* the player loads with the first preview, not with the editor */
    void Promise.all([import('@waypost/player'), import('../preview/media'), loadRenderFonts()]).then(([{ mount }, { previewMedia }]) => {
      if (gone) return;
      const media = previewMedia(project, plan, decoder, videoUrl, assetImages);
      dispose = media.dispose;
      player = mount(host, plan.guide, { media, lazy: false });
    });
    return () => {
      gone = true;
      player?.destroy();
      dispose?.();
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
          {MODE_TEXT[mode]} Change the playback mode, controls, accent and call to action in the Guide tab.
        </p>
      </div>
    </Dialog>
  );
}
