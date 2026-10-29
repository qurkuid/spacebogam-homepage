# JEV public apartment catalog

Reviewed public catalog module and minimal JEV server patch, released on 2026-10-29 for the Spacebogam consultation form. The patch is applied to the JEV source and its code-only production release. Deployment receipts are in `artifacts/consultation-apartment-release-20261029/`.

- `public-apartment-catalog.mjs` exposes two GET-only public catalog routes and strips all non-public upstream fields.
- `server.mjs.patch` adds only the public catalog import, construction, and pre-auth route insertion to the existing server.
- `server.mjs.patch` is the numbered unified diff generated from the original and verified with `patch --dry-run -p1`.
- `isolated-runner.mjs` runs only the public catalog candidate. Every other path returns 401.

The runner does not read JEV data, settings, environment API keys, customer consultations, cookies, or employee sessions. It binds only to loopback and uses fixed `https://apt.intm.kr` upstream URLs.
Successful JSON includes `source: "jev-public-apartment-catalog"`; error responses are `Cache-Control: no-store`.

```sh
PORT=4353 node artifacts/consultation-jev-data-20261029/jev-candidate/isolated-runner.mjs
```

For automated review, inject a mock `fetchImpl` through `createIsolatedCatalogServer`; all other employee and customer data routes retain their existing authentication requirements.
