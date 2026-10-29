export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  failures: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type DigestCounts = {
  ok: number;
  retry: number;
  fail: number;
};

export type NightDigest = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  counts: DigestCounts;
};

/**
 * readNight(runsDir, night) synchronously aggregates valid events into job-sorted rows,
 * counting bad nonempty lines and preserving timestamp offsets and the last supplied error.
 * Events are ordered chronologically, then by file order. Missing/invalid nights return null;
 * empty files return an empty digest, and unexpected filesystem errors propagate.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
