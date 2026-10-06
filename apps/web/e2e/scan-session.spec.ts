/// <reference lib="dom" />
import { test, expect } from '@playwright/test';

// The rules behind the camera scan, exercised directly on the real module
// (served by the Vite dev server) with a fake reader, so a decode result can
// be replayed at any moment. No login or camera is needed.
type Probe = {
  // 1: two decodes in a row, then more (even of another code) after the card resolved
  resolvedAfterTwoDecodes: number;
  liveTracksAfterResolve: number;
  resolvedAfterLaterDecodes: number;
  // 2: a failed lookup
  failedAfterRepeatedBadFrames: number;
  resolvedAfterRescan: number;
  // 3: stopped while a lookup was in flight
  resolvedAfterStop: number;
  // 4: stopped while the camera was still opening
  liveTracksAfterStopWhileOpening: number;
  // 5: a second session waits for the first to release
  startOrder: string;
  liveTracksAtEnd: number;
};

test('scan session: resolves exactly once, ignores later decode results, and stops every camera track', async ({
  page,
}) => {
  await page.goto('/login');
  const probe = await page.evaluate(async (): Promise<Probe> => {
    const modulePath = '/src/lib/cameraScanSession.ts';
    const { ScanSession } = (await import(/* @vite-ignore */ modulePath)) as typeof import('../src/lib/cameraScanSession');

    const streams: MediaStream[] = [];
    const makeStream = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      canvas.getContext('2d')!.fillRect(0, 0, 64, 64);
      const stream = canvas.captureStream(5);
      streams.push(stream);
      return stream;
    };
    const live = () => streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // A reader whose decode callback the test fires by hand.
    let fire: (text: string) => void = () => undefined;
    const reader = {
      decodeFromStream: async (_s: MediaStream, _v: unknown, cb: (r: { getText(): string } | undefined) => void) => {
        fire = (text) => cb({ getText: () => text });
        return { stop: () => undefined };
      },
    };

    let resolved = 0;
    let failed = 0;
    const make = (getUserMedia: () => Promise<MediaStream> = async () => makeStream()) =>
      new ScanSession<string>(
        {
          getUserMedia,
          createReader: () => reader,
          lookUp: async (text) => {
            await wait(20);
            if (text === 'BAD') throw new Error('not a card');
            return text;
          },
        },
        { onResolved: () => void (resolved += 1), onLookupFailed: () => void (failed += 1) },
      );
    const video = document.createElement('video');

    // 1. Two decodes before the first lookup returns, then more afterwards.
    const a = make();
    await a.start(() => video);
    fire('SBH-1');
    fire('SBH-1');
    await wait(80);
    const resolvedAfterTwoDecodes = resolved;
    const liveTracksAfterResolve = live();
    fire('SBH-1');
    fire('SBH-2');
    await wait(80);
    const resolvedAfterLaterDecodes = resolved;

    // 2. A failed lookup is reported once and the session waits for rescan().
    const b = make();
    await b.start(() => video);
    fire('BAD');
    await wait(80);
    fire('BAD');
    await wait(80);
    const failedAfterRepeatedBadFrames = failed;
    const resolvedBeforeRescan = resolved;
    b.rescan();
    fire('SBH-3');
    await wait(80);
    const resolvedAfterRescan = resolved - resolvedBeforeRescan;

    // 3. A lookup that returns after stop() (the screen went away) resolves nothing.
    const c = make();
    await c.start(() => video);
    const resolvedBeforeStop = resolved;
    fire('SBH-4');
    await c.stop();
    await wait(80);
    const resolvedAfterStop = resolved - resolvedBeforeStop;

    // 4. Stopped while the camera is still opening: released the moment it arrives.
    let arrive!: () => void;
    const slow = make(
      () =>
        new Promise<MediaStream>((resolve) => {
          arrive = () => resolve(makeStream());
        }),
    );
    const opening = slow.start(() => video);
    const stopping = slow.stop();
    arrive();
    await opening;
    await stopping;
    const liveTracksAfterStopWhileOpening = live();

    // 5. A second session on the same video waits for the first to finish releasing.
    const order: string[] = [];
    const d = make();
    const e = make();
    await d.start(() => video);
    const startE = e.start(
      () => video,
      d.closed.then(() => void order.push('first released')),
    );
    void d.stop();
    await startE;
    order.push('second open');
    await e.stop();

    return {
      resolvedAfterTwoDecodes,
      liveTracksAfterResolve,
      resolvedAfterLaterDecodes,
      failedAfterRepeatedBadFrames,
      resolvedAfterRescan,
      resolvedAfterStop,
      liveTracksAfterStopWhileOpening,
      startOrder: order.join(' > '),
      liveTracksAtEnd: live(),
    };
  });

  expect(probe.resolvedAfterTwoDecodes).toBe(1);
  expect(probe.liveTracksAfterResolve).toBe(0);
  expect(probe.resolvedAfterLaterDecodes).toBe(1);
  expect(probe.failedAfterRepeatedBadFrames).toBe(1);
  expect(probe.resolvedAfterRescan).toBe(1);
  expect(probe.resolvedAfterStop).toBe(0);
  expect(probe.liveTracksAfterStopWhileOpening).toBe(0);
  expect(probe.startOrder).toBe('first released > second open');
  expect(probe.liveTracksAtEnd).toBe(0);
});
