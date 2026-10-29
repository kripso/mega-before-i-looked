import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { NightDigest } from '../src/digest/types.js';

const night = '2026-10-28';
const defaultAt = `${night}T23:00:00+01:00`;
const testLaneId = 'test-lane';
const testLaneMarker = 'test-marker';

type RunEvent = {
  at: string;
  job: string;
  status: 'ok' | 'retry' | 'fail';
  owner: string | null;
  error?: string;
};

function event(overrides: Partial<RunEvent> = {}): RunEvent {
  return { at: defaultAt, job: 'job', status: 'ok', owner: 'rook', ...overrides };
}

function jsonl(entries: Array<RunEvent | string>): string {
  return entries
    .map((entry) => typeof entry === 'string' ? entry : JSON.stringify(entry))
    .join('\n');
}

function rowForJob(html: string, job: string): string | undefined {
  return [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => row)
    .find((row) => row?.includes(`<th scope="row">${job}</th>`));
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('digest routes through createApp', () => {
  let runsDir: string;
  let originalLaneId: string | undefined;
  let originalLaneMarker: string | undefined;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
    originalLaneId = process.env.LANE_ID;
    originalLaneMarker = process.env.LANE_MARKER;
    process.env.LANE_ID = testLaneId;
    process.env.LANE_MARKER = testLaneMarker;
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
    restoreEnvironment('LANE_ID', originalLaneId);
    restoreEnvironment('LANE_MARKER', originalLaneMarker);
  });

  function appForRuns() {
    const config: RigConfig = {
      adapter: 'test',
      installed: 'test',
      beatEverySeconds: 60,
      runsDir,
    };
    return createApp(config);
  }

  it('serves sorted, matching HTML and JSON digests for mixed valid and malformed lines', async () => {
    const firstOffsetAt = '2026-10-28T23:30:00-04:00';
    const lastOffsetAt = '2026-10-29T06:30:00+01:00';
    writeFileSync(join(runsDir, `${night}.jsonl`), jsonl([
      event({ job: 'retry/two', status: 'retry', at: '2026-10-28T23:00:00+01:00' }),
      event({ job: 'null-owner', owner: null, at: lastOffsetAt }),
      event({ job: 'recovered/job', status: 'ok', at: '2026-10-28T23:05:00+01:00' }),
      event({ job: 'retry/three', status: 'retry', at: '2026-10-28T23:00:00+01:00' }),
      event({ job: 'alpha', at: '2026-10-28T23:00:00+01:00' }),
      event({ job: 'recovered/job', status: 'fail', error: 'temporary', at: '2026-10-28T23:04:00+01:00' }),
      '{malformed JSON',
      event({ job: 'null-owner', owner: null, at: firstOffsetAt }),
      event({ job: 'retry/two', status: 'retry', at: '2026-10-28T23:01:00+01:00' }),
      event({ job: 'retry/three', status: 'retry', at: '2026-10-28T23:01:00+01:00' }),
      event({ job: 'retry/three', status: 'retry', at: '2026-10-28T23:02:00+01:00' }),
      event({ job: 'retry/two', at: '2026-10-28T23:02:00+01:00' }),
      event({ job: 'retry/three', at: '2026-10-28T23:03:00+01:00' }),
      event({ job: 'recovered/job', status: 'ok', at: '2026-10-28T23:06:00+01:00' }),
    ]));

    const app = appForRuns();
    const [pageResponse, apiResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const digest = await apiResponse.json() as NightDigest;
    const expectedJobs = ['alpha', 'null-owner', 'recovered/job', 'retry/three', 'retry/two'];
    const pageJobs = [...html.matchAll(/<th scope="row">([^<]*)<\/th>/g)]
      .map(([, job]) => job);

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    expect(apiResponse.headers.get('content-type')).toMatch(/^application\/json(?:;|$)/);
    expect(pageJobs).toEqual(expectedJobs);
    expect(digest.rows.map((row) => row.job)).toEqual(expectedJobs);
    expect(pageJobs).toEqual(digest.rows.map((row) => row.job));
    expect(digest).toMatchObject({
      night,
      badLines: 1,
      counts: { ok: 7, retry: 5, fail: 1 },
    });
    expect(html).toContain('bad lines: 1');
    expect(html).toContain(`<span class="marker">${testLaneMarker}</span>`);
    expect(html).toContain(testLaneId);

    const nullOwner = digest.rows.find((row) => row.job === 'null-owner');
    expect(nullOwner).toMatchObject({ owner: null, firstAt: firstOffsetAt, lastAt: lastOffsetAt });
    const nullOwnerRow = rowForJob(html, 'null-owner');
    expect(nullOwnerRow).toContain('<td>—</td>');
    expect(nullOwnerRow).toContain(firstOffsetAt);
    expect(nullOwnerRow).toContain(lastOffsetAt);

    const twoRetries = digest.rows.find((row) => row.job === 'retry/two');
    expect(twoRetries).toMatchObject({ retries: 2 });
    expect(rowForJob(html, 'retry/two')).toContain('<td>2</td>');
    expect(rowForJob(html, 'retry/two')).not.toContain('high retry count');

    const threeRetries = digest.rows.find((row) => row.job === 'retry/three');
    expect(threeRetries).toMatchObject({ retries: 3 });
    expect(rowForJob(html, 'retry/three')).toContain('3 · high retry count (3 or more)');

    const recovered = digest.rows.find((row) => row.job === 'recovered/job');
    expect(recovered).toMatchObject({ failures: 1, lastStatus: 'ok' });
    expect(rowForJob(html, 'recovered/job')).toContain('1 failed run');
    expect(rowForJob(html, 'recovered/job')).toContain('<td>ok</td>');
  });

  it('returns 404 from both routes when the night file is missing', async () => {
    const app = appForRuns();

    const [pageResponse, apiResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);

    expect(pageResponse.status).toBe(404);
    expect(apiResponse.status).toBe(404);
  });

  it('renders an empty night and returns empty JSON rows with zero counts', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '');

    const app = appForRuns();
    const [pageResponse, apiResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const digest = await apiResponse.json() as NightDigest;

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(digest).toEqual({
      night,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});
