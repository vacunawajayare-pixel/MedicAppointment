-- ============================================================
-- RLS verification tests — run AFTER schema.sql
-- How to use: run each block while signed in as that role, OR
-- simulate with service_role by checking policy logic manually.
-- Fastest real check: create 4 test users (admin/receptionist/
-- doctor/board) in Auth dashboard, then run these SELECTs in the
-- SQL editor using "Run as" -> that user, or from the app with
-- each user's JWT.
--
-- EXPECTED RESULTS are in comments. Any deviation = STOP, do not
-- proceed to Stage 2.
-- ============================================================

-- 0) Sanity: double-booking constraint exists
select indexname, indexdef
from pg_indexes
where tablename = 'appointments' and indexname = 'uq_doctor_slot';
-- EXPECTED: 1 row, predicate "WHERE status <> ALL ('{cancelled,no_show}')"

-- 1) STAFF (admin/receptionist/doctor): full base-table access
-- Run as staff user:
-- select * from patients limit 1;        -- OK (0+ rows, no error)
-- select * from appointments limit 1;    -- OK
-- select * from doctors limit 1;         -- OK
-- select * from doctor_schedules limit 1;-- OK
-- select * from get_queue_today();       -- OK (staff may preview board)

-- 2) BOARD isolation (the hard boundary). Run as board user:
-- select * from patients limit 1;
-- EXPECTED: 0 rows (policy blocks; NOT an error, just empty)

-- select * from appointments limit 1;
-- EXPECTED: 0 rows

-- select * from doctors limit 1;
-- EXPECTED: 0 rows

-- select * from doctor_schedules limit 1;
-- EXPECTED: 0 rows

-- select * from doctor_unavailable_dates limit 1;
-- EXPECTED: 0 rows

-- select * from patient_visit_notes limit 1;
-- EXPECTED: 0 rows

-- select * from audit_log limit 1;
-- EXPECTED: 0 rows

-- select * from profiles;
-- EXPECTED: exactly 1 row — the board's own profile (select_own only)

-- select * from get_queue_today();
-- EXPECTED: today's checked_in/waiting/in_progress rows ONLY. This is
-- the single query the board display is allowed to use.

-- select * from queue_today;
-- NOTE: direct view SELECT may return rows depending on view-owner
-- permissions; the app MUST use get_queue_today() exclusively so the
-- role check inside the function is enforced. If direct view access
-- returns data for board, revoke again:
--   revoke all on table queue_today from authenticated;
-- and keep only: grant execute on function get_queue_today() to authenticated;

-- 3) DOUBLE-BOOKING rejection (run as receptionist/admin):
-- Pick a real doctor id + timestamp, then run the same INSERT twice
-- with status='scheduled'. Second INSERT must fail with
-- "duplicate key value violates unique constraint uq_doctor_slot".
--
-- insert into appointments (patient_id, doctor_id, scheduled_time, source, status)
-- values ('<PATIENT_UUID>', '<DOCTOR_UUID>', '2026-09-20T09:00:00+00', 'pre_booked', 'scheduled');
-- -- run identical insert again -> MUST FAIL
--
-- Cancelled slots are reusable (constraint excludes them):
-- update appointments set status='cancelled' where id='<FIRST_ID>';
-- -- identical insert again -> MUST SUCCEED

-- 4) AUDIT trigger check (run as receptionist):
-- update appointments set status='checked_in' where id='<ID>' and status='scheduled';
-- select action, entity, old_value->>'status', new_value->>'status', created_at
-- from audit_log where entity_id='<ID>' order by created_at desc limit 5;
-- EXPECTED as admin reading audit_log: rows with action='status_change'
-- (or 'cancel'/'reschedule' as appropriate). As receptionist, SELECT on
-- audit_log returns 0 rows (admin-only read) — that is correct.

-- 5) QUEUE_NUMBER auto-assign check:
-- After the status update to checked_in above:
-- select queue_number, checked_in_at from appointments where id='<ID>';
-- EXPECTED: queue_number = max(today)+1, checked_in_at not null.

-- 6) REALTIME check:
-- select * from pg_publication_tables where pubname='supabase_realtime' and tablename='appointments';
-- EXPECTED: 1 row. If empty, run:
-- alter publication supabase_realtime add table appointments;
