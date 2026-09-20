const test = require('node:test');
const assert = require('node:assert');
const { BufferedThrottleQueue } = require('../src/queues/bufferedThrottleQueue');

test('BufferedThrottleQueue: enqueues and dequeues buffered webhook items', async () => {
  const queue = new BufferedThrottleQueue({ maxQueueSize: 50 });

  const enqRes = await queue.enqueue({
    sourceId: 'webhook_sender_1',
    endpoint: '/api/v1/webhooks/orders',
    body: { orderId: '12345', amount: 199 },
  });

  assert.strictEqual(enqRes.queued, true);
  assert.strictEqual(enqRes.queueDepth >= 1, true);

  const item = await queue.dequeue();
  assert.ok(item);
  assert.strictEqual(item.sourceId, 'webhook_sender_1');
  assert.strictEqual(item.body.orderId, '12345');
});
