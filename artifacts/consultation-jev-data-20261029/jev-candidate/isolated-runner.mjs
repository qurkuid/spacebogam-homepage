import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createPublicApartmentCatalog } from './public-apartment-catalog.mjs';

export function createIsolatedCatalogServer({ fetchImpl = fetch } = {}) {
  const catalog = createPublicApartmentCatalog({ fetchImpl });
  return http.createServer(async (req, res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (await catalog.route(req, res, path)) return;
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify({ error: '직원 인증이 필요한 JEV 경로입니다.' }));
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = process.env.PORT === undefined ? 4353 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT는 1~65535 정수입니다.');
  const server = createIsolatedCatalogServer();
  server.listen(port, '127.0.0.1', () => console.log(`JEV public catalog candidate http://127.0.0.1:${port}`));
}
