import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import pg from 'pg';
import { migrate } from '../dist/migrations.js';
import { createDatabase } from '../dist/database.js';
import { queueSql } from '../dist/postgres.js';
import { actors } from '../test/actors.js';
import { actionsPerRun, fixtureId, repetitions, seed } from './fixtures.js';

const concurrency = 8;
const listRequests = 240;
const mode = process.argv[2];
assert.ok(['load', 'profile'].includes(mode));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const trackedDiff = execFileSync(
  'git',
  [
    'status',
    '--porcelain',
    '--untracked-files=no',
    '--',
    'src',
    'bench',
    'packages',
    'migrations',
    'package.json',
    'package-lock.json',
    'Makefile',
  ],
  { encoding: 'utf8' },
);
assert.equal(
  trackedDiff,
  '',
  'Commit the benchmark, application, and migration code before measuring',
);
const artifactDir = resolve('.lab-local', 'bench', revision);
await mkdir(artifactDir, { recursive: true });

function distribution(values) {
  assert.ok(values.length > 0, 'No measurements captured');
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (p) => sorted[Math.ceil(p * sorted.length) - 1];
  return {
    count: sorted.length,
    p50: rank(0.5),
    p95: rank(0.95),
    p99: rank(0.99),
  };
}

async function parallel(count, callback) {
  const results = new Array(count);
  await Promise.all(
    Array.from({ length: concurrency }, async (_, lane) => {
      for (let index = lane; index < count; index += concurrency) {
        results[index] = await callback(index);
      }
    }),
  );
  return results;
}

