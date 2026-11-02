import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir };

const line = (at: string, job: string, status: string, owner: string | null = 'rook') =>
  JSON.stringify({ at, job, status, owner });

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  writeFileSync(
    join(dir, '2030-01-01.jsonl'),
    [
      line('2030-01-01T23:00:00+01:00', 'zeta/job', 'ok'),
      line('2030-01-01T23:05:00+01:00', 'alpha/job', 'retry'),
      line('2030-01-01T23:10:00+01:00', 'alpha/job', 'ok'),
      line('2030-01-01T23:15:00+01:00', 'mid/job', 'ok'),
    ].join('\n') + '\n',
  );
  writeFileSync(join(dir, '2030-01-02.jsonl'), '');
  writeFileSync(
    join(dir, '2030-01-03.jsonl'),
    [line('2030-01-03T23:00:00+01:00', 'alpha/job', 'ok'), 'this is not json'].join('\n') + '\n',
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const app = () => createApp(config);

describe('GET /digest/:night and /api/digest/:night', () => {
  it('200 for a normal night; page and JSON list the same jobs in the same order', async () => {
    const page = await app().request('/digest/2030-01-01');
    const api = await app().request('/api/digest/2030-01-01');
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const html = await page.text();
    const data = (await api.json()) as Night;
    expect(html).toContain('TEST-MARKER');
    const jobs = data.rows.map((r) => r.job);
    expect(jobs).toEqual(['alpha/job', 'mid/job', 'zeta/job']);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('404 for a night with no file', async () => {
    const page = await app().request('/digest/2030-02-02');
    const api = await app().request('/api/digest/2030-02-02');
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('no run log for 2030-02-02');
    expect(api.status).toBe(404);
  });

  it('the empty night says nothing ran and has no rows', async () => {
    const page = await app().request('/digest/2030-01-02');
    const api = await app().request('/api/digest/2030-01-02');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(api.status).toBe(200);
    const data = (await api.json()) as Night;
    expect(data.rows).toEqual([]);
  });

  it('a night with a bad line is still 200 and reports it', async () => {
    const page = await app().request('/digest/2030-01-03');
    const api = await app().request('/api/digest/2030-01-03');
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/1 line didn(&#39;|')t parse/);
    expect(api.status).toBe(200);
    const data = (await api.json()) as Night;
    expect(data.badLines).toBe(1);
    expect(data.rows.map((r) => r.job)).toEqual(['alpha/job']);
  });
});
