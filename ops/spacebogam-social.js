'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const PROFILE = 'https://www.instagram.com/ggbg.official/';
const TTL = 15 * 60 * 1000;

async function instagramCredentials() {
  // Reuse the existing INTM integration; credentials never leave the server.
  const root = process.env.INTM_ROOT || path.join(__dirname, '../intm');
  const requireIntm = createRequire(path.join(root, 'package.json'));
  const { Pool } = requireIntm('pg');
  const dotenv = requireIntm('dotenv');
  const env = { ...process.env };
  for (const file of ['.env.local', '.env.production', '.env']) {
    try {
      const values = dotenv.parse(await fs.readFile(path.join(root, file)));
      for (const [key, value] of Object.entries(values)) if (env[key] === undefined) env[key] = value;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const pool = new Pool(env.DATABASE_URL ? { connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 }
    : { host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 5000 });
  try {
    const { rows } = await pool.query("SELECT access_token, platform_user_id FROM sns_tokens WHERE platform = $1 LIMIT 1", ['instagram']);
    if (!rows[0]?.access_token || !/^\d+$/.test(rows[0].platform_user_id)) throw new Error('Instagram is not connected');
    return { token: rows[0].access_token, id: rows[0].platform_user_id };
  } finally { await pool.end(); }
}

function mediaPost(post) {
  const image = post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url;
  try {
    const link = new URL(post.permalink);
    const thumbnail = new URL(image);
    if (link.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(link.hostname)
      || !/^\/(?:p|reel)\/[\w-]+\/?$/.test(link.pathname) || link.username || link.password || link.port
      || thumbnail.protocol !== 'https:' || thumbnail.username || thumbnail.password || thumbnail.port
      || !/(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/.test(thumbnail.hostname)) return null;
    return { id: String(post.id), caption: String(post.caption || '').slice(0, 400), image: thumbnail.href, url: link.href, date: post.timestamp || null };
  } catch { return null; }
}

function createSocialHandler({ credentials = instagramCredentials, request = fetch, now = Date.now } = {}) {
  let lastAttempt = -Infinity;
  let pending;
  let cached = { status: 'unavailable', profileUrl: PROFILE, posts: [], updatedAt: null };
  async function refresh() {
    lastAttempt = now();
    try {
      const { token, id } = await credentials();
      const headers = { Authorization: `Bearer ${token}` };
      const base = `https://graph.instagram.com/v23.0/${id}`;
      const identity = await request(base + '?fields=id,username', { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!identity.ok || (await identity.json()).username !== 'ggbg.official') throw new Error('Instagram account unavailable');
      const response = await request(base + '/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=9', { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok) throw new Error('Instagram media unavailable');
      const data = await response.json();
      if (!Array.isArray(data.data)) throw new Error('Invalid Instagram response');
      cached = { status: 'ready', profileUrl: PROFILE, posts: data.data.map(mediaPost).filter(Boolean).slice(0, 9), updatedAt: new Date(now()).toISOString() };
    } catch {
      cached = { ...cached, status: cached.updatedAt ? 'stale' : 'unavailable' };
    }
  }
  return async function handleSocial(req, res, pathname) {
    if (pathname !== '/api/social-feed') return false;
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return true;
    }
    if (!pending && now() - lastAttempt >= TTL) pending = refresh().finally(() => { pending = null; });
    if (pending) await pending;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ instagram: cached }));
    return true;
  };
}

module.exports = { createSocialHandler, mediaPost };
