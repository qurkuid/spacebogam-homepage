'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const PAGE_SIZE = 6;
const MAX_BODY = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLEAN_TEXT = /^[^<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u;
const SPACES = new Set(['apartment', 'house', 'commercial']);
const SORTS = new Set(['newest', 'highest', 'lowest']);
const CONSENT_VERSION = 'reviews-2026-11-04';

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function defaultFile(root) {
  return path.resolve(path.dirname(path.resolve(root)), 'private', 'reviews.json');
}

function canonicalInstant(value) {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function storedText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function validStoredReview(review, now) {
  if (!review || typeof review !== 'object' || Array.isArray(review) || !UUID.test(review.id || '')) return false;
  if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) return false;
  if (!storedText(review.title, 5, 100) || !storedText(review.body, 20, 3000) || !storedText(review.nickname, 2, 20)) return false;
  if (!SPACES.has(review.space) || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(review.experienceMonth || '') || review.experienceMonth < '1900-01' || review.experienceMonth > koreaMonth(now)) return false;
  if (!['pending', 'approved', 'rejected'].includes(review.status)) return false;
  if (!canonicalInstant(review.createdAt) || !canonicalInstant(review.consentedAt) || !/^reviews-\d{4}-\d{2}-\d{2}$/.test(review.consentVersion || '')) return false;
  if (!UUID.test(review.idempotencyKey || '') || !/^[0-9a-f]{64}$/.test(review.fingerprint || '')) return false;
  if (review.status === 'approved') return validText(review.customerId, 1, 100) && !/\s/.test(review.customerId) && canonicalInstant(review.publishedAt);
  return review.customerId === undefined && review.publishedAt === undefined;
}

function validStore(value) {
  if (value?.version !== 1 || !Array.isArray(value.reviews)) return false;
  const ids = new Set();
  const keys = new Set();
  for (const review of value.reviews) {
    if (!validStoredReview(review, new Date()) || ids.has(review.id) || keys.has(review.idempotencyKey)) return false;
    ids.add(review.id);
    keys.add(review.idempotencyKey);
  }
  return true;
}

function privateFile(root, file) {
  const publicRoot = path.resolve(root);
  const store = path.resolve(file);
  let realRoot = publicRoot;
  try { realRoot = fs.realpathSync(publicRoot); } catch { /* validated again when the root exists */ }
  let existing = store;
  const suffix = [];
  while (!fs.existsSync(existing) && existing !== path.dirname(existing)) { suffix.unshift(path.basename(existing)); existing = path.dirname(existing); }
  let realStore = store;
  try { realStore = path.join(fs.realpathSync(existing), ...suffix); } catch { /* lexical validation still applies */ }
  if ([publicRoot, realRoot].some(candidate => store === candidate || store.startsWith(candidate + path.sep) || realStore === candidate || realStore.startsWith(candidate + path.sep))) {
    throw Object.assign(new Error('Reviews file must be outside public root'), { code: 'REVIEWS_PUBLIC_STORE' });
  }
  return store;
}

function readStore(file) {
  // shortcut: the JSON store is read whole for a modest review board, migrate to a database when records make this operationally slow.
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!validStore(value)) throw new Error('Invalid reviews store');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, reviews: [] };
    throw Object.assign(new Error('Reviews store unavailable'), { code: 'REVIEWS_STORE_INVALID', cause: error });
  }
}

function updateStore(file, update) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const lock = file + '.lock';
  let lockFd;
  try { lockFd = fs.openSync(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw Object.assign(new Error('Reviews store busy'), { code: 'REVIEWS_STORE_BUSY' });
    throw error;
  }
  let temporary;
  try {
    const store = readStore(file);
    const result = update(store);
    temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(store, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    temporary = undefined;
    const directory = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    return result;
  } finally {
    if (temporary) try { fs.unlinkSync(temporary); } catch { /* best effort */ }
    if (lockFd !== undefined) fs.closeSync(lockFd);
    try { fs.unlinkSync(lock); } catch { /* preserve original error */ }
  }
}

function validText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && CLEAN_TEXT.test(value);
}

