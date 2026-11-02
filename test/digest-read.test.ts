import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
  });

  it('sorts rows by job (code-unit order)', () => {
    const jobs = night?.rows.map((r) => r.job) ?? [];
    expect(jobs).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });

  it('counts retries and keeps the last status', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: null, owner: 'rook' });
    expect(row?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(row?.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('keeps the last error on a failed job', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps a null owner', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row?.owner).toBeNull();
  });

  it('counts lines per status over parsed lines', () => {
    const c = night?.counts;
    expect(c).toBeDefined();
    if (c === undefined || night === null) return;
    const totalRuns = night.rows.reduce((n, r) => n + r.runs, 0);
    expect(c.ok + c.retry + c.fail).toBe(totalRuns);
    expect(c.fail).toBe(1);
    expect(c.retry).toBe(4);
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a missing file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns an empty Night for an empty file', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('ignores blank lines and counts bad shapes', () => {
    const lines = [
      '',
      '{"at":"2026-01-03T01:00:00-03:00","job":"a","status":"ok","owner":"x"}',
      '   ',
      '{"at":"2026-01-03T02:00:00-03:00","job":"a","status":"nope","owner":"x"}',
      '{"at":"2026-01-03T02:00:00-03:00","job":"a","status":"ok"}',
      '{"at":"2026-01-03T02:00:00-03:00","job":"a","status":"ok","owner":null,"error":5}',
      '[1,2]',
      'not json',
      '',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n'));
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(5);
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-03T01:00:00-03:00',
        lastAt: '2026-01-03T01:00:00-03:00',
      },
    ]);
  });

  it('rejects nights that are not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'x.jsonl'), '');
    expect(readNight(dir, '../etc/passwd')).toBeNull();
    expect(readNight(dir, 'x')).toBeNull();
    expect(readNight(dir, '2026-01-01/../x')).toBeNull();
  });
});
