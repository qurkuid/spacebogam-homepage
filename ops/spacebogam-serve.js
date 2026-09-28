'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { Transform } = require('node:stream');

const ROOT = path.resolve(process.env.ROOT || process.argv[2] || '/Volumes/DATABASE/spacebogam/current');
const PORT = Number(process.env.PORT || process.argv[3] || 3021);
// Allow multipart overhead around the form's 15 MiB file limit.
const MAX_UPLOAD = 16 * 1024 * 1024;
const MAX_PLAN_IMAGE = 15 * 1024 * 1024;
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
  '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

function reply(res, status, message) {
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });
  if (!res.writableEnded) res.end(JSON.stringify({ error: message }));
}

function proxy(req, res, pathname, upload) {
  if (upload) {
    if (req.headers['sec-fetch-site'] === 'cross-site') return reply(res, 403, 'Origin not allowed');
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host) return reply(res, 403, 'Origin not allowed');
      } catch { return reply(res, 403, 'Origin not allowed'); }
    }
    if (!/^multipart\/form-data\s*;\s*boundary=(?:"[^"\r\n]+"|[^\s;]+)(?:\s*;.*)?$/i.test(req.headers['content-type'] || '')) return reply(res, 415, 'Multipart upload required');
    if (Number(req.headers['content-length']) > MAX_UPLOAD) return reply(res, 413, 'Upload exceeds 16 MiB');
  }
  // Origins are deployment/test configuration, never supplied by an HTTP client.
  const origin = upload ? process.env.INTM_ORIGIN || 'https://intm.kr' : process.env.APT_ORIGIN || 'https://apt.intm.kr';
  const target = new URL(pathname, origin);
  if (!['https:', 'http:'].includes(target.protocol)) return reply(res, 502, 'Invalid upstream');
  const headers = { Accept: 'application/json' };
  if (upload) {
    headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['content-length']) headers['Content-Length'] = req.headers['content-length'];
  }
  const upstream = (target.protocol === 'https:' ? https : http).request(target, { method: req.method, headers }, incoming => {
    if (res.writableEnded) return incoming.destroy();
    if (incoming.statusCode >= 300 && incoming.statusCode < 400) {
      incoming.resume();
      return reply(res, 502, 'Unexpected upstream redirect');
    }
    res.writeHead(incoming.statusCode, { 'Content-Type': incoming.headers['content-type'] || 'application/json', 'Cache-Control': 'no-store' });
    incoming.on('error', () => res.destroy());
    incoming.pipe(res);
  });
  const timer = setTimeout(() => upstream.destroy(new Error('Upstream timeout')), upload ? 60000 : 8000);
  upstream.on('close', () => clearTimeout(timer));
  upstream.on('error', () => {
    if (res.headersSent) { if (!res.writableEnded) res.destroy(); }
    else reply(res, 502, 'Upstream unavailable');
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  if (!upload) return upstream.end();
  let bytes = 0;
  const limit = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(bytes > MAX_UPLOAD ? new Error('Upload exceeds 16 MiB') : null, chunk);
    },
  });
  limit.on('error', () => {
    req.unpipe(limit);
    upstream.destroy();
    reply(res, 413, 'Upload exceeds 16 MiB');
    req.resume();
  });
  req.on('error', () => limit.destroy());
  req.pipe(limit).pipe(upstream);
}

function allowedPlanImage(value) {
  if (!value || value.length > 700) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash) return null;
    const path = url.pathname;
    const valid = url.hostname === 'fphimage-cos.kujiale.com' && /^\/fph\/[\w/-]+\.(?:jpe?g|webp)$/i.test(path)
      || url.hostname === 'qhtbdoss.kujiale.com' && /^\/fpimgnew\/[\w/-]+\.jpe?g$/i.test(path)
      || url.hostname === 'otondo-cdn.s3.ap-northeast-2.amazonaws.com' && /^\/media\/apartments-plans\/[\w-]+\.webp$/i.test(path);
    return valid ? url : null;
  } catch { return null; }
}

function proxyPlanImage(req, res) {
  const url = allowedPlanImage(new URL(req.url, 'http://localhost').searchParams.get('url'));
  if (!url) return reply(res, 400, 'Plan image URL not allowed');
  const upstream = https.get(url, { headers: { Accept: 'image/jpeg,image/webp' } }, incoming => {
    const type = (incoming.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (incoming.statusCode !== 200 || !['image/jpeg', 'image/webp'].includes(type)) {
      incoming.resume();
      return reply(res, 502, 'Plan image unavailable');
    }
    if (Number(incoming.headers['content-length']) > MAX_PLAN_IMAGE) {
      incoming.resume();
      return reply(res, 502, 'Plan image too large');
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    let bytes = 0;
    incoming.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_PLAN_IMAGE) { incoming.destroy(); res.destroy(); }
      else res.write(chunk);
    });
    incoming.on('end', () => { if (!res.writableEnded) res.end(); });
    incoming.on('error', () => res.destroy());
  });
  upstream.setTimeout(12000, () => upstream.destroy(new Error('Plan image timeout')));
  upstream.on('error', () => { if (res.headersSent) res.destroy(); else reply(res, 502, 'Plan image unavailable'); });
  res.on('close', () => upstream.destroy());
}

http.createServer(async (req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(req.url.split('?')[0]); }
  catch { return reply(res, 400, 'Invalid path'); }
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) return reply(res, 403, 'Path not allowed');
  const plans = /^\/api\/apartments\/[A-Za-z0-9_-]{1,64}\/plans$/.test(pathname);
  const dataset = pathname === '/api/apartments/dataset';
  const upload = pathname === '/api/consultation/upload';
  if (pathname === '/api/consultation/plan-image') {
    if (req.method !== 'GET') return reply(res, 405, 'Method not allowed');
    return proxyPlanImage(req, res);
  }
  if (plans || dataset || upload) {
    if (req.method !== (upload ? 'POST' : 'GET')) return reply(res, 405, 'Method not allowed');
    return proxy(req, res, pathname, upload);
  }
  if (pathname.startsWith('/api/')) return reply(res, 404, 'API not found');
  if (!['GET', 'HEAD'].includes(req.method)) return reply(res, 405, 'Method not allowed');
  try {
    const root = await fs.promises.realpath(ROOT);
    let filename = path.resolve(root, '.' + pathname);
    if ((await fs.promises.stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    filename = await fs.promises.realpath(filename);
    if (!filename.startsWith(root + path.sep)) return reply(res, 403, 'Path not allowed');
    const stat = await fs.promises.stat(filename);
    if (!stat.isFile()) return reply(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    const file = fs.createReadStream(filename);
    file.on('error', () => res.destroy());
    res.on('close', () => file.destroy());
    file.pipe(res);
  } catch { reply(res, 404, 'Not found'); }
}).listen(PORT, () => console.log(`Spacebogam listening on ${PORT}; root ${ROOT}`));
