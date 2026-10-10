import { STILL_MAX_WIDTH, tlToSrc, type GuidePlan, type Plan, type Project, type Size2 } from '@waypost/core';
import { composeScene, sceneFor, type AssetImages } from '@waypost/render';
import { ALL_FORMATS, BlobSource, BufferTarget, CanvasSink, Input, QUALITY_HIGH, type VideoCodec } from 'mediabunny';
import { encodePlan } from './mp4';
import { ExportCancelled } from './stills';

/* The media of a published guide (docs/02-architecture.md, "The published guide bundle"), rendered in the export worker from the
   recording itself, never from preview frames:

   - steps/<id>.webp: the pinned frame on its own, effect regions burned in, at the recording's size (up to 2560 px wide). No
     framing, logo or annotations: the player adds those with @waypost/render, so zoom stays sharp.
   - poster.webp: the first frame as the guide frames it.
   - seg/<id>.mp4: the motion leading into each step, framed, effect regions and logo burned in, silent (sound comes with Phase 4),
     with the index at the front so a browser starts playing before the whole file has arrived. */

export const SEGMENT_FPS = 30;

export interface GuideMediaJob {
  project: Project;
  /** what to render (from `planGuide`), and the framed picture size */
  plan: Pick<GuidePlan, 'stills' | 'segments'>;
  size: Size2;
  recording: Blob;
  assets: AssetImages;
  /** keeps a finished file under its path in the guide folder */
  save: (path: string, data: Blob) => Promise<void>;
  onProgress: (done: number, total: number) => void;
  cancelled: () => boolean;
}

/** Frames in the progress count that a still or the poster stands for. */
const STILL_WORK = 10;

export async function renderGuideMedia(job: GuideMediaJob): Promise<{ videoCodec: VideoCodec | null }> {
  const { project, plan } = job;
  const source = project.sources[0];
  if (!source) throw new Error('This project has no recording.');
  const input = new Input({ source: new BlobSource(job.recording), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('The recording has no video.');
    const segmentFrames = plan.segments.map(s => Math.max(1, Math.round((s.to - s.from) * SEGMENT_FPS)));
    const total = segmentFrames.reduce((a, b) => a + b, 0) + (plan.stills.length + 1) * STILL_WORK;
    let done = 0;
    const tick = (n: number) => {
      done += n;
      job.onProgress(done, total);
    };
    const check = () => {
      if (job.cancelled()) throw new ExportCancelled();
    };

    const sink = new CanvasSink(videoTrack);
    /* the recording alone, without framing or logo, effect regions burned in */
    const bare: Project = { ...project, frame: { aspect: 'source', padding: 0, background: { type: 'none' }, cornerRadius: 0, shadow: false }, logo: null };
    const scale = Math.min(1, STILL_MAX_WIDTH / source.size[0]);
    const [sw, sh] = [Math.max(2, Math.round(source.size[0] * scale)), Math.max(2, Math.round(source.size[1] * scale))];
    for (const still of plan.stills) {
      check();
      const time = still.step.anchor.time;
      const frame = await sink.getCanvas(time + 1e-4);
      if (!frame) throw new Error(`Couldn't read the frame for step “${still.step.title || still.step.id}”.`);
      const canvas = new OffscreenCanvas(sw, sh);
      composeScene(canvas.getContext('2d')!, sw, sh, sceneFor(bare, { frame: frame.canvas, sourceTime: time, annotations: false, assets: job.assets }));
      await job.save(still.file, await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 }));
      tick(STILL_WORK);
    }

    /* the poster: the first frame of the guide, framed as the segments are */
    check();
    const start = tlToSrc(project.timeline, 0)?.time ?? 0;
    const first = await sink.getCanvas(start + 1e-4);
    if (first) {
      const [w, h] = job.size;
      const canvas = new OffscreenCanvas(w, h);
      composeScene(canvas.getContext('2d')!, w, h, sceneFor(project, { frame: first.canvas, sourceTime: start, annotations: false, assets: job.assets, opaque: true }));
      await job.save('poster.webp', await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 }));
    }
    tick(STILL_WORK);

    let videoCodec: VideoCodec | null = null;
    for (const [i, segment] of plan.segments.entries()) {
      check();
      const duration = segment.to - segment.from;
      const segmentPlan: Plan = { items: [{ kind: 'play', start: 0, duration, from: segment.from, to: segment.to }], duration };
      const target = new BufferTarget();
      const before = done;
      const result = await encodePlan({
        project,
        videoTrack,
        audioTrack: null,
        plan: segmentPlan,
        width: job.size[0],
        height: job.size[1],
        fps: SEGMENT_FPS,
        captions: false,
        assets: job.assets,
        /* screen recordings are mostly text, which a lower bitrate smears while it moves */
        quality: QUALITY_HIGH,
        target,
        fastStart: 'in-memory',
        onProgress: n => job.onProgress(before + n, total),
        cancelled: job.cancelled,
      });
      videoCodec = result.videoCodec;
      done = before + segmentFrames[i]!;
      await job.save(segment.file, new Blob([target.buffer!], { type: 'video/mp4' }));
    }
    job.onProgress(total, total);
    return { videoCodec };
  } finally {
    input.dispose();
  }
}
