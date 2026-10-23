import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics
export const errorRate = new Rate('custom_error_rate');
export const loginLatency = new Trend('login_latency_ms');
export const healthLatency = new Trend('health_latency_ms');

// Configurable Test Stages: 50 -> 100 -> 250 -> 500 -> 1000 -> 2000 Virtual Users
export const options = {
  stages: [
    { duration: '30s', target: 50 },    // Stage 1: 50 VUs (Warmup & Baseline)
    { duration: '45s', target: 100 },   // Stage 2: 100 VUs
    { duration: '1m',  target: 250 },   // Stage 3: 250 VUs
    { duration: '1m',  target: 500 },   // Stage 4: 500 VUs (Moderate Load)
    { duration: '1m',  target: 1000 },  // Stage 5: 1,000 VUs (Peak Morning Traffic)
    { duration: '1m',  target: 2000 },  // Stage 6: 2,000 VUs (Target Stress Spike)
    { duration: '30s', target: 0 },     // Ramp-down
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],          // Less than 1% errors
    http_req_duration: ['p(95)<1000'],       // 95% of requests under 1s
    custom_error_rate: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  // 1. Health check & DB readiness probe
  group('Health Check Probe', function () {
    const res = http.get(`${BASE_URL}/api/health`, {
      headers: { 'Accept': 'application/json' },
      timeout: '5s'
    });
    
    healthLatency.add(res.timings.duration);
    const passed = check(res, {
      'health status is 200': (r) => r.status === 200,
      'db status is connected': (r) => {
        try { return JSON.parse(r.body).database.status === 'connected'; } catch (_) { return false; }
      },
    });
    errorRate.add(!passed);
  });

  sleep(Math.random() * 0.5 + 0.5); // Realistic user pause (500ms - 1s)

  // 2. Landing / Portal Homepage
  group('Portal Homepage', function () {
    const res = http.get(`${BASE_URL}/`, {
      headers: { 'Accept': 'text/html' },
      timeout: '5s'
    });
    const passed = check(res, {
      'homepage status is 200': (r) => r.status === 200,
    });
    errorRate.add(!passed);
  });

  sleep(Math.random() * 0.5 + 0.5);

  // 3. Synthetic Auth Check (Simulated Login with Rate Limit adherence)
  group('Authentication Flow', function () {
    const payload = JSON.stringify({
      email: `synthetic_user_${__VU}@schoolportal.test`,
      password: 'SyntheticTestPassword123!',
      expectedRole: 'PARENT',
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `192.168.1.${(__VU % 250) + 1}`,
      },
      timeout: '5s'
    };

    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/auth/callback/credentials`, payload, params);
    loginLatency.add(Date.now() - start);

    // Expecting 200, 302, 401, or 429 (rate limited) without crashing (no 500s or timeouts)
    const passed = check(res, {
      'auth response status is not 5xx': (r) => r.status < 500,
    });
    errorRate.add(!passed);
  });

  sleep(Math.random() * 1.5 + 0.5);
}