async function profileSummary(name) {
  const raw = await readFile(resolve(artifactDir, name));
  const { nodes, samples, timeDeltas } = JSON.parse(raw);
  const frames = new Map(nodes.map((node) => [node.id, node.callFrame]));
  const totals = new Map();
  for (const [index, id] of samples.entries()) {
    const frame = frames.get(id);
    const key = frame.functionName || '(anonymous)';
    totals.set(key, (totals.get(key) ?? 0) + timeDeltas[index] / 1000);
  }
  return {
    file: name,
    sha256: createHash('sha256').update(raw).digest('hex'),
    sampledMs: [...totals.values()].reduce((total, ms) => total + ms, 0),
    idleMs: totals.get('(idle)') ?? 0,
    topFrames: [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

async function replicate(run) {
  const name = `run-${run}.cpuprofile`;
  const profiler =
    mode === 'profile'
      ? [
          '--cpu-prof',
          '--cpu-prof-interval=1000',
          `--cpu-prof-dir=${artifactDir}`,
          `--cpu-prof-name=${name}`,
        ]
      : [];
  const child = spawn(
    process.execPath,
    [...profiler, '--import', './bench/process-metrics.js', 'dist/main.js'],
    {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '0',
        APP_SHA: revision,
        AUTO_MIGRATE: '0',
        ACTOR_TOKENS: JSON.stringify(Object.values(actors)),
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout });
  const records = [];
  const listening = new Promise((resolve) => {
    lines.on('line', (line) => {
      const record = JSON.parse(line);
      records.push(record);
      if (record.event === 'server.listening') resolve(record.port);
    });
  });
  let batches;
  try {
    const port = await Promise.race([
      listening,
      closed.then(([code]) => {
        throw new Error(`Benchmark API exited before listening (${code})`);
      }),
    ]);
    const base = `http://127.0.0.1:${port}`;
    const version = await fetch(`${base}/version`, {
      signal: AbortSignal.timeout(8000),
    });
    assert.equal((await version.json()).sha, revision);
    async function call(actor, path, body, action) {
      const start = performance.now();
      const response = await fetch(`${base}${path}`, {
        method: action ? 'POST' : 'GET',
        headers: {
          authorization: `Bearer ${actor.token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      const data = await response.json();
      const durationMs = performance.now() - start;
      assert.equal(response.status, 200, JSON.stringify(data));
      if (!action) {
        assert.equal(data.items.length, 20);
        assert.ok(
          data.items.every(
            (item) => item.status === 'open' && item.category === 'plumbing',
          ),
        );
        if (actor.role === 'resident')
          assert.ok(data.items.every((item) => item.residentId === actor.id));
      } else {
        assert.equal(
          data.status,
          action === 'claim' ? 'in_progress' : 'resolved',
        );
      }
      const id = response.headers.get('x-business-process-id');
      assert.ok(id);
      return { id, durationMs };
    }
    const { technician, resident } = actors;
    const filters = '/requests?status=open&category=plumbing&limit=20';
    await parallel(32, (index) =>
      call(index % 2 ? resident : technician, filters),
    );
    const technicianQueue = await parallel(listRequests, (index) =>
      call(technician, `${filters}&offset=${index % 2 ? 0 : 40}`),
    );
    const residentQueue = await parallel(listRequests, (index) =>
      call(resident, `${filters}&offset=${index % 2 ? 0 : 40}`),
    );
    const transitions = await parallel(actionsPerRun, async (index) => {
      const id = fixtureId(
        'aa9b7a92-7711-45cc-8e7b',
        (run - 1) * actionsPerRun + index + 1,
      );
      const path = `/requests/${id}`;
      const claim = await call(technician, `${path}/claim`, undefined, 'claim');
      const resolve = await call(
        technician,
        `${path}/resolve`,
        { note: 'Відновлено освітлення' },
        'resolve',
      );
      return { claim, resolve };
    });
    batches = {
      technicianQueue,
      residentQueue,
      claim: transitions.map((result) => result.claim),
      resolve: transitions.map((result) => result.resolve),
    };
  } finally {
    child.kill('SIGTERM');
    const [code] = await closed;
    assert.equal(code, 0, 'Benchmark API failed to shut down cleanly');
  }

  const queries = new Map();
  for (const record of records) {
    if (record.event !== 'db.query.finish' || !record.businessProcessId)
      continue;
    const list = queries.get(record.businessProcessId) ?? [];
    list.push({ operation: record.operation, ms: record.durationMs });
    queries.set(record.businessProcessId, list);
  }
  const raw = {};
  const scenarios = {};
  for (const [name, batch] of Object.entries(batches)) {
    const samples = batch.map(({ id, durationMs }) => {
      const sql = queries.get(id);
      assert.ok(sql?.length, `No SQL measurements for ${id}`);
      return {
        id,
        durationMs,
        sql,
        sqlMs: sql.reduce((total, query) => total + query.ms, 0),
      };
    });
    raw[name] = samples;
    scenarios[name] = {
      httpMs: distribution(samples.map((sample) => sample.durationMs)),
      sqlMs: distribution(samples.map((sample) => sample.sqlMs)),
      queriesPerRequest: [
        ...new Set(samples.map((sample) => sample.sql.length)),
      ],
    };
  }
  const processSample = records.find(
    (record) => record.event === 'bench.process',
  );
  assert.ok(processSample);
  await writeFile(
    resolve(artifactDir, `${mode}-run-${run}.json`),
    JSON.stringify(raw),
  );
  return {
    run,
    scenarios,
    process: processSample,
    ...(mode === 'profile' ? { profile: await profileSummary(name) } : {}),
  };
}

const url = process.env.DATABASE_URL;
const schema = createDatabase(url, () => {});
const database = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 3000,
});
await database.connect();
let fixture;
let plans;
try {
  await migrate(schema);
  fixture = await seed(database);
  plans = {};
  for (const [name, owner] of [
    ['technicianQueue', null],
    ['residentQueue', 'resident-1'],
  ]) {
    const { rows } = await database.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queueSql}`,
      [owner, 'open', 'plumbing', 20, 40],
    );
    [plans[name]] = rows[0]['QUERY PLAN'];
  }
} finally {
  await schema.close();
  await database.end();
}
const results = [];
for (let run = 1; run <= repetitions; run++) {
  results.push(await replicate(run));
}
console.log(
  JSON.stringify(
    {
      revision,
      mode,
      fixture,
      concurrency,
      warmupReads: 32,
      env: {
        node: process.version,
        os: platform(),
        release: release(),
        architecture: process.arch,
        cpu: cpus()[0].model,
        docker: execFileSync(
          'docker',
          ['version', '--format', '{{.Server.Version}}'],
          { encoding: 'utf8' },
        ).trim(),
      },
      plans,
      results,
    },
    null,
    2,
  ),
);
