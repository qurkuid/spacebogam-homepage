const UPSTREAM_ORIGIN = 'https://apt.intm.kr';
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const APARTMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{3,63}$/;

class CatalogError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function send(res, status, value, extraHeaders = {}) {
  if (res.destroyed) return;
  res.writeHead(status, {
    'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(JSON.stringify(value));
}

async function boundedJson(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new CatalogError('upstream response too large');
  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          throw new CatalogError('upstream response too large');
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }
    bytes = Buffer.concat(chunks, size);
  } else {
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_RESPONSE_BYTES) throw new CatalogError('upstream response too large');
  }
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new CatalogError('upstream returned invalid JSON'); }
}

function publicDataset(value) {
  if (!value || !Array.isArray(value.cols) || !Array.isArray(value.rows) || value.cols.length > 100 || value.rows.length > 100_000) {
    throw new CatalogError('invalid apartment dataset');
  }
  const required = ['apartmentName', 'apartmentId', 'roadAddress', 'legacyAddress'];
  const indexes = Object.fromEntries(required.map(name => [name, value.cols.indexOf(name)]));
  if (required.some(name => indexes[name] < 0)) throw new CatalogError('invalid apartment dataset columns');
  const rows = value.rows.map(row => {
    if (!Array.isArray(row)) throw new CatalogError('invalid apartment dataset row');
    const result = required.map(name => row[indexes[name]] == null ? '' : String(row[indexes[name]]));
    if (!result[0] || !APARTMENT_ID.test(result[1]) || result.some(field => field.length > 500)) throw new CatalogError('invalid apartment dataset value');
    return result;
  });
  return { source: 'jev-public-apartment-catalog', cols: required, rows };
}

function publicPlans(value) {
  if (!value || value.code !== 'OK' || !Array.isArray(value.data) || value.data.length > 10_000) {
    throw new CatalogError('invalid apartment plans');
  }
  const data = value.data.flatMap(plan => {
    const type = plan?.type == null ? '' : String(plan.type).trim();
    const planId = plan?.planId == null ? '' : String(plan.planId).trim();
    const name = plan?.name == null ? '' : String(plan.name).trim();
    if (!type || !APARTMENT_ID.test(planId) || [type, name].some(field => field.length > 500)) return [];
    return [{ type, planId, name }];
  });
  return { source: 'jev-public-apartment-catalog', code: 'OK', data };
}

async function upstreamJson(fetchImpl, pathname) {
  let response;
  try {
    response = await fetchImpl(UPSTREAM_ORIGIN + pathname, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new CatalogError(error?.name === 'TimeoutError' ? 'upstream timeout' : 'upstream request failed', error?.name === 'TimeoutError' ? 504 : 502);
  }
  if (!response?.ok) throw new CatalogError('upstream request failed');
  return boundedJson(response);
}

export function createPublicApartmentCatalog({ fetchImpl = fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  return {
    async route(req, res, path) {
      const dataset = path === '/api/public/apartments/dataset';
      const plans = /^\/api\/public\/apartments\/([A-Za-z0-9][A-Za-z0-9_-]{3,63})\/plans$/.exec(path);
      const publicPrefix = path === '/api/public/apartments' || path.startsWith('/api/public/apartments/');
      if (!publicPrefix) return false;
      if (req.method !== 'GET') {
        send(res, 405, { error: 'GET만 허용됩니다.' }, { Allow: 'GET' });
        return true;
      }
      if (!dataset && !plans) {
        send(res, 400, { error: '공개 아파트 경로 또는 ID가 올바르지 않습니다.' });
        return true;
      }
      try {
        const value = dataset
          ? publicDataset(await upstreamJson(fetchImpl, '/api/apartments/dataset'))
          : publicPlans(await upstreamJson(fetchImpl, `/api/apartments/${encodeURIComponent(plans[1])}/plans`));
        send(res, 200, value);
      } catch (error) {
        send(res, Number.isInteger(error?.status) ? error.status : 502, { error: '공개 아파트 목록을 불러오지 못했습니다.' });
      }
      return true;
    },
  };
}

export const publicApartmentCatalogLimits = Object.freeze({ maxResponseBytes: MAX_RESPONSE_BYTES, timeoutMs: TIMEOUT_MS, upstreamOrigin: UPSTREAM_ORIGIN });
