const test = require('node:test');
const assert = require('node:assert/strict');
const { createSocialHandler, createInstagramFeed, mediaPost } = require('../ops/spacebogam-social');

const post = { id: '1', caption: '<script>untrusted</script>', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/photo.jpg', permalink: 'https://www.instagram.com/p/Example_1/', timestamp: '2026-11-04T00:00:00Z' };
async function read(handler, method = 'GET') {
  const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
  assert.equal(await handler({ method }, res, '/api/social-feed'), true);
  return { ...res, json: res.body ? JSON.parse(res.body) : null };
}

test('API returns only public fields, shares concurrent refreshes and caches for 15 minutes', async () => {
  let calls = 0;
  const feed = createInstagramFeed({ credentials: async () => ({ id: '123', token: 'private-secret' }), request: async (url, options) => {
    calls++; assert.equal(options.headers.Authorization, 'Bearer private-secret');
    return { ok: true, json: async () => url.includes('/media?') ? { data: [post] } : { username: 'ggbg.official' } };
  } });
  const handler = createSocialHandler({ readFeed: feed });
  const responses = await Promise.all([read(handler), read(handler), read(handler)]);
  assert.equal(calls, 2);
  assert.equal(responses[0].json.instagram.status, 'ready');
  assert.equal(responses[0].json.instagram.posts[0].url, post.permalink);
  assert(!responses[0].body.includes('private-secret'));
  assert(!responses[0].body.includes('access_token'));
  assert.equal((await read(handler, 'HEAD')).body, undefined);
  assert.equal((await read(handler, 'POST')).status, 405);
  assert.equal(calls, 2);
});

test('invalid token and wrong account fail closed without leaking error details', async () => {
  for (const identity of [{ ok: false }, { ok: true, json: async () => ({ username: 'other-account' }) }]) {
    const feed = createInstagramFeed({ credentials: async () => ({ id: '123', token: 'secret' }), request: async () => identity });
    const handler = createSocialHandler({ readFeed: feed });
    const res = await read(handler);
    assert.equal(res.json.instagram.status, 'unavailable');
    assert.deepEqual(res.json.instagram.posts, []);
    assert(!res.body.includes('secret'));
  }
});

test('refresh failure retains last successful public feed and marks it stale', async () => {
  let clock = 0, fail = false;
  const feed = createInstagramFeed({ now: () => clock, credentials: async () => ({ id: '123', token: 'secret' }), request: async url => {
    if (fail) throw new Error('Token secret');
    return { ok: true, json: async () => url.includes('/media?') ? { data: [post] } : { username: 'ggbg.official' } };
  } });
  const handler = createSocialHandler({ readFeed: feed, now: () => clock });
  assert.equal((await read(handler)).json.instagram.status, 'ready');
  fail = true; clock += 15 * 60 * 1000;
  const res = await read(handler);
  assert.equal(res.json.instagram.status, 'stale');
  assert.equal(res.json.instagram.posts.length, 1);
  assert(!res.body.includes('secret'));
  clock += 60 * 60 * 1000;
  assert.equal((await read(handler)).json.instagram.posts.length, 0);
});

test('validates public links and selects video thumbnails', () => {
  assert.equal(mediaPost({ ...post, permalink: 'javascript:alert(1)' }), null);
  assert.equal(mediaPost({ ...post, media_url: 'https://evil.example/image.jpg' }), null);
  assert.equal(mediaPost({ ...post, media_type: 'VIDEO' }), null);
  assert.equal(mediaPost({ ...post, media_type: 'VIDEO', thumbnail_url: post.media_url }).image, post.media_url);
});
