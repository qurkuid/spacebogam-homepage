'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const PROFILE = 'https://www.instagram.com/ggbg.official/';
const TTL = 15 * 60 * 1000;
const MAX_STALE = 60 * 60 * 1000;

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

function createInstagramFeed({ credentials, request = fetch, now = Date.now, initial } = {}) {
  let lastAttempt = -Infinity;
  let pending;
  let cached = initial || { status: 'unavailable', profileUrl: PROFILE, posts: [], updatedAt: null };
  async function refresh() {
    lastAttempt = now();
    try {
      const { token, id } = await credentials();
      const headers = { Authorization: `Bearer ${token}` };
      const base = `https://graph.instagram.com/v23.0/${id}`;
      const identity = await request(base + '?fields=id,username', { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!identity.ok) throw Object.assign(new Error('Instagram account unavailable'), { code: identity.status === 401 ? 'AUTH_REQUIRED' : 'UPSTREAM_UNAVAILABLE' });
      if ((await identity.json()).username !== 'ggbg.official') throw Object.assign(new Error('Instagram account mismatch'), { code: 'ACCOUNT_MISMATCH' });
      const response = await request(base + '/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=9', { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok) throw new Error('Instagram media unavailable');
      const data = await response.json();
      if (!Array.isArray(data.data)) throw new Error('Invalid Instagram response');
      cached = { status: 'ready', profileUrl: PROFILE, posts: data.data.map(mediaPost).filter(Boolean).slice(0, 9), updatedAt: new Date(now()).toISOString() };
    } catch (error) {
      const keep = cached.updatedAt && now() - Date.parse(cached.updatedAt) <= MAX_STALE;
      cached = { ...cached, posts: keep ? cached.posts : [], status: keep ? 'stale' : 'unavailable', errorCode: ['AUTH_REQUIRED', 'ACCOUNT_MISMATCH'].includes(error.code) ? error.code : 'UPSTREAM_UNAVAILABLE' };
    }
  }
  return async function getFeed() {
    if (!pending && now() - lastAttempt >= TTL) pending = refresh().finally(() => { pending = null; });
    if (pending) await pending;
    return cached;
  };
}

function createSocialHandler({ feedFile = process.env.INSTAGRAM_FEED_FILE || path.join(__dirname, 'private/instagram-feed.json'), readFeed = () => fs.readFile(feedFile, 'utf8').then(JSON.parse), now = Date.now } = {}) {
  return async function handleSocial(req, res, pathname) {
    if (pathname !== '/api/social-feed') return false;
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return true;
    }
    let instagram = { status: 'unavailable', profileUrl: PROFILE, posts: [], updatedAt: null };
    try {
      const data = await readFeed();
      const age = now() - Date.parse(data.updatedAt);
      if (Number.isFinite(age) && age >= 0 && age <= MAX_STALE && ['ready', 'stale'].includes(data.status)) {
        instagram = { status: age > TTL ? 'stale' : data.status, profileUrl: PROFILE, updatedAt: data.updatedAt,
          posts: data.posts.slice(0, 9).map(post => mediaPost({ id: post.id, caption: post.caption, media_type: 'IMAGE', media_url: post.image, permalink: post.url, timestamp: post.date })).filter(Boolean) };
      } else if (data.errorCode === 'AUTH_REQUIRED') instagram.errorCode = 'AUTH_REQUIRED';
    } catch { /* Keep the public fallback when the private cache is unavailable. */ }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ instagram }));
    return true;
  };
}

module.exports = { createSocialHandler, createInstagramFeed, mediaPost };
