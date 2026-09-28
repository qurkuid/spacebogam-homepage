'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { test } = require('node:test');

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
function request(port, pathname, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, ...options }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('production static server and bounded allowlisted proxies', { timeout: 20000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacebogam-proxy-'));
  const release = path.join(dir, 'release-1');
  const root = path.join(dir, 'current');
  fs.mkdirSync(release);
  fs.symlinkSync(release, root);
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>Spacebogam</h1>');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'SECRET');
  fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(root, 'outside.txt'));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'nested/index.html'), 'Nested');
  const calls = [];
  let signalChunk;
  let firstChunk;
  const upstream = http.createServer((req, res) => {
    const call = { url: req.url, method: req.method, headers: req.headers, bytes: 0, chunks: [] };
    calls.push(call);
    req.on('data', chunk => { call.bytes += chunk.length; call.chunks.push(chunk); signalChunk?.(); });
    req.on('end', () => {
      call.body = Buffer.concat(call.chunks).toString();
      res.writeHead(req.url.includes('/redirect/') ? 302 : 200, { 'Content-Type': 'application/json', 'Set-Cookie': 'secret=1', Location: 'https://example.com' });
      res.end(JSON.stringify({ ok: true, path: req.url, bytes: call.bytes }));
    });
  });
  const upstreamPort = await listen(upstream);
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, [path.resolve('ops/spacebogam-serve.js'), root, String(port)], {
    env: { ...process.env, ROOT: root, PORT: String(port), APT_ORIGIN: `http://127.0.0.1:${upstreamPort}`, INTM_ORIGIN: `http://127.0.0.1:${upstreamPort}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  t.after(async () => {
    child.kill();
    await once(child, 'exit');
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(stderr, '', 'server must emit no runtime errors');
  });
  await once(child.stdout, 'data');

  await t.test('static GET, HEAD, directory index, missing file and traversal', async () => {
    const home = await request(port, '/');
    assert.equal(home.status, 200);
    assert.equal(home.body, '<h1>Spacebogam</h1>');
    assert.match(home.headers['content-type'], /text\/html/);
    const head = await request(port, '/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.equal(head.headers['content-length'], String(Buffer.byteLength(home.body)));
    assert.equal((await request(port, '/nested/')).body, 'Nested');
    assert.equal((await request(port, '/missing')).status, 404);
    for (const url of ['/../secret.txt', '/%2e%2e/secret.txt', '/%2e%2e%2fsecret.txt', '/outside.txt', '/.git/config', '/%00', '/..%5csecret.txt']) {
      const result = await request(port, url);
      assert.equal(result.status, 403, url);
      assert.ok(!result.body.includes('SECRET'), url);
    }
    assert.equal((await request(port, '/%zz')).status, 400);
  });
  await t.test('atomic current symlink switch serves new release without restart', async () => {
    const nextRelease = path.join(dir, 'release-2');
    fs.mkdirSync(nextRelease);
    fs.writeFileSync(path.join(nextRelease, 'index.html'), '<h1>New release</h1>');
    fs.symlinkSync(path.join(release, 'index.html'), path.join(nextRelease, 'old-release.txt'));
    fs.symlinkSync(nextRelease, path.join(dir, 'current.next'));
    fs.renameSync(path.join(dir, 'current.next'), root);
    const current = await request(port, '/');
    assert.equal(current.status, 200);
    assert.equal(current.body, '<h1>New release</h1>');
    assert.equal(child.exitCode, null, 'the original server process is still running');
    assert.equal((await request(port, '/old-release.txt')).status, 403, 'file authorization uses the new release root');
  });
  await t.test('plans allowlist strips query and credentials, preserves JSON, rejects redirect', async () => {
    const result = await request(port, '/api/apartments/apt_123/plans?url=https://example.com', { headers: { Cookie: 'secret=1', Authorization: 'Bearer secret' } });
    assert.equal(result.status, 200);
    assert.equal(JSON.parse(result.body).path, '/api/apartments/apt_123/plans');
    assert.equal(calls.at(-1).headers.cookie, undefined);
    assert.equal(calls.at(-1).headers.authorization, undefined);
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(result.headers['cache-control'], 'no-store');
    const dataset = await request(port, '/api/apartments/dataset?url=https://example.com', { headers: { Cookie: 'secret=1' } });
    assert.equal(dataset.status, 200);
    assert.equal(JSON.parse(dataset.body).path, '/api/apartments/dataset');
    assert.equal(calls.at(-1).headers.cookie, undefined);
    assert.equal((await request(port, '/api/apartments/redirect/plans')).status, 502);
    const before = calls.length;
    assert.equal((await request(port, '/api/apartments/a/plans', { method: 'POST' })).status, 405);
    assert.equal((await request(port, '/api/arbitrary')).status, 404);
    assert.equal((await request(port, '/api/consultation/upload', { method: 'GET' })).status, 405);
    assert.equal((await request(port, '/api/consultation/plan-image?url=' + encodeURIComponent('https://evil.example/plan.jpg'))).status, 400);
    assert.equal((await request(port, '/api/consultation/plan-image?url=' + encodeURIComponent('http://fphimage-cos.kujiale.com/fph/plan.jpg'))).status, 400);
    assert.equal((await request(port, '/api/consultation/plan-image?url=' + encodeURIComponent('https://fphimage-cos.kujiale.com/fph/../secret.jpg'))).status, 400);
    assert.equal((await request(port, '/api/consultation/plan-image', { method: 'POST' })).status, 405);
    assert.equal(calls.length, before);
  });
  const headers = { 'Content-Type': 'multipart/form-data; boundary=test-boundary', Origin: `http://127.0.0.1:${port}` };
  await t.test('multipart bytes stream upstream before request completes', async () => {
    firstChunk = new Promise(resolve => { signalChunk = resolve; });
    const body = '--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="plan.png"\r\nContent-Type: image/png\r\n\r\nPNG-test\r\n--test-boundary--\r\n';
    let req;
    const completed = new Promise((resolve, reject) => {
      req = http.request({ hostname: '127.0.0.1', port, path: '/api/consultation/upload', method: 'POST', headers }, res => {
        let output = '';
        res.on('data', chunk => { output += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, output }));
      });
      req.on('error', reject);
    });
    req.write(body.slice(0, 80));
    await firstChunk;
    assert.equal(calls.at(-1).bytes, 80, 'upstream sees bytes while browser request is still open');
    req.end(body.slice(80));
    const result = await completed;
    signalChunk = null;
    assert.equal(result.status, 200);
    assert.equal(calls.at(-1).body, body);
    assert.equal(calls.at(-1).headers['content-type'], headers['Content-Type']);
    assert.equal(JSON.parse(result.output).bytes, Buffer.byteLength(body));
  });
  await t.test('cross-origin and non-multipart uploads never reach upstream', async () => {
    const before = calls.length;
    assert.equal((await request(port, '/api/consultation/upload', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' } }, 'x')).status, 403);
    assert.equal((await request(port, '/api/consultation/upload', { method: 'POST', headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' } }, 'x')).status, 403);
    assert.equal((await request(port, '/api/consultation/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, '{}')).status, 415);
    assert.equal(calls.length, before);
  });
  await t.test('15 MiB file fits; 16 MiB request bound rejects declared and chunked overflow', async () => {
    const max = 16 * 1024 * 1024;
    const before = calls.length;
    const declared = await request(port, '/api/consultation/upload', { method: 'POST', headers: { ...headers, 'Content-Length': max + 1 } });
    assert.equal(declared.status, 413);
    assert.equal(calls.length, before, 'declared overflow must not contact upstream');
    const fileBody = Buffer.concat([Buffer.from('--test-boundary\r\nContent-Disposition: form-data; name="file"; filename="plan.png"\r\nContent-Type: image/png\r\n\r\n'), Buffer.alloc(15 * 1024 * 1024, 'a'), Buffer.from('\r\n--test-boundary--\r\n')]);
    const file = await request(port, '/api/consultation/upload', { method: 'POST', headers }, fileBody);
    assert.equal(file.status, 200);
    assert.equal(JSON.parse(file.body).bytes, fileBody.length);
    const exact = await request(port, '/api/consultation/upload', { method: 'POST', headers }, Buffer.alloc(max, 'a'));
    assert.equal(exact.status, 200);
    assert.equal(JSON.parse(exact.body).bytes, max);
    const chunked = await request(port, '/api/consultation/upload', { method: 'POST', headers: { ...headers, 'Transfer-Encoding': 'chunked' } }, Buffer.alloc(max + 1, 'a'));
    assert.equal(chunked.status, 413);
    assert.ok(calls.at(-1).bytes <= max);
    assert.equal((await request(port, '/')).status, 200);
  });
  await t.test('unavailable upstream returns 502 and leaves static service healthy', async () => {
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    assert.equal((await request(port, '/api/apartments/a/plans')).status, 502);
    assert.equal((await request(port, '/')).status, 200);
  });
});
