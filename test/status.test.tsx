import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RigConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { readStatus } from '../src/status.js';
import * as heartbeat from '../src/heartbeat.js';

function configFor(runsDir: string): RigConfig {
  return {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
}

function event(night: string, status: 'ok' | 'retry' | 'fail') {
  return JSON.stringify({ at: `${night}T23:00:00+01:00`, job: 'job', status, owner: 'rook' });
}

describe('status board', () => {
  let runsDir: string;
  let previousLaneMarker: string | undefined;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-status-'));
    previousLaneMarker = process.env.LANE_MARKER;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(runsDir, { recursive: true, force: true });
    if (previousLaneMarker === undefined) delete process.env.LANE_MARKER;
    else process.env.LANE_MARKER = previousLaneMarker;
  });

  it('links valid nights newest first with reader counts and digest routes', async () => {
    const olderNight = '2026-10-27';
    const newerNight = '2026-10-28';
    writeFileSync(
      join(runsDir, `${olderNight}.jsonl`),
      [event(olderNight, 'ok'), event(olderNight, 'retry'), event(olderNight, 'fail')].join('\n'),
    );
    writeFileSync(
      join(runsDir, `${newerNight}.jsonl`),
      [event(newerNight, 'ok'), event(newerNight, 'ok'), event(newerNight, 'retry'), '{broken JSON'].join('\n'),
    );

    const app = createApp(configFor(runsDir));
    const response = await app.request('/');
    const html = await response.text();
    const links = [...html.matchAll(/<a href="(\/digest\/\d{4}-\d{2}-\d{2})">(\d{4}-\d{2}-\d{2})<\/a>/g)];

    expect(response.status).toBe(200);
    expect(links.map((match) => [match[1], match[2]])).toEqual([
      [`/digest/${newerNight}`, newerNight],
      [`/digest/${olderNight}`, olderNight],
    ]);
    expect(html).toContain('ok: 2 · retry: 1 · fail: 0');
    expect(html).toContain('ok: 1 · retry: 1 · fail: 1');

    for (const [, path, night] of links) {
      const digestResponse = await app.request(path);
      expect(digestResponse.status).toBe(200);
      expect(await digestResponse.text()).toContain(`<title>rig · digest ${night}</title>`);
    }
  });

  it('shows an empty night with zero counts and a working digest link', async () => {
    const night = '2026-10-29';
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    const app = createApp(configFor(runsDir));

    const response = await app.request('/');
    const html = await response.text();

    expect(html).toContain(`<a href="/digest/${night}">${night}</a>`);
    expect(html).toContain('ok: 0 · retry: 0 · fail: 0');
    const digestResponse = await app.request(`/digest/${night}`);
    expect(digestResponse.status).toBe(200);
    expect(await digestResponse.text()).toContain('nothing ran');
  });

  it('keeps the no-nights message when the directory has no valid digest nights', async () => {
    const app = createApp(configFor(runsDir));
    const emptyResponse = await app.request('/');
    const emptyHtml = await emptyResponse.text();
    expect(emptyHtml).toContain('nothing in runs/');
    expect(emptyHtml).not.toContain('/digest/');

    writeFileSync(join(runsDir, '2026-02-30.jsonl'), event('2026-02-30', 'ok'));
    const invalidResponse = await app.request('/');
    const invalidHtml = await invalidResponse.text();
    expect(invalidHtml).toContain('nothing in runs/');
    expect(invalidHtml).not.toContain('2026-02-30');
  });

  it('preserves status fields, the lane banner, no-beat warning, and health response', async () => {
    vi.spyOn(heartbeat, 'lastBeat').mockReturnValue(null);
    process.env.LANE_MARKER = 'TEST-MARKER';
    const app = createApp(configFor(runsDir));

    const statusResponse = await app.request('/');
    const html = await statusResponse.text();
    expect(statusResponse.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('adapter');
    expect(html).toContain('shim');
    expect(html).toContain('2026-10-29T14:06:00+01:00');
    expect(html).toContain('<span class="warn">none</span>');

    const healthResponse = await app.request('/health');
    expect(healthResponse.status).toBe(200);
    expect(await healthResponse.json()).toEqual({ ok: true, lane: 'lane-07' });
  });

  it('does not hide unexpected filesystem errors while reading night summaries', () => {
    mkdirSync(join(runsDir, '2026-10-28.jsonl'));
    expect(() => readStatus(configFor(runsDir))).toThrow(/EISDIR/);
  });
});
