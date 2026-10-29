import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RigConfig } from '../src/config.js';
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
  app.route('/digest', createDigestPage(config));
  return app;
}

function event(overrides: Record<string, unknown> = {}) {
  return { at: timestamp, job: 'job', status: 'ok', owner: 'rook', ...overrides };
}

describe('digest page', () => {
  let runsDir: string;

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-page-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('renders the sample night in reader order with offsets and warnings', async () => {
    const response = await appFor(sampleRuns).request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<title>rig · digest 2026-10-28</title>');
    expect(html).toContain('digest/render');
    expect(html).toContain('fixtures/refresh');
    expect(html).toContain('lane/sync');
    expect(html).toContain('notes/backup');
    expect(html).toContain('rig/rotate-logs');
    expect(html.indexOf('digest/render')).toBeLessThan(html.indexOf('fixtures/refresh'));
    expect(html.indexOf('fixtures/refresh')).toBeLessThan(html.indexOf('lane/sync'));
    expect(html.indexOf('lane/sync')).toBeLessThan(html.indexOf('notes/backup'));
    expect(html.indexOf('notes/backup')).toBeLessThan(html.indexOf('rig/rotate-logs'));
    expect(html).toContain('—');
    expect(html).toContain('3 · high retry count (3 or more)');
    expect(html).toContain('1 failed run');
    expect(html).toContain('2026-10-29T05:41:09+01:00');
    expect(html).toContain('2026-10-29T04:00:01+01:00');
  });

  it('returns 404 when the night file is missing', async () => {
    const response = await appFor(runsDir).request(`/digest/${night}`);

    expect(response.status).toBe(404);
  });

  it('renders an empty file as nothing ran', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '');

    const response = await appFor(runsDir).request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('shows the bad-line count and keeps rendering an empty digest', async () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), '{broken JSON\n');

    const response = await appFor(runsDir).request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('bad lines: 1');
    expect(html).toContain('nothing ran');
  });

  it('escapes content and marks recovered failures and high retries with visible text', async () => {
    const job = '<img src="x" onerror="alert(1)">';
    const error = '<script>alert(1)</script>';
    writeFileSync(
      join(runsDir, `${night}.jsonl`),
      [
        event({ job, status: 'fail', owner: null, error }),
        event({ job, status: 'retry', owner: null, at: '2026-10-28T23:01:00+01:00' }),
        event({ job, status: 'retry', owner: null, at: '2026-10-28T23:02:00+01:00' }),
        event({ job, status: 'retry', owner: null, at: '2026-10-28T23:03:00+01:00' }),
        event({ job, status: 'ok', owner: null, at: '2026-10-28T23:04:00+01:00' }),
      ].map((entry) => JSON.stringify(entry)).join('\n'),
    );

    const response = await appFor(runsDir).request(`/digest/${night}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('—');
    expect(html).toContain('3 · high retry count (3 or more)');
    expect(html).toContain('1 failed run');
    expect(html).toContain('>ok</td>');
    expect(html).toContain('2026-10-28T23:00:00+01:00');
    expect(html).toContain('2026-10-28T23:04:00+01:00');
  });
});
