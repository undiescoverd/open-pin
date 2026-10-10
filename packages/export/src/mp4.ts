import { audioPlan, clamp, exportPlan, holdLook, outputSizeForHeight, planAt, tlToSrc, type AudioSegment, type Plan, type Project } from '@waypost/core';
import { composeScene, registerWorkerFonts, sceneFor, type AssetImages } from '@waypost/render';
import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
  type Quality,
  type StreamTargetChunk,
  type VideoCodec,
} from 'mediabunny';
import { ExportCancelled } from './stills';

/* MP4 export (F13; docs/02-architecture.md, "Rendering pipeline"). Runs in the export worker. The guide's plan (the timeline with
   a pause at every step) is walked frame by frame; each frame is drawn by @waypost/render, the same code as the canvas, so
   framing, effect regions, zoom, reveals, logo and captions match the editor. The recording's own sound follows the plan.

   H.264 and AAC are preferred, since they play everywhere. A browser that can't encode them (Chromium on Linux) falls back to
   VP9 and Opus in the same MP4, which plays in browsers but not in QuickTime; the result says which codecs it used. */

export const MP4_HEIGHTS = [720, 1080, 1440, 2160] as const;
export type Mp4Height = (typeof MP4_HEIGHTS)[number];

export interface Mp4Options {
  /** output height in pixels; the width follows the framing's shape */
  height: Mp4Height;
  fps: number;
  /** each step's title as a caption while the video pauses on it */
  captions: boolean;
  /** the recording's own sound */
  audio: boolean;
}

export interface Mp4Job {
  project: Project;
  recording: Blob;
  assets: AssetImages;
  fonts: { regular: ArrayBuffer; semibold: ArrayBuffer };
  options: Mp4Options;
  /** where the file goes; in memory when left out */
  writable?: WritableStream<StreamTargetChunk>;
  onProgress: (done: number, total: number) => void;
  cancelled: () => boolean;
}

export interface Mp4Result {
  width: number;
  height: number;
  /** seconds */
  duration: number;
  frames: number;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec | null;
  /** the file, when no writable was given */
  bytes?: ArrayBuffer;
}

/** Plain names for the codecs, for the message after an export. */
export const CODEC_NAMES: Record<string, string> = { avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1', vp8: 'VP8', aac: 'AAC', opus: 'Opus' };

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
/** seconds of sound per chunk handed to the encoder */
const AUDIO_CHUNK = 0.5;
/** seconds of fade where sound starts or stops, so cuts don't click */
const EDGE_FADE = 0.005;

/**
 * The soundtrack as a stream of chunks in output time: silence where the plan is silent, and the recording's sound (resampled to
 * 48 kHz stereo by the encoder's transform) where it plays.
 */
async function* soundtrack(segments: readonly AudioSegment[], sink: AudioSampleSink, rate: number, channels: number): AsyncGenerator<AudioSample> {
  for (const seg of segments) {
    const frames = Math.round(seg.duration * rate);
    const out = Array.from({ length: channels }, () => new Float32Array(frames));
    if (seg.source) {
      const from = seg.source.time, to = from + seg.duration;
      for await (const sample of sink.samples(from, to)) {
        try {
          const first = Math.max(0, Math.round((from - sample.timestamp) * rate));
          const at = Math.round((sample.timestamp - from) * rate) + first;
          const count = Math.min(sample.numberOfFrames - first, frames - at);
          if (count <= 0) continue;
          for (let c = 0; c < channels; c++) {
            const plane = new Float32Array(count);
            sample.copyTo(plane, { planeIndex: Math.min(c, sample.numberOfChannels - 1), format: 'f32-planar', frameOffset: first, frameCount: count });
            out[c]!.set(plane, at);
          }
        } finally {
          sample.close();
        }
      }
      const fade = Math.min(Math.round(EDGE_FADE * rate), Math.floor(frames / 2));
      for (const plane of out) {
        for (let i = 0; i < frames; i++) plane[i]! *= seg.source.volume;
        for (let i = 0; i < fade; i++) {
          plane[i]! *= i / fade;
          plane[frames - 1 - i]! *= i / fade;
        }
      }
    }
    /* hand it over in chunks, planar float */
    const step = Math.round(AUDIO_CHUNK * rate);
    for (let i = 0; i < frames; i += step) {
      const n = Math.min(step, frames - i);
      const data = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) data.set(out[c]!.subarray(i, i + n), c * n);
      yield new AudioSample({ data, format: 'f32-planar', numberOfChannels: channels, sampleRate: rate, timestamp: seg.start + i / rate });
    }
  }
}

export interface PlanEncode {
  project: Project;
  videoTrack: InputVideoTrack;
  /** the recording's sound, when the video carries it */
  audioTrack: InputAudioTrack | null;
  plan: Plan;
  width: number;
  height: number;
  fps: number;
  captions: boolean;
  assets: AssetImages;
  quality: Quality;
  target: BufferTarget | StreamTarget;
  /** moov at the front, so a browser can start playing before the file has fully arrived */
  fastStart: false | 'in-memory';
  onProgress: (done: number, total: number) => void;
  cancelled: () => boolean;
}

