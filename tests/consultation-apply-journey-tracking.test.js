const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'consultation-form.js'),
  'utf8',
);

test('legacy consultation form records privacy-safe journey steps and submit outcomes', () => {
  for (const eventName of [
    'lead_step_view',
    'lead_step_complete',
    'lead_step_skip',
    'lead_step_error',
    'lead_submit_attempt',
    'lead_submit_error',
  ]) {
    assert.match(source, new RegExp("['\"]" + eventName + "['\"]"));
  }

  assert.match(source, /ctaLocation: stepLocation\(question\), ctaText: action/);
  assert.match(source, /sendFunnelEvent\('lead_submit_error', \{ctaLocation:'consultation_form', ctaText:failureReason\}\)/);
  assert.doesNotMatch(source, /sendFunnelEvent\('lead_submit_success'/,
    'browser must not create the saved-consultation conversion row');
  assert.doesNotMatch(source, /lead_submit_error[^\n]+error\.message/,
    'free-form server or network errors must not enter first-party journey analytics');
});

test('success conversion requires a saved request and suppresses duplicate responses', () => {
  assert.match(source,
    /Number\.isInteger\(Number\(result\.body\.consultReqId\)\).*Number\(result\.body\.consultReqId\) <= 0/);
  assert.match(source, /if \(!isTest && !body\.duplicate\) \{/);
  assert.match(source, /trackPixel\('Lead', \{eventID: leadEventId\}\)/);
  assert.match(source, /trackGtag\('lead_submit_success', \{lead_event_id: leadEventId\}\)/);
  assert.match(source, /trackNaverConversion\(\)/);
});

test('Meta placement survives the form handoff without accepting arbitrary query data', () => {
  assert.match(source, /'placement', 'site_source_name'/);
  assert.match(source, /utmSource: attributionValue\('utm_source'\) \|\| attributionValue\('site_source_name'\)/);
  assert.match(source, /placement: attributionValue\('placement'\)\.slice\(0, 100\)/);
  assert.doesNotMatch(source, /QUERY_ATTRIBUTION_KEYS[^;]+email/s);
});
