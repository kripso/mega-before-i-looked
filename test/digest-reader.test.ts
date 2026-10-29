import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const sampleRuns = fileURLToPath(new URL('../runs/', import.meta.url));
const night = '2026-10-28';
const at = '2026-10-28T23:00:00+01:00';
const event = (overrides: Record<string, unknown> = {}) => ({
  at, job: 'job', status: 'ok', owner: 'rook', ...overrides,
});

const invalidRecords: [string, unknown][] = [
  ['null', null],
  ['array', []],
  ['string', 'not an event'],
  ['number', 42],
  ['boolean', true],
  ['empty object', {}],
  ['missing at', { job: 'job', status: 'ok', owner: 'rook' }],
  ['null at', event({ at: null })],
  ['numeric at', event({ at: 123 })],
  ['unparseable at', event({ at: 'not a timestamp' })],
  ['date-only at', event({ at: night })],
  ['offsetless at', event({ at: '2026-10-28T23:00:00' })],
  ['loose date format', event({ at: 'October 28, 2026 23:00:00 GMT' })],
  ['impossible calendar date', event({ at: '2026-02-30T23:00:00+01:00' })],
  ['non-leap day', event({ at: '2026-02-29T23:00:00Z' })],
  ['invalid hour', event({ at: '2026-10-28T24:00:00Z' })],
  ['invalid minute', event({ at: '2026-10-28T23:60:00Z' })],
  ['invalid second', event({ at: '2026-10-28T23:00:60Z' })],
  ['invalid offset hour', event({ at: '2026-10-28T23:00:00+24:00' })],
  ['invalid offset minute', event({ at: '2026-10-28T23:00:00+01:60' })],
  ['timestamp with trailing newline', event({ at: `${at}\n` })],
  ['missing job', { at, status: 'ok', owner: 'rook' }],
  ['null job', event({ job: null })],
  ['numeric job', event({ job: 123 })],
  ['empty job', event({ job: '' })],
  ['blank job', event({ job: ' \t' })],
  ['missing status', { at, job: 'job', owner: 'rook' }],
  ['null status', event({ status: null })],
  ['numeric status', event({ status: 1 })],
  ['unknown status', event({ status: 'success' })],
  ['wrong-case status', event({ status: 'OK' })],
  ['missing owner', { at, job: 'job', status: 'ok' }],
  ['numeric owner', event({ owner: 123 })],
  ['object owner', event({ owner: {} })],
  ['array owner', event({ owner: [] })],
  ['null error', event({ error: null })],
  ['numeric error', event({ error: 123 })],
  ['object error', event({ error: {} })],
  ['array error', event({ error: [] })],
];