/**
 * Walks a plan frame by frame, drawing each frame with @waypost/render and encoding it, with the recording's sound alongside when
 * there is an audio track. Throws `ExportCancelled` when `cancelled()` turns true.
 */
export async function encodePlan(job: PlanEncode): Promise<{ frames: number; videoCodec: VideoCodec; audioCodec: AudioCodec | null }> {
  const { project, plan, width, height, fps, videoTrack, audioTrack } = job;
  const total = Math.max(1, Math.round(plan.duration * fps));

  const videoCodec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], { width, height });
  if (!videoCodec) throw new Error(`This browser can't encode video at ${width} × ${height}. Try a smaller size.`);
  const segments = audioTrack ? audioPlan(project, plan) : [];
  const audible = segments.some(s => s.source);
  const audioCodec = audible ? await getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE }) : null;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: job.fastStart }), target: job.target });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality: job.quality, keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps });
  let audio: AudioSampleSource | null = null;
  if (audioCodec) {
    audio = new AudioSampleSource({ codec: audioCodec, quality: job.quality, transform: { sampleRate: SAMPLE_RATE, numberOfChannels: CHANNELS } });
    output.addAudioTrack(audio);
  }
  output.setMetadataTags({ title: project.name });
  await output.start();

  const sound = audio && audioTrack ? soundtrack(segments, new AudioSampleSink(audioTrack), audioTrack.sampleRate, Math.min(CHANNELS, audioTrack.numberOfChannels)) : null;
  let pending: AudioSample | null = null;
  /** feeds sound up to output time `until`, so the tracks stay interleaved */
  const pumpAudio = async (until: number) => {
    if (!sound || !audio) return;
    for (;;) {
      if (!pending) {
        const next = await sound.next();
        if (next.done) return;
        pending = next.value;
      }
      if (pending.timestamp >= until) return;
      await audio.add(pending);
      pending.close();
      pending = null;
    }
  };

  /* the recording time each output frame shows; never decreasing, since clips play in order, so one decoding pass serves all */
  const at = (i: number) => planAt(plan, i / fps);
  const sourceTimes = function* () {
    for (let i = 0; i < total; i++) {
      const pos = tlToSrc(project.timeline, at(i).timeline);
      yield (pos?.time ?? 0) + 1e-4;
    }
  };
  const frames = new CanvasSink(videoTrack, { poolSize: 2 }).canvasesAtTimestamps(sourceTimes());
  let last: OffscreenCanvas | HTMLCanvasElement | null = null;

  try {
    for (let i = 0; i < total; i++) {
      if (job.cancelled()) throw new ExportCancelled();
      const wrapped = (await frames.next()).value;
      if (wrapped) last = wrapped.canvas;
      if (!last) continue;
      const t = i / fps;
      const now = at(i);
      const pos = tlToSrc(project.timeline, now.timeline);
      const hold = now.hold;
      const step = hold ? project.steps.find(s => s.id === hold.stepId) : undefined;
      const look = step && hold ? holdLook(step, hold.t, hold.duration) : null;
      const caption =
        job.captions && step && hold && step.title.trim()
          ? { text: step.title, alpha: clamp(Math.min(hold.t / 0.3, (hold.duration - hold.t) / 0.25), 0, 1) }
          : null;
      const scene = sceneFor(project, { frame: last, sourceTime: pos?.time ?? 0, step, look, annotations: !!step, assets: job.assets, caption, opaque: true });
      composeScene(ctx, width, height, scene);
      await video.add(t, 1 / fps);
      await pumpAudio(t + 1 / fps);
      if (i % 5 === 0) job.onProgress(i, total);
    }
    await pumpAudio(Infinity);
    job.onProgress(total, total);
    await output.finalize();
  } catch (error) {
    await frames.return(undefined);
    await output.cancel();
    throw error;
  } finally {
    (pending as AudioSample | null)?.close();
  }
  return { frames: total, videoCodec, audioCodec };
}

/** Renders and encodes the guide as a video. Throws `ExportCancelled` when `cancelled()` turns true. */
export async function encodeMp4(job: Mp4Job): Promise<Mp4Result> {
  const { project, options } = job;
  const source = project.sources[0];
  if (!source) throw new Error('This project has no recording.');
  await registerWorkerFonts(job.fonts);

  const input = new Input({ source: new BlobSource(job.recording), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('The recording has no video.');
    const audioTrack = options.audio ? await input.getPrimaryAudioTrack() : null;
    const [width, height] = outputSizeForHeight(project.frame, source.size, options.height);
    const target = job.writable ? new StreamTarget(job.writable, { chunked: true }) : new BufferTarget();
    const result = await encodePlan({
      project,
      videoTrack,
      audioTrack,
      plan: exportPlan(project),
      width,
      height,
      fps: options.fps,
      captions: options.captions,
      assets: job.assets,
      quality: QUALITY_HIGH,
      target,
      fastStart: job.writable ? false : 'in-memory',
      onProgress: job.onProgress,
      cancelled: job.cancelled,
    });
    return {
      width,
      height,
      duration: result.frames / options.fps,
      frames: result.frames,
      videoCodec: result.videoCodec,
      audioCodec: result.audioCodec,
      bytes: target instanceof BufferTarget ? (target.buffer ?? undefined) : undefined,
    };
  } finally {
    input.dispose();
  }
}
