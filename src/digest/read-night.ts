import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  time: number;
  fraction: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isNight(night: string): boolean {
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  const time = Date.parse(`${night}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === night;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const { at, job, status, owner, error } = value;
  if (
    typeof at !== 'string' ||
    typeof job !== 'string' || job.trim() === '' ||
    (status !== 'ok' && status !== 'retry' && status !== 'fail') ||
    (owner !== null && typeof owner !== 'string') ||
    (error !== undefined && typeof error !== 'string')
  ) return null;

  // Require an actual calendar date and an explicit offset, not Date.parse's loose formats.
  const timestamp = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.(\d+))?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(at);
  if (!timestamp || timestamp[0] !== at || !isNight(timestamp[1])) return null;
  const time = Date.parse(at);
  if (!Number.isFinite(time)) return null;

  return {
    at, time, job, status, owner, error,
    fraction: (timestamp[2] ?? '').replace(/0+$/, ''),
  };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const counts = { ok: 0, retry: 0, fail: 0 };
  const events: RunEvent[] = [];
  let badLines = 0;
  for (const line of contents.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (event) events.push(event);
    else badLines++;
  }

  // Stable sort: equal instants keep file order, so later lines win latest-value ties.
  // Compare fractions too: Date.parse alone truncates sub-millisecond precision.
  events.sort((a, b) => a.time - b.time || compareText(a.fraction, b.fraction));
  const rows = new Map<string, DigestRow>();
  for (const event of events) {
    counts[event.status]++;
    let row = rows.get(event.job);
    if (!row) {
      row = {
        job: event.job,
        owner: event.owner,
        runs: 0,
        retries: 0,
        failures: 0,
        lastStatus: event.status,
        lastError: null,
        firstAt: event.at,
        lastAt: event.at,
      };
      rows.set(event.job, row);
    }
    row.runs++;
    if (event.status === 'retry') row.retries++;
    if (event.status === 'fail') row.failures++;
    row.owner = event.owner;
    row.lastStatus = event.status;
    row.lastAt = event.at;
    if (event.error !== undefined) row.lastError = event.error;
  }

  return {
    night,
    // Code-unit order is deterministic across host locales.
    rows: [...rows.values()].sort((a, b) => compareText(a.job, b.job)),
    badLines,
    counts,
  };
};
