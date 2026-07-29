\pset pager off
\echo '== A. consultation_submit + lead_submit_success, last 60d, ALL gates visible =='
SELECT left(session_id::text,8) AS sess,
       event_name,
       occurred_at AT TIME ZONE 'Asia/Seoul' AS kst,
       is_active, is_test,
       utm_source, utm_campaign,
       experiment_id, experiment_variant
FROM spacebogam_funnel_events
WHERE event_name IN ('lead_submit_success','consultation_submit')
  AND occurred_at >= now() - interval '60 days'
ORDER BY occurred_at;

\echo '== B. production predicate reproduced (is_active + testFunnelEventSql), by variant =='
SELECT experiment_variant AS ev,
       COUNT(DISTINCT session_id) AS total_sessions,
       COUNT(DISTINCT session_id) FILTER (
         WHERE is_active = true
           AND NOT (is_test = true OR utm_source ILIKE 'qa%' OR utm_campaign ILIKE 'qa%')
       ) AS counted_as_real
FROM spacebogam_funnel_events
WHERE event_name IN ('lead_submit_success','consultation_submit')
  AND occurred_at >= now() - interval '60 days'
GROUP BY 1 ORDER BY 1;

\echo '== C. the two sessions named in CMP-260 : full event trail =='
SELECT left(session_id::text,8) AS sess, event_name,
       occurred_at AT TIME ZONE 'Asia/Seoul' AS kst,
       is_active, is_test, utm_source, experiment_variant
FROM spacebogam_funnel_events
WHERE session_id::text LIKE 'd8086712%' OR session_id::text LIKE '90440f32%'
ORDER BY session_id, occurred_at;
\pset pager off
\echo '== D. sweep: ALL rows created before is_test-propagation deploy (2026-07-28) that still pass BOTH gates =='
SELECT date_trunc('hour', occurred_at AT TIME ZONE 'Asia/Seoul') AS kst_hour,
       event_name, count(*) AS rows, count(DISTINCT session_id) AS sessions,
       min(utm_source) AS utm_src_sample
FROM spacebogam_funnel_events
WHERE occurred_at < timestamptz '2026-07-28 00:00+09'
  AND is_active = true
  AND NOT (is_test = true OR utm_source ILIKE 'qa%' OR utm_campaign ILIKE 'qa%')
GROUP BY 1,2 ORDER BY 1 DESC, 2 LIMIT 40;

\echo '== E. probe-signature scan: sessions whose whole trail spans < 60s and reaches a submit, any date =='
WITH s AS (
  SELECT session_id,
         min(occurred_at) AS t0, max(occurred_at) AS t1,
         count(*) AS n,
         bool_or(event_name IN ('lead_submit_success','consultation_submit')) AS submitted,
         bool_or(is_active) AS any_active,
         bool_or(is_test)   AS any_test,
         min(utm_source)    AS utm_src
  FROM spacebogam_funnel_events GROUP BY 1)
SELECT left(session_id::text,8) AS sess, n,
       round(extract(epoch FROM (t1-t0))) AS span_s,
       t0 AT TIME ZONE 'Asia/Seoul' AS kst_start,
       any_active, any_test, utm_src
FROM s WHERE submitted AND extract(epoch FROM (t1-t0)) < 60
ORDER BY t0;

\echo '== F. the 2 sessions actually counted as real (lead_submit_success, 07-29) =='
SELECT left(session_id::text,8) AS sess, event_name,
       occurred_at AT TIME ZONE 'Asia/Seoul' AS kst, is_active, is_test,
       utm_source, utm_campaign
FROM spacebogam_funnel_events
WHERE session_id::text LIKE '091effcf%' OR session_id::text LIKE '4d7a293f%'
ORDER BY session_id, occurred_at;
\pset pager off
\echo '== L. consult_req last 3d, AUTHORITATIVE testConsultationSql predicate (flags only, no PII) =='
SELECT left(cr.id::text,8) AS req,
       cr.created_at AT TIME ZONE 'Asia/Seoul' AS kst,
       COALESCE(cr.marketing_attribution->>'is_test','-') AS attr_is_test,
       (cr.name ~* '^[[:space:]]*\[(QA|CMP-[0-9]+)') AS name_qa_bracket,
       (COALESCE(cr.marketing_attribution->>'is_test','') = 'true'
        OR cr.name ~* '^[[:space:]]*\[(QA|CMP-[0-9]+)') AS excluded_by_prod_rule,
       cr.marketing_attribution->>'utm_source'   AS utm_source,
       cr.marketing_attribution->>'utm_campaign' AS utm_campaign
FROM consult_req cr
WHERE cr.created_at >= now() - interval '3 days'
ORDER BY cr.created_at;