function koreaMonth(now) {
  const korea = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${korea.getUTCFullYear()}-${String(korea.getUTCMonth() + 1).padStart(2, '0')}`;
}

function validate(value, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '요청 내용을 확인해 주세요.';
  if (!Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5) return '평점은 1점부터 5점까지 선택해 주세요.';
  if (!validText(value.title, 5, 100)) return '후기 제목은 5자 이상 100자 이하로 적어 주세요.';
  if (!validText(value.body, 20, 3000)) return '후기 내용은 20자 이상 3000자 이하로 적어 주세요.';
  if (!validText(value.nickname, 2, 20)) return '별명은 2자 이상 20자 이하로 적어 주세요.';
  if (!SPACES.has(value.space)) return '공간 유형을 선택해 주세요.';
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.experienceMonth || '') || value.experienceMonth < '1900-01' || value.experienceMonth > koreaMonth(now)) return '공사 경험 시점을 확인해 주세요.';
  if (value.consent !== true) return '후기 공개 동의가 필요합니다.';
  if (value.consentVersion !== CONSENT_VERSION) return '후기 공개 동의 내용을 다시 확인해 주세요.';
  if (value.website !== undefined && value.website !== '') return '요청을 처리할 수 없습니다.';
  return null;
}

function approved(store) {
  return store.reviews.filter(review => review.status === 'approved' && review.publishedAt && review.customerId);
}

function publicReview(review) {
  return Object.fromEntries(['id', 'rating', 'title', 'body', 'nickname', 'space', 'experienceMonth', 'publishedAt', 'images', 'sourceLabel', 'editedByOperator'].filter(key => review[key] !== undefined).map(key => [key, review[key]]));
}

function validPublicStore(store) {
  if (store?.version !== 2 || !Array.isArray(store.reviews)) return false;
  const ids = new Set();
  return store.reviews.every(review => {
    if (!review || !UUID.test(review.id || '') || ids.has(review.id)) return false;
    ids.add(review.id);
    if (review.kind !== 'customer_review' || review.status !== 'approved' || !canonicalInstant(review.publishedAt) || !validText(review.customerId, 1, 100)) return false;
    if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) return false;
    if (!validText(review.title, 5, 100) || !validText(review.body, 20, 3000) || !validText(review.nickname, 2, 20) || !SPACES.has(review.space)) return false;
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(review.experienceMonth || '') || review.experienceMonth < '1900-01' || review.experienceMonth > koreaMonth(new Date())) return false;
    if (!storedText(review.sourceLabel, 1, 100) || typeof review.editedByOperator !== 'boolean' || !Array.isArray(review.images) || review.images.length > 4) return false;
    return review.images.every(image => {
      try { return new URL(image.url).origin === 'https://intm.kr' && storedText(image.alt, 1, 200); } catch { return false; }
    });
  });
}

async function intmRequest(origin, method = 'GET', payload, key, token) {
  if (method === 'POST' && !token) throw new Error('INTM submission credential unavailable');
  const response = await fetch(new URL('/api/public/spacebogam/reviews', origin), {
    method, redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json', Origin: 'https://spacebogam.kr', 'Idempotency-Key': key, Authorization: `Bearer ${token}` } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error('INTM response exceeds limit');
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!response.ok && ![400, 403, 409, 413, 415, 429].includes(response.status)) throw new Error('INTM reviews unavailable');
  return { status: response.status, body };
}

function imagesHtml(review, preview = false) {
  const images = preview ? (review.images || []).slice(0, 1) : (review.images || []);
  if (!images.length) return '';
  return `<div class="rv-images${preview ? ' rv-images-preview' : ''}">${images.map(image => `<a href="${escapeHtml(image.url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" loading="lazy" decoding="async" width="960" height="720"></a>`).join('')}</div>`;
}

function statistics(reviews) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const customers = new Set();
  let totalRating = 0;
  for (const review of reviews) { distribution[review.rating]++; totalRating += review.rating; customers.add(review.customerId); }
  return { reviewCount: reviews.length, customerCount: customers.size, totalRating, averageRating: reviews.length ? Number((totalRating / reviews.length).toFixed(1)) : null, distribution };
}

function filtersFrom(url) {
  const q = (url.searchParams.get('q') || '').trim();
  const rating = url.searchParams.get('rating') || '';
  const space = url.searchParams.get('space') || '';
  const sort = url.searchParams.get('sort') || 'newest';
  const page = url.searchParams.get('page') || '1';
  if (q.length > 100) return { error: '검색어는 100자 이하로 입력해 주세요.' };
  if (rating && !/^[1-5]$/.test(rating)) return { error: '평점 필터를 확인해 주세요.' };
  if (space && !SPACES.has(space)) return { error: '공간 유형 필터를 확인해 주세요.' };
  if (!SORTS.has(sort)) return { error: '정렬 기준을 확인해 주세요.' };
  if (!/^[1-9]\d{0,5}$/.test(page)) return { error: '페이지를 확인해 주세요.' };
  return { q, rating: rating ? Number(rating) : null, space: space || null, sort, page: Number(page) };
}

function results(store, filters) {
  const all = approved(store);
  const needle = filters.q.toLocaleLowerCase('ko-KR');
  const matches = all.filter(review => (!filters.rating || review.rating === filters.rating)
    && (!filters.space || review.space === filters.space)
    && (!needle || `${review.title} ${review.body} ${review.nickname}`.toLocaleLowerCase('ko-KR').includes(needle)));
  matches.sort((a, b) => filters.sort === 'highest' ? b.rating - a.rating || b.publishedAt.localeCompare(a.publishedAt)
    : filters.sort === 'lowest' ? a.rating - b.rating || b.publishedAt.localeCompare(a.publishedAt)
      : b.publishedAt.localeCompare(a.publishedAt));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const offset = (page - 1) * PAGE_SIZE;
  return {
    reviews: matches.slice(offset, offset + PAGE_SIZE).map(publicReview),
    stats: statistics(all),
    pagination: { page, pages, total: matches.length },
    filters: { q: filters.q, rating: filters.rating, space: filters.space, sort: filters.sort },
  };
}

function stars(rating) {
  return `<span class="rv-stars" aria-label="5점 만점에 ${rating}점">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>`;
}

function spaceName(space) {
  return { apartment: '아파트', house: '주택', commercial: '상업 공간' }[space];
}

function option(value, label, selected) {
  return `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`;
}

function pageQuery(filters, page) {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.rating) params.set('rating', String(filters.rating));
  if (filters.space) params.set('space', filters.space);
  if (filters.sort !== 'newest') params.set('sort', filters.sort);
  if (page > 1) params.set('page', String(page));
  return params.size ? `?${escapeHtml(params.toString())}` : '';
}

function listHtml(result) {
  const { stats, reviews, pagination, filters } = result;
  const cardHtml = reviews.map(review => `<article class="rv-card">
  <p class="rv-meta">${stars(review.rating)} · ${escapeHtml(spaceName(review.space))} · ${escapeHtml(review.experienceMonth)}</p>
  <h2><a href="/reviews/${review.id}/">${escapeHtml(review.title)}</a></h2>
  ${imagesHtml(review, true)}
  <p>${escapeHtml(review.body)}</p>
  <p class="rv-meta">${escapeHtml(review.nickname)} · ${escapeHtml(review.publishedAt.slice(0, 10))}${review.sourceLabel ? ` · ${escapeHtml(review.sourceLabel)}` : ''}</p>
</article>`).join('\n');
  const hasFilters = Boolean(filters.q || filters.rating || filters.space || filters.sort !== 'newest');
  const cards = cardHtml || (stats.reviewCount === 0 && !hasFilters
    ? '<div class="rv-empty"><h2>첫 이야기를 기다리고 있습니다.</h2><p>공간보감과 함께한 경험을 남겨주세요. 확인을 마친 후 이곳에 공개됩니다.</p><a href="#write-review">후기 남기기</a></div>'
    : '<div class="rv-empty"><h2>조건에 맞는 후기가 없습니다.</h2><p>검색어나 조건을 바꿔 다시 살펴보세요.</p><a href="/reviews/">전체 후기 보기</a></div>');
  let pages = '';
  if (pagination.pages > 1) {
    const first = Math.max(1, pagination.page - 2);
    const last = Math.min(pagination.pages, pagination.page + 2);
    const links = [];
    if (pagination.page > 1) links.push(`<a href="/reviews/${pageQuery(filters, pagination.page - 1)}">이전</a>`);
    for (let page = first; page <= last; page++) links.push(`<a href="/reviews/${pageQuery(filters, page)}"${page === pagination.page ? ' aria-current="page"' : ''}>${page}</a>`);
    if (pagination.page < pagination.pages) links.push(`<a href="/reviews/${pageQuery(filters, pagination.page + 1)}">다음</a>`);
    pages = `<nav class="rv-pagination" aria-label="후기 페이지">${links.join(' ')}</nav>`;
  }
  return `<section class="rv-summary" aria-labelledby="review-stats-title">
  <h2 id="review-stats-title" class="rv-sr-only">후기 통계</h2>
  <div class="rv-stat"><span>후기 남긴 고객</span><strong>${stats.customerCount}</strong></div>
  <div class="rv-stat"><span>등록된 후기</span><strong>${stats.reviewCount}</strong></div>
  <div class="rv-stat"><span>평균 평점 / 5</span><strong>${stats.averageRating === null ? '—' : stats.averageRating}</strong></div>
  <div class="rv-stat"><span>누적 별점</span><strong>${stats.totalRating} / ${stats.reviewCount * 5}</strong></div>
</section><p class="rv-summary-note">공개된 후기 기준 · 전체 시공 고객 수가 아닙니다.</p>
<ol class="rv-distribution" aria-label="평점별 후기 수">${[5, 4, 3, 2, 1].map(rating => `<li><span>${rating}점</span><progress max="${Math.max(1, stats.reviewCount)}" value="${stats.distribution[rating]}">${stats.distribution[rating]}</progress><strong>${stats.distribution[rating]}</strong></li>`).join('')}</ol>
<form class="rv-tools" action="/reviews/" method="get">
  <label>후기 검색<input type="search" name="q" maxlength="100" value="${escapeHtml(filters.q)}"></label>
  <label>평점<select name="rating">${option('', '전체', filters.rating ? String(filters.rating) : '')}${[5, 4, 3, 2, 1].map(value => option(String(value), `${value}점`, String(filters.rating || ''))).join('')}</select></label>
  <label>공간<select name="space">${option('', '전체', filters.space || '')}${option('apartment', '아파트', filters.space)}${option('house', '주택', filters.space)}${option('commercial', '상업 공간', filters.space)}</select></label>
  <label>정렬<select name="sort">${option('newest', '최신순', filters.sort)}${option('highest', '평점 높은 순', filters.sort)}${option('lowest', '평점 낮은 순', filters.sort)}</select></label>
  <button type="submit">찾아보기</button>
</form><p class="rv-result-count" role="status">검색 결과 ${pagination.total}개</p>
<section class="rv-list" aria-label="고객 후기">${cards}</section>${pages}`;
}

function detailHtml(review) {
  return `<article class="rv-detail">
  <a href="/reviews/">← 고객 후기 모두 보기</a>
  <p class="rv-meta">${stars(review.rating)} · ${escapeHtml(spaceName(review.space))} · ${escapeHtml(review.experienceMonth)}</p>
  <h1>${escapeHtml(review.title)}</h1>
  <p class="rv-meta">${escapeHtml(review.nickname)} · ${escapeHtml(review.publishedAt.slice(0, 10))}${review.sourceLabel ? ` · ${escapeHtml(review.sourceLabel)}` : ''}</p>
  <p>${escapeHtml(review.body).replace(/\r?\n/g, '<br>')}</p>
  ${imagesHtml(review)}
</article>`;
}

function replaceTag(html, pattern, replacement, name) {
  if (!pattern.test(html)) throw new Error(`Reviews template ${name} missing`);
  return html.replace(pattern, replacement);
}

function render(template, content, meta) {
  if (!template.includes('<!--REVIEWS:CONTENT-->') || !template.includes('<!--/REVIEWS:CONTENT-->')) throw new Error('Reviews template markers missing');
  let html = replaceTag(template, /<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`, 'title');
  html = replaceTag(html, /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeHtml(meta.description)}">`, 'description');
  html = replaceTag(html, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${escapeHtml(meta.canonical)}">`, 'canonical');
  html = replaceTag(html, /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/, `<meta name="robots" content="${escapeHtml(meta.robots)}">`, 'robots');
  html = replaceTag(html, /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escapeHtml(meta.title)}">`, 'og:title');
  html = replaceTag(html, /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escapeHtml(meta.description)}">`, 'og:description');
  html = replaceTag(html, /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${escapeHtml(meta.canonical)}">`, 'og:url');
  return html.replace(/<!--REVIEWS:CONTENT-->[\s\S]*?<!--\/REVIEWS:CONTENT-->/, `<!--REVIEWS:CONTENT-->${content}<!--/REVIEWS:CONTENT-->`);
}

function bodyFrom(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const timer = setTimeout(() => reject(Object.assign(new Error('Request timeout'), { status: 408 })), 10000);
    timer.unref();
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) reject(Object.assign(new Error('Request too large'), { status: 413 }));
      else chunks.push(chunk);
    });
    req.on('end', () => {
      clearTimeout(timer);
      if (bytes > MAX_BODY) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', error => { clearTimeout(timer); reject(error); });
  });
}

