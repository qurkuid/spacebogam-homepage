// Private scheduled API reader. The public server only reads the sanitized cache.
import { Database } from 'bun:sqlite';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = process.env.SOCIAL_DESK_ROOT || '/Users/baegchangseog/srv/social-desk';
const output = process.env.INSTAGRAM_FEED_FILE || '/Users/baegchangseog/srv/spacebogam-site/private/instagram-feed.json';
const { createInstagramFeed } = createRequire(import.meta.url)('./spacebogam-social.js');
const { decryptSecret } = await import(pathToFileURL(join(root, 'server/security.ts')).href);
let initial;
try { initial = JSON.parse(await readFile(output, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const feed = createInstagramFeed({ initial, credentials: async () => {
  const db = new Database(join(root, 'data/social-desk.sqlite'), { readonly: true });
  try {
    const row = db.query("SELECT provider_id, access_token FROM connections WHERE platform='instagram' AND username IN ('ggbg.official', '@ggbg.official') AND status='connected' LIMIT 1").get();
    if (!row || !/^\d+$/.test(row.provider_id)) throw new Error('Instagram is not connected');
    const key = (await readFile(join(root, 'data/.encryption-key'), 'utf8')).trim();
    return { id: row.provider_id, token: await decryptSecret(row.access_token, key) };
  } finally { db.close(); }
} });
const result = await feed();
const temporary = output + '.' + process.pid + '.tmp';
await writeFile(temporary, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
await rename(temporary, output);
console.log(JSON.stringify({ status: result.status, posts: result.posts.length, updatedAt: result.updatedAt, errorCode: result.errorCode }));
if (result.status !== 'ready') process.exitCode = 1;
