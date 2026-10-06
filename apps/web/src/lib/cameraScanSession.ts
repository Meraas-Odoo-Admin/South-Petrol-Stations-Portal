import type { IScannerControls } from '@zxing/browser';

// One camera scan, from opening the camera to releasing it. Framework-free so
// the rules that kept failing on a real phone can be tested directly:
//
//  - The scan is "done" for good after its first successful lookup: every
//    later decode result is ignored, and onResolved fires exactly once.
//  - The camera is released for certain: every track of the stream we asked
//    for is stopped, not only the scanner's own loop. A scan that is stopped
//    (or the screen unmounted) while the camera is still opening releases it
//    as soon as it arrives, instead of leaving it running.
//  - A new scan on the same <video> waits for the previous one to finish
//    releasing, so a late release can never blank the new preview.

export interface ScanReader {
  decodeFromStream(
    stream: MediaStream,
    preview: HTMLVideoElement | undefined,
    callback: (result: { getText(): string } | undefined) => void,
  ): Promise<IScannerControls>;
}

export interface ScanSessionDeps<T> {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createReader: () => ScanReader;
  lookUp: (text: string) => Promise<T>;
}

export interface ScanSessionHandlers<T> {
  // Called at most once per session, and never after stop().
  onResolved: (value: T) => void;
  // The lookup failed; the session stays open and waits for rescan().
  onLookupFailed: (text: string, error: unknown) => void;
}

// True when the track itself reports torch support: a `torch` capability that
// is present and not "false". Chrome on Android reports `true`; iOS Safari
// reports it on the phones that have a flashlight. A key that is present but
// `false` (or a list without `true`) means the camera cannot do it.
export function trackSupportsTorch(track: MediaStreamTrack | undefined): boolean {
  try {
    const capabilities = track?.getCapabilities?.() as { torch?: unknown } | undefined;
    if (!capabilities || !('torch' in capabilities)) return false;
    const torch = capabilities.torch;
    if (Array.isArray(torch)) return torch.includes(true);
    return torch !== false && torch !== undefined && torch !== null;
  } catch {
    return false;
  }
}

export class ScanSession<T> {
  private stream: MediaStream | null = null;
  private controls: IScannerControls | null = null;
  private video: HTMLVideoElement | null = null;
  private opening: Promise<void> | null = null;
  private stopped = false;
  private done = false;
  // A lookup is in flight, or a failed one is waiting for rescan().
  private busy = false;
  private closedResolve!: () => void;
  // Resolves once this session has fully released the camera.
  readonly closed: Promise<void> = new Promise((resolve) => {
    this.closedResolve = resolve;
  });
  torchSupported = false;

  constructor(
    private readonly deps: ScanSessionDeps<T>,
    private readonly handlers: ScanSessionHandlers<T>,
  ) {}

  // Opens the camera and starts decoding into the <video> that `getVideo`
  // returns once the camera is open (the element may only render by then).
  // Rejects when the camera cannot be opened (permission, no camera,
  // insecure context). Pass the previous session's `closed` as `after` so the
  // two never overlap.
  start(getVideo: () => HTMLVideoElement | null, after?: Promise<void>): Promise<void> {
    this.opening = this.open(getVideo, after);
    return this.opening;
  }

  private async open(getVideo: () => HTMLVideoElement | null, after?: Promise<void>): Promise<void> {
    if (after) await after;
    if (this.stopped) return;
    let stream: MediaStream | null = null;
    try {
      stream = await this.deps.getUserMedia({ video: { facingMode: 'environment' } });
      if (this.stopped) {
        // Stopped while the camera was opening: release it the moment it arrives.
        stopTracks(stream);
        return;
      }
      const video = getVideo();
      this.stream = stream;
      this.video = video;
      this.controls = await this.deps.createReader().decodeFromStream(stream, video ?? undefined, (result) => {
        if (result) this.handleDecoded(result.getText().trim());
      });
      if (this.stopped) return; // finish() stops the controls and the stream
      this.torchSupported = trackSupportsTorch(stream.getVideoTracks()[0]);
    } catch (error) {
      // Never leave a half-opened camera behind a failed start.
      if (stream) stopTracks(stream);
      this.stopped = true;
      await this.closeNow();
      throw error;
    }
  }

  private handleDecoded(text: string): void {
    if (this.stopped || this.done || this.busy || !text) return;
    this.busy = true;
    this.deps.lookUp(text).then(
      (value) => {
        if (this.stopped || this.done) return;
        // Done for good: from here on every decode result is ignored.
        this.done = true;
        void this.finish();
        this.handlers.onResolved(value);
      },
      (error: unknown) => {
        if (this.stopped || this.done) return;
        // Stay busy until the person chooses to scan again, so the same
        // frame is not looked up over and over while the outcome is showing.
        this.handlers.onLookupFailed(text, error);
      },
    );
  }

  // After a failed lookup: accept decode results again.
  rescan(): void {
    if (!this.stopped && !this.done) this.busy = false;
  }

  async setTorch(on: boolean): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
  }

  // Releases the camera. Safe to call any number of times, before or after
  // the camera finished opening.
  stop(): Promise<void> {
    this.stopped = true;
    return this.finish();
  }

  private finishing: Promise<void> | null = null;

  private finish(): Promise<void> {
    this.finishing ??= (async () => {
      // A camera that is still opening cleans up after itself (see open()).
      await this.opening?.catch(() => undefined);
      await this.closeNow();
    })();
    return this.finishing;
  }

  private async closeNow(): Promise<void> {
    try {
      // Stops the decode loop (and zxing's own cleanup of the <video>).
      await this.controls?.stop();
    } catch {
      // Releasing must never throw: the tracks below are what matter.
    }
    this.controls = null;
    // controls.stop() is not enough on every browser (iOS keeps the camera
    // on): stop every track of the stream itself.
    if (this.stream) stopTracks(this.stream);
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.closedResolve();
  }
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}