describe('readNight', () => {
  let runsDir: string;
  const fixturePath = () => join(runsDir, `${night}.jsonl`);
  const writeEvents = (events: unknown[]) => {
    writeFileSync(fixturePath(), events.map((entry) => JSON.stringify(entry)).join('\n'));
  };

  beforeEach(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('aggregates the read-only 2026-10-28 sample', () => {
    expect(readNight(sampleRuns, night)).toEqual({
      night,
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0, failures: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, failures: 0,
          lastStatus: 'ok', lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, failures: 0,
          lastStatus: 'ok', lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, failures: 1,
          lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, failures: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('reads the read-only 2026-10-27 sample', () => {
    const digest = readNight(sampleRuns, '2026-10-27');
    expect(digest).toMatchObject({
      night: '2026-10-27', badLines: 0, counts: { ok: 7, retry: 0, fail: 0 },
    });
    expect(digest?.rows.map((row) => row.job)).toEqual([
      'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows.find((row) => row.job === 'lane/sync')).toEqual({
      job: 'lane/sync', owner: 'rook', runs: 4, retries: 0, failures: 0,
      lastStatus: 'ok', lastError: null,
      firstAt: '2026-10-27T23:00:05+01:00', lastAt: '2026-10-28T05:00:04+01:00',
    });
  });

  it('returns null for a missing file or missing runs directory', () => {
    expect(readNight(runsDir, night)).toBeNull();
    expect(readNight(join(runsDir, 'missing'), night)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['blank-only', '\r\n \t\r\n\n'],
  ])('returns a non-null empty digest for an %s file', (_label, contents) => {
    writeFileSync(fixturePath(), contents);
    expect(readNight(runsDir, night)).toEqual({
      night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts malformed and invalid nonempty lines, ignores blanks, and keeps reading', () => {
    writeFileSync(fixturePath(), [
      '', ' \t', JSON.stringify(event()), '{broken JSON', '[]',
      JSON.stringify(event({ job: 'tail' })), '', ' ', '',
    ].join('\r\n'));
    const digest = readNight(runsDir, night);
    expect(digest).toMatchObject({ badLines: 2, counts: { ok: 2, retry: 0, fail: 0 } });
    expect(digest?.rows.map((row) => row.job)).toEqual(['job', 'tail']);
  });

  it.each(invalidRecords)('counts an invalid record: %s', (_label, invalid) => {
    writeEvents([invalid, event()]);
    const digest = readNight(runsDir, night);
    expect(digest).toMatchObject({ badLines: 1, counts: { ok: 1, retry: 0, fail: 0 } });
    expect(digest?.rows).toHaveLength(1);
    expect(digest?.rows[0].runs).toBe(1);
  });

  it('retains null owners and ignores extra record fields', () => {
    writeEvents([event({ owner: null, extra: { ignored: true } })]);
    expect(readNight(runsDir, night)).toEqual({
      night, badLines: 0, counts: { ok: 1, retry: 0, fail: 0 },
      rows: [{
        job: 'job', owner: null, runs: 1, retries: 0, failures: 0,
        lastStatus: 'ok', lastError: null, firstAt: at, lastAt: at,
      }],
    });
  });

  it('uses chronological instants for unordered events while preserving offsets and recovery history', () => {
    const firstAt = '2026-10-29T01:00:00+03:00';
    const lastAt = '2026-10-29T00:30:00-02:00';
    writeEvents([
      event({ at: lastAt, owner: null }),
      event({ at: '2026-10-28T23:30:00Z', status: 'retry', owner: 'retry-owner', error: 'newer error' }),
      event({ at: firstAt, status: 'fail', owner: 'old-owner', error: 'older error' }),
      event({ at: '2026-10-29T00:00:00Z', owner: 'intermediate-owner' }),
    ]);
    expect(readNight(runsDir, night)).toEqual({
      night, badLines: 0, counts: { ok: 2, retry: 1, fail: 1 },
      rows: [{
        job: 'job', owner: null, runs: 4, retries: 1, failures: 1,
        lastStatus: 'ok', lastError: 'newer error', firstAt, lastAt,
      }],
    });
  });

  it('breaks equal-instant ties by file order, keeping the first time and latest supplied values', () => {
    const firstAt = '2026-10-28T22:00:00.1Z';
    const lastAt = '2026-10-28T20:00:00.1000-02:00';
    writeEvents([
      event({ at: firstAt, status: 'fail', error: 'first error' }),
      event({ at: '2026-10-28T23:00:00.100+01:00', status: 'retry', owner: 'new-owner', error: 'last error' }),
      event({ at: lastAt, owner: null }),
    ]);
    expect(readNight(runsDir, night)).toEqual({
      night, badLines: 0, counts: { ok: 1, retry: 1, fail: 1 },
      rows: [{
        job: 'job', owner: null, runs: 3, retries: 1, failures: 1,
        lastStatus: 'ok', lastError: 'last error', firstAt, lastAt,
      }],
    });
  });

  it('orders fractional seconds more precisely than Date.parse milliseconds', () => {
    const firstAt = '2026-10-28T23:00:00.0001+01:00';
    const lastAt = '2026-10-28T22:00:00.00020Z';
    writeEvents([
      event({ at: lastAt, owner: null }),
      event({ at: firstAt, status: 'fail', error: 'retained' }),
    ]);
    expect(readNight(runsDir, night)).toMatchObject({
      badLines: 0, counts: { ok: 1, retry: 0, fail: 1 },
      rows: [{
        owner: null, runs: 2, failures: 1, lastStatus: 'ok', lastError: 'retained', firstAt, lastAt,
      }],
    });
  });

  it('treats an empty supplied error as a value and retains it across later successes', () => {
    writeEvents([
      event({ status: 'retry', error: 'old error' }),
      event({ at: '2026-10-28T23:01:00+01:00', error: '' }),
      event({ at: '2026-10-28T23:02:00+01:00' }),
    ]);
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({
      runs: 3, retries: 1, failures: 0, lastStatus: 'ok', lastError: '',
    });
  });

  it('sorts job names by code units and safely groups names matching object properties', () => {
    const jobs = ['z', 'constructor', 'a', '__proto__', 'A', 'ä', '__proto__'];
    writeEvents(jobs.map((job) => event({ job })));
    const digest = readNight(runsDir, night);
    expect(digest?.rows.map((row) => row.job)).toEqual(['A', '__proto__', 'a', 'constructor', 'z', 'ä']);
    expect(digest?.rows.find((row) => row.job === '__proto__')?.runs).toBe(2);
    expect(digest?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });

  it('accepts a real leap-day night and timestamp', () => {
    const leapNight = '2024-02-29';
    writeFileSync(join(runsDir, `${leapNight}.jsonl`), JSON.stringify(event({ at: `${leapNight}T23:00:00Z` })));
    expect(readNight(runsDir, leapNight)).toMatchObject({
      night: leapNight, badLines: 0, counts: { ok: 1, retry: 0, fail: 0 },
    });
  });

  it.each([
    '', '.', '..', '../2026-10-28', '..\\2026-10-28', '/2026-10-28',
    '2026-10-28/extra', '2026-10-28\\extra', '%2e%2e%2f2026-10-28',
    '2026-10-28.jsonl', '2026-1-28', '26-10-28', '2026-10-280',
    '2026-00-28', '2026-13-28', '2026-10-00', '2026-10-32', '2026-02-29', '2026-02-30',
    ' 2026-10-28', '2026-10-28 ', '2026-10-28\n', '2026-10-28\r\n', '2026-10-28\0',
  ])('rejects unsafe or invalid night %j before filesystem access', (invalidNight) => {
    const notDirectory = join(runsDir, 'not-a-directory');
    writeFileSync(notDirectory, '');
    expect(readNight(notDirectory, invalidNight)).toBeNull();
  });

  it('cannot traverse from the runs directory to another night file', () => {
    writeEvents([event()]);
    const nestedRuns = join(runsDir, 'nested');
    mkdirSync(nestedRuns);
    expect(readNight(nestedRuns, `../${night}`)).toBeNull();
  });

  it('propagates unexpected filesystem errors instead of treating them as missing nights', () => {
    mkdirSync(fixturePath());
    expect(() => readNight(runsDir, night)).toThrow(/EISDIR/);
    const notDirectory = join(runsDir, 'not-a-directory');
    writeFileSync(notDirectory, '');
    expect(() => readNight(notDirectory, night)).toThrow(/ENOTDIR/);
  });
});