function clientAddress(req, trustedProxies) {
  const peer = req.socket.remoteAddress || 'unknown';
  if (trustedProxies.has(peer)) {
    const address = String(req.headers['cf-connecting-ip'] || '').trim();
    if (net.isIP(address)) return address;
  }
  return peer;
}

function createReviewsHandler({ root, reviewsFile = process.env.REVIEWS_FILE || defaultFile(root), intmOrigin = process.env.INTM_REVIEWS_ORIGIN, intmTokenFile = process.env.INTM_REVIEWS_TOKEN_FILE, publicOrigin = process.env.REVIEWS_PUBLIC_ORIGIN || 'https://spacebogam.kr', trustedProxyAddresses = (process.env.TRUSTED_REVIEW_PROXY || '').split(',').map(value => value.trim()).filter(Boolean), now = () => new Date() }) {
  const file = privateFile(root, reviewsFile);
  if (intmOrigin) {
    const upstream = new URL(intmOrigin);
    const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(upstream.hostname);
    if (upstream.username || upstream.password || !(upstream.protocol === 'https:' || (upstream.protocol === 'http:' && loopback))) throw new Error('INTM reviews require HTTPS or loopback');
  }
  let intmToken;
  if (intmOrigin && intmTokenFile) {
    const tokenPath = privateFile(root, intmTokenFile);
    if (fs.statSync(tokenPath).mode & 0o077) throw new Error('INTM credential file must be private');
    intmToken = fs.readFileSync(tokenPath, 'utf8').trim();
    if (!/^[0-9a-f]{64}$/.test(intmToken)) throw new Error('Invalid INTM submission credential');
  }
  const loadStore = async () => {
    if (!intmOrigin) return readStore(file);
    const { status, body } = await intmRequest(intmOrigin);
    if (status !== 200 || !validPublicStore(body)) throw new Error('Invalid INTM reviews response');
    return body;
  };
  const origin = new URL(publicOrigin).origin;
  const trustedProxies = new Set(trustedProxyAddresses);
  const attemptsByAddress = new Map();
  const templateFile = path.join(root, 'reviews', 'index.html');

  return async function handleReviews(req, res, pathname) {
    const api = pathname === '/api/reviews';
    const detailMatch = pathname.match(/^\/reviews\/([0-9a-f-]{36})\/$/i);
    const alias = pathname === '/reviews' || pathname === '/reviews/index.html';
    if (!api && !alias && pathname !== '/reviews/' && pathname !== '/reviews/sitemap.xml' && !detailMatch) return false;
    try {
      if (alias) {
        if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: 'Method not allowed' }); return true; }
        const requestUrl = new URL(req.url, origin);
        res.writeHead(308, { Location: `/reviews/${requestUrl.search}`, 'Cache-Control': 'public, max-age=3600' });
        res.end();
        return true;
      }
      if (api && req.method === 'POST') {
        if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') { json(res, 415, { error: 'JSON 요청만 사용할 수 있습니다.' }); return true; }
        if (Number(req.headers['content-length']) > MAX_BODY) { json(res, 413, { error: '요청이 너무 큽니다.' }); return true; }
        let suppliedOrigin;
        try { suppliedOrigin = new URL(req.headers.origin || '').origin; } catch { suppliedOrigin = ''; }
        const expectedHost = new URL(origin).host;
        if (suppliedOrigin !== origin || req.headers.host !== expectedHost || req.headers['sec-fetch-site'] === 'cross-site') { json(res, 403, { error: 'Origin not allowed' }); return true; }
        const key = req.headers['idempotency-key'];
        if (!UUID.test(key || '')) { json(res, 400, { error: 'Idempotency-Key를 확인해 주세요.' }); return true; }
        const submitted = await bodyFrom(req);
        const error = validate(submitted, now());
        if (error) { json(res, 400, { error }); return true; }
        const payload = { rating: submitted.rating, title: submitted.title.trim(), body: submitted.body.trim(), nickname: submitted.nickname.trim(), space: submitted.space, experienceMonth: submitted.experienceMonth };
        const fingerprint = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const cutoff = now().getTime() - 60 * 60 * 1000;
        for (const [storedAddress, times] of attemptsByAddress) {
          const active = times.filter(time => time > cutoff);
          if (active.length) attemptsByAddress.set(storedAddress, active);
          else attemptsByAddress.delete(storedAddress);
        }
        const prior = !intmOrigin && readStore(file).reviews.find(review => review.idempotencyKey === key);
        if (prior) {
          if (prior.fingerprint !== fingerprint) { json(res, 409, { error: '같은 요청 키에 다른 후기를 사용할 수 없습니다.' }); return true; }
          json(res, 200, { id: prior.id, status: 'received' });
          return true;
        }
        const address = clientAddress(req, trustedProxies);
        if (!attemptsByAddress.has(address) && attemptsByAddress.size >= 10000) { json(res, 503, { error: '후기 접수가 혼잡합니다. 잠시 후 다시 작성해 주세요.' }); return true; }
        const attempts = attemptsByAddress.get(address) || [];
        if (attempts.length >= 5) { json(res, 429, { error: '잠시 후 다시 작성해 주세요.' }); return true; }
        attempts.push(now().getTime());
        attemptsByAddress.set(address, attempts);
        if (intmOrigin) {
          const result = await intmRequest(intmOrigin, 'POST', submitted, key, intmToken);
          if (result.status >= 400) json(res, result.status, { error: typeof result.body.error === 'string' ? result.body.error : '후기를 접수하지 못했습니다.' });
          else {
            if (![200, 201].includes(result.status) || !UUID.test(result.body.id || '') || result.body.status !== 'received') throw new Error('Invalid INTM submission response');
            json(res, result.status, { id: result.body.id, status: 'received' });
          }
          return true;
        }
        const saved = updateStore(file, store => {
          const prior = store.reviews.find(review => review.idempotencyKey === key);
          if (prior) return prior.fingerprint === fingerprint ? { id: prior.id, duplicate: true } : { conflict: true };
          const createdAt = now().toISOString();
          const review = { id: crypto.randomUUID(), ...payload, status: 'pending', createdAt, consentedAt: createdAt, consentVersion: CONSENT_VERSION, idempotencyKey: key, fingerprint };
          store.reviews.push(review);
          return { id: review.id, duplicate: false };
        });
        if (saved.conflict) { json(res, 409, { error: '같은 요청 키에 다른 후기를 사용할 수 없습니다.' }); return true; }
        json(res, saved.duplicate ? 200 : 201, { id: saved.id, status: 'received' });
        return true;
      }

      if (api) {
        if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: 'Method not allowed' }); return true; }
        const filters = filtersFrom(new URL(req.url, origin));
        if (filters.error) { json(res, 400, { error: filters.error }); return true; }
        const body = results(await loadStore(), filters);
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end();
        } else json(res, 200, body);
        return true;
      }

      if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: 'Method not allowed' }); return true; }
      const store = await loadStore();
      if (pathname === '/reviews/sitemap.xml') {
        const urls = approved(store).map(review => `<url><loc>${escapeHtml(origin)}/reviews/${review.id}/</loc><lastmod>${escapeHtml(review.publishedAt.slice(0, 10))}</lastmod></url>`).join('');
        const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(origin)}/reviews/</loc></url>${urls}</urlset>`;
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? '' : xml);
        return true;
      }

      const template = fs.readFileSync(templateFile, 'utf8');
      let status = 200;
      let content;
      let meta;
      if (detailMatch) {
        const review = approved(store).find(item => item.id === detailMatch[1]);
        if (review) {
          content = detailHtml(review);
          meta = { title: `${review.title} | 고객 후기 | 공간보감`, description: review.body.slice(0, 150), canonical: `${origin}/reviews/${review.id}/`, robots: 'index,follow,max-snippet:-1' };
        } else {
          status = 404;
          content = '<article class="rv-detail"><h1>후기를 찾을 수 없습니다.</h1><p><a href="/reviews/">고객 후기 목록으로 돌아가기</a></p></article>';
          meta = { title: '후기를 찾을 수 없습니다 | 공간보감', description: '요청한 후기를 찾을 수 없습니다.', canonical: `${origin}/reviews/${detailMatch[1]}/`, robots: 'noindex,nofollow' };
        }
      } else {
        const filters = filtersFrom(new URL(req.url, origin));
        if (filters.error) { json(res, 400, { error: filters.error }); return true; }
        content = listHtml(results(store, filters));
        meta = { title: '고객 후기 | 공간보감', description: '시공을 마친 뒤의 생활, 좋았던 점과 아쉬웠던 점. 공간보감 고객이 남긴 별점과 후기를 살펴보세요.', canonical: `${origin}/reviews/`, robots: 'index,follow' };
      }
      const html = render(template, content, meta);
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? '' : html);
      return true;
    } catch (error) {
      console.error('[spacebogam.reviews_unavailable]', JSON.stringify({ code: error.code || 'UNKNOWN' }));
      if (!res.headersSent) json(res, error.status || 503, { error: error.status === 413 ? '요청이 너무 큽니다.' : '후기 서비스를 잠시 사용할 수 없습니다.' });
      else if (!res.writableEnded) res.destroy();
      return true;
    }
  };
}

function cli(args = process.argv.slice(2)) {
  const root = path.resolve(process.env.ROOT || path.join(__dirname, 'current'));
  const file = privateFile(root, process.env.REVIEWS_FILE || defaultFile(root));
  const [command, id] = args;
  if (command === 'list') {
    for (const review of readStore(file).reviews) console.log(`${review.id}\t${review.status}\t${review.rating}\t${review.title}`);
    return;
  }
  if (command === 'show' && UUID.test(id || '')) {
    const review = readStore(file).reviews.find(item => item.id === id);
    if (!review) throw new Error('Review not found');
    console.log(JSON.stringify({ ...publicReview(review), status: review.status, createdAt: review.createdAt }, null, 2));
    return;
  }
  if (!['approve', 'reject', 'delete'].includes(command) || !UUID.test(id || '')) throw new Error('Usage: list | show ID | approve ID --customer OPAQUE_ID | reject ID | delete ID');
  const customerFlag = args.indexOf('--customer');
  const customerId = customerFlag >= 0 ? args[customerFlag + 1] : '';
  if (command === 'approve' && (!validText(customerId, 1, 100) || /\s/.test(customerId))) throw new Error('approve requires --customer OPAQUE_ID');
  const changed = updateStore(file, store => {
    const index = store.reviews.findIndex(item => item.id === id);
    const review = store.reviews[index];
    if (!review) return false;
    if (command === 'delete') { store.reviews.splice(index, 1); return true; }
    if (command === 'approve' && review.status === 'approved') {
      if (review.customerId !== customerId) throw new Error('Review already approved for a different customer');
      return true;
    }
    review.status = command === 'approve' ? 'approved' : 'rejected';
    if (command === 'approve') { review.customerId = customerId; review.publishedAt = new Date().toISOString(); }
    else { delete review.customerId; delete review.publishedAt; }
    return true;
  });
  if (!changed) throw new Error('Review not found');
  console.log(`${command}d ${id}`);
}

module.exports = { createReviewsHandler };

if (require.main === module) {
  try { cli(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
