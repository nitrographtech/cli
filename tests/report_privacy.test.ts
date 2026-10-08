import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactReport } from '../src/report-privacy.js';
import { Nitrograph } from '../src/harness.js';

test('report scrubber removes credentials and sensitive payload fields without changing caller input', () => {
  const original = { success: true, steps: [{ email: 'person@example.com', health: 'private', body: { chat: 'private' }, endpoint: '/user/123', count: 5 }], task: 'Bearer my-secret' };
  const clean = JSON.stringify(redactReport(original));
  assert.doesNotMatch(clean, /person@example|my-secret|private|user\/123/);
  assert.match(clean, /"count":5/);
  assert.equal(original.steps[0].email, 'person@example.com');
});

test('both harness report methods scrub before sending, invocation is not altered', async () => {
  const bodies: any[] = [];
  const ng = new Nitrograph({ fetch: (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch });
  await ng.reportOutcome({ slug: 'test', success: false, diagnosis: 'Bearer my-secret' });
  await ng.reportPattern({ slug: 'test', success: true, task: 'test', steps: [{ api_key: 'my-secret', email: 'person@example.com' }] });
  assert.doesNotMatch(JSON.stringify(bodies), /my-secret|person@example/);
});
