// Plan morning-digest § 1. The contract every part of § 2 builds against; the reader lives in
// `src/digest/read.ts` and exports `readNight: ReadNight`.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job. Times keep the offset from the log. `owner` null renders as `—`.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  // Sorted by job, so the page and the JSON can't disagree on order.
  rows: DigestRow[];
  // Lines per status, over the lines that parsed.
  counts: Record<RunStatus, number>;
  // Lines that didn't parse: counted, never thrown.
  badLines: number;
};

// null when runs/<night>.jsonl doesn't exist. An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
