import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RigConfig } from '../src/config.js';
import { createDigestApi } from '../src/digest/api.js';
import type { NightDigest } from '../src/digest/types.js';
import { createDigestPage } from '../src/digest/page.js';

const night = '2026-10-28';
const sampleRuns = fileURLToPath(new URL('../runs/', import.meta.url));
const timestamp = '2026-10-28T23:00:00+01:00';

function appFor(runsDir: string) {
  const config: RigConfig = {
    adapter: 'test',
    installed: 'test',
    beatEverySeconds: 60,
    runsDir,
  };
  const app = new Hono();
  app.route('/api/digest', createDigestApi(config));
  app.route('/digest', createDigestPage(config));
  return app;
}

function event(overrides: Record<string, unknown> = {}) {
  return { at: timestamp, job: 'job', status: 'ok', owner: 'rook', ...overrides };
}

describe('digest API', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-api-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('returns the full sample digest in the same row order as the page', async () => {
    const app = appFor(sampleRuns);
    const [response, pageResponse] = await Promise.all([
      app.request(`/api/digest/${night}`),
      app.request(`/digest/${night}`),
    ]);
    const digest = await response.json() as NightDigest;
    const html = await pageResponse.text();
    const jobs = [
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ];
    const pageJobs = [...html.matchAll(/<th scope="row">([^<]*)<\/th>/g)].map((match) => match[1]);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json(?:;|$)/);
    expect(digest.night).toBe(night);
    expect(digest.rows).toHaveLength(5);
    expect(digest.rows.map((row) => row.job)).toEqual(jobs);
    expect(pageJobs).toEqual(jobs);
    expect(digest).toMatchObject({
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
    });
  });

  it('returns an empty digest for an empty night', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '');

    const response = await appFor(runsDir).request(`/api/digest/${night}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json(?:;|$)/);
    await expect(response.json()).resolves.toEqual({
      night,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('keeps serving a night with malformed lines and reports their count', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '{broken JSON\n');

    const response = await appFor(runsDir).request(`/api/digest/${night}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      night,
      rows: [],
      badLines: 1,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('returns 404 for missing, invalid, and unsafe nights', async () => {
    const app = appFor(runsDir);

    for (const path of [
      '/api/digest/2026-10-29',
      '/api/digest/2026-02-30',
      '/api/digest/%2e%2e%2f2026-10-28',
    ]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
    }
  });

  it('preserves null owners and offset-bearing timestamps', async () => {
    writeFileSync(
      join(runsDir, `${night}.jsonl`),
      `${JSON.stringify(event({ owner: null }))}\n`,
    );

    const response = await appFor(runsDir).request(`/api/digest/${night}`);
    const digest = await response.json() as NightDigest;

    expect(response.status).toBe(200);
    expect(digest.rows).toEqual([{
      job: 'job',
      owner: null,
      runs: 1,
      retries: 0,
      failures: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: timestamp,
      lastAt: timestamp,
    }]);
  });

  it('does not disguise unexpected filesystem errors as a missing or empty night', async () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));

    const response = await appFor(runsDir).request(`/api/digest/${night}`);

    expect(response.status).toBe(500);
  });
});
