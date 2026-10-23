/**
 * Comprehensive Staged Load-Testing Suite for School Portal
 * Tests concurrency at 50, 100, 250, 500, 1000, and 2000 Virtual Users.
 *
 * Usage:
 *   npx tsx tests/load/run-load-test.ts
 */

import http from 'http';
import https from 'https';

interface StageResult {
  vu: number;
  durationSec: number;
  totalRequests: number;
  rps: number;
  avgLatencyMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxLatencyMs: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
  timeouts: number;
  errorRatePercent: number;
}

const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = parseInt(process.env.TARGET_PORT || '3000', 10);
const PROTOCOL = process.env.TARGET_PROTOCOL === 'https' ? https : http;

const STAGES = [
  { vu: 50, durationSec: 5, label: 'Stage 1: 50 VUs (Baseline & Warmup)' },
  { vu: 100, durationSec: 5, label: 'Stage 2: 100 VUs' },
  { vu: 250, durationSec: 6, label: 'Stage 3: 250 VUs' },
  { vu: 500, durationSec: 6, label: 'Stage 4: 500 VUs' },
  { vu: 1000, durationSec: 7, label: 'Stage 5: 1,000 VUs' },
  { vu: 2000, durationSec: 8, label: 'Stage 6: 2,000 VUs (Target Stress Spike)' },
];

function sendRequest(path: string, method = 'GET', body?: string): Promise<{ status: number; durationMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = PROTOCOL.request({
      hostname: TARGET_HOST,
      port: TARGET_PORT,
      path,
      method,
      timeout: 6000,
      headers: {
        'Accept': 'application/json, text/html',
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, durationMs: Date.now() - start });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 504, durationMs: Date.now() - start });
    });

    req.on('error', () => {
      resolve({ status: 500, durationMs: Date.now() - start });
    });

    if (body) req.write(body);
    req.end();
  });
}

async function runStage(vu: number, durationSec: number): Promise<StageResult> {
  const endTime = Date.now() + durationSec * 1000;
  const latencies: number[] = [];
  let status2xx = 0;
  let status3xx = 0;
  let status4xx = 0;
  let status5xx = 0;
  let timeouts = 0;

  const paths = ['/', '/login', '/api/health', '/login/parent', '/login/teacher'];

  const worker = async (workerIndex: number) => {
    while (Date.now() < endTime) {
      const path = paths[workerIndex % paths.length];
      const res = await sendRequest(path);
      latencies.push(res.durationMs);

      if (res.status >= 200 && res.status < 300) status2xx++;
      else if (res.status >= 300 && res.status < 400) status3xx++;
      else if (res.status >= 400 && res.status < 500) status4xx++;
      else if (res.status === 504) timeouts++;
      else status5xx++;

      // Realistic user think time between actions (50ms to 120ms)
      await new Promise(r => setTimeout(r, Math.random() * 70 + 50));
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < vu; i++) {
    workers.push(worker(i));
  }

  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const totalRequests = latencies.length;
  const avgLatencyMs = totalRequests > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / totalRequests) : 0;
  const p50Ms = totalRequests > 0 ? latencies[Math.floor(totalRequests * 0.50)] : 0;
  const p95Ms = totalRequests > 0 ? latencies[Math.floor(totalRequests * 0.95)] : 0;
  const p99Ms = totalRequests > 0 ? latencies[Math.floor(totalRequests * 0.99)] : 0;
  const maxLatencyMs = totalRequests > 0 ? latencies[totalRequests - 1] : 0;
  const rps = durationSec > 0 ? Math.round(totalRequests / durationSec) : 0;
  const errorRatePercent = totalRequests > 0 ? Math.round(((status5xx + timeouts) / totalRequests) * 1000) / 10 : 0;

  return {
    vu,
    durationSec,
    totalRequests,
    rps,
    avgLatencyMs,
    p50Ms,
    p95Ms,
    p99Ms,
    maxLatencyMs,
    status2xx,
    status3xx,
    status4xx,
    status5xx,
    timeouts,
    errorRatePercent,
  };
}

async function main() {
  console.log('========================================================================');
  console.log('🚀 SCHOOL PORTAL CONCURRENT LOAD TEST (50 to 2,000 VIRTUAL USERS)');
  console.log(`Target: http://${TARGET_HOST}:${TARGET_PORT}`);
  console.log('========================================================================\n');

  // Verify server is online
  console.log('🔍 Checking target readiness before starting...');
  const probe = await sendRequest('/api/health');
  if (probe.status !== 200) {
    console.error(`❌ Health check returned status ${probe.status}. Ensure server is running on port ${TARGET_PORT}.`);
    process.exit(1);
  }
  console.log('✅ Target server is healthy! Beginning staged concurrency test...\n');

  const results: StageResult[] = [];

  for (const stage of STAGES) {
    console.log(`⏳ Executing ${stage.label}... (${stage.durationSec}s duration)`);
    const res = await runStage(stage.vu, stage.durationSec);
    results.push(res);
    console.log(`   Completed: ${res.totalRequests} reqs | RPS: ${res.rps} | Avg: ${res.avgLatencyMs}ms | p95: ${res.p95Ms}ms | Errors: ${res.errorRatePercent}%\n`);
    // Brief cool-down between stages
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n========================================================================');
  console.log('📊 FINAL CONCURRENCY BENCHMARK REPORT');
  console.log('========================================================================');
  console.table(results.map(r => ({
    'Virtual Users': r.vu,
    'Total Requests': r.totalRequests,
    'Req/Sec (RPS)': r.rps,
    'Avg Latency': `${r.avgLatencyMs}ms`,
    'p50': `${r.p50Ms}ms`,
    'p95': `${r.p95Ms}ms`,
    'p99': `${r.p99Ms}ms`,
    'Max': `${r.maxLatencyMs}ms`,
    '2xx': r.status2xx,
    '4xx': r.status4xx,
    '5xx/Timeouts': r.status5xx + r.timeouts,
    'Error Rate': `${r.errorRatePercent}%`
  })));

  console.log('✅ Load testing completed successfully.');
}

main().catch(console.error);
