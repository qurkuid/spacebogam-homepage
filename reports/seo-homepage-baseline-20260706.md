# Spacebogam homepage SEO dictionary baseline — 2026-07-06

## Scope
- Goal approved by marketing: increase homepage/session dwell time through a guide hub, four long-form guides, and related-guide structures on priority regional/complex landing pages.
- Repository observed: `/Users/changseok/Documents/spacebogam-homepage` on branch `qa-alt-accessibility-20260704`.
- Production domain target: `https://spacebogam.kr`.

## Baseline before this apply pass
- Existing site already had static HTML pages with canonical/meta/OG/Twitter tags and shared `assets/site-tracking.js`.
- Existing priority landing pages were short-to-medium static regional pages; they did not yet have the required `/guides/` plural hub links, guide checklist block, and dedicated FAQPage schema marker from this task.
- Existing `guide/` singular content hub was present, but the approved plan requires `/guides/` plural hub plus four named guide pages.
- CTA tracking markers to preserve: consultation links use `/consultation/` with `data-cta-location`; phone links use `tel:050713881252`; shared tracking script contains `click_consultation`, `click_call`, Meta `Lead`, and Meta `Contact` behavior.

## Files/URLs selected for implementation
- New guide hub: `/guides/`.
- New guides: `/guides/interior-estimate-checklist.html`, `/guides/interior-contract-checklist.html`, `/guides/busan-haeundae-interior-checklist.html`, `/guides/apartment-interior-process.html`.
- Priority landing pages: /haeundae-interior.html, /haeundae-lct-interior.html, /marine-city-interior.html, /jwadong-interior.html, /jungdong-interior.html, /udong-interior.html, /hwamyeong-interior.html, /sajik-dong-interior.html, /centum-star-interior.html, /the-sharp-centum-park-interior.html.

## Verification plan
- Local HTTP 200 checks for representative 20 URLs.
- `sitemap.xml` XML parse and inclusion checks for `/guides/` URLs.
- JSON-LD parse checks for guide and landing FAQPage schema.
- Browser/mobile 390x844 screenshot for `/guides/`.
- CTA click event smoke test for `click_consultation`, `click_call`, Meta `Lead`, and Meta `Contact` preservation.
