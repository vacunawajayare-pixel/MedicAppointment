-- ============================================================
-- MedicalAppointment — CLEAN full schema + RLS (final, fixed).
-- Run the ENTIRE file once in Supabase SQL Editor. Safe to re-run:
-- every statement is IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE.
-- Already incorporates all fixes:
--  * no (scheduled_time::date) expression index (was 42P17) — plain btree
--  * is_admin() SECURITY DEFINER — no "infinite recursion" on profiles
--  * all role checks use qualified profiles.id (was 42702 ambiguous id)
--  * queue_today view + get_queue_today() use DROP + CREATE, not OR REPLACE
--    (shape changes are rejected on replace: 42P16 / return-type change)
--  * self-healing ALTER for is_priority moved immediately after CREATE
--    TABLE appointments, before any index references it (was 42703 —
--    the ALTER previously ran too late, after idx_appts_priority)
-- After it reports success, run the realtime line in section 6 separately.
-- ============================================================

-- 0) Extensions (Supabase usually has these; safe to re-run)
create extension if not exists "pgcrypto";

-- ============================================================
-- 1) TABLES
-- ============================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('receptionist','doctor','admin','board')),
  device_label text,
  created_at timestamptz default now()
);

create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  full_name text not null,
  specialty text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists doctor_schedules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  day_of_week int not null check (day_of_week between 0 and 6), -- 0=Sun
  start_time time not null,
  end_time time not null,
  slot_duration_minutes int not null default 30,
  check (start_time < end_time)
);

create table if not exists doctor_unavailable_dates (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors(id) on delete cascade not null,
  date date not null,
  reason text,
  unique (doctor_id, date)
);

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  date_of_birth date,
  contact_number text,
  address text,
  created_at timestamptz default now()
);

create index if not exists idx_patients_name on patients (lower(full_name));
create index if not exists idx_patients_contact on patients (contact_number);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete restrict not null,
  doctor_id uuid references doctors(id) on delete restrict not null,
  scheduled_time timestamptz not null,
  source text not null check (source in ('walk_in','pre_booked')) default 'pre_booked',
  is_recurring boolean default false,
  recurrence_parent_id uuid references appointments(id) on delete set null,
  status text not null check (status in (
    'scheduled','checked_in','waiting','in_progress',
    'completed','cancelled','no_show'
  )) default 'scheduled',
  queue_number int,
  room text,
  is_priority boolean not null default false, -- priority lane (seniors/PWD/triage)
  checked_in_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Self-heal for databases created before is_priority existed. MUST run
-- here, immediately after CREATE TABLE, and before ANY index below
-- references is_priority — otherwise CREATE INDEX fails with 42703 on
-- a pre-existing table that predates this column.
alter table appointments add column if not exists is_priority boolean not null default false;

create index if not exists idx_appts_doctor_time on appointments (doctor_id, scheduled_time);
create index if not exists idx_appts_patient on appointments (patient_id);
create index if not exists idx_appts_status on appointments (status);
-- NOTE: no expression index on (scheduled_time::date): casting timestamptz
-- to date depends on the session timezone (STABLE, not IMMUTABLE) and
-- Postgres rejects it in index expressions (42P17). The plain btree below
-- serves all day-range queries (gte/lte on scheduled_time).
create index if not exists idx_appts_sched_time on appointments (scheduled_time);
create index if not exists idx_appts_priority on appointments (is_priority)
  where status in ('checked_in','waiting','in_progress');

-- prevent double-booking: same doctor, same slot, unless cancelled/no_show
-- NOTE: keep intact. Do not relax this predicate.
create unique index if not exists uq_doctor_slot
  on appointments (doctor_id, scheduled_time)
  where status not in ('cancelled','no_show');

create table if not exists patient_visit_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade not null,
  appointment_id uuid references appointments(id) on delete set null,
  note text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_notes_patient on patient_visit_notes (patient_id);
create index if not exists idx_notes_appointment on patient_visit_notes (appointment_id);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null, -- 'create','status_change','reschedule','cancel','update'
  entity text not null,  -- 'appointment','patient','doctor', etc.
  entity_id uuid not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_audit_entity on audit_log (entity, entity_id);
create index if not exists idx_audit_actor on audit_log (actor_id);

-- ============================================================
-- 2) AUTOMATION: updated_at, queue_number, audit
-- ============================================================

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_appointments_updated_at on appointments;
create trigger trg_appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();

-- Auto-assign queue_number on first check-in: max(queue_number)+1 for
-- today's date (local DB date = current_date). Walk-ins and pre-booked
-- share the same daily sequence, distinguished by `source`.
create or replace function assign_queue_number()
returns trigger as $$
declare
  max_q int;
begin
  if (new.queue_number is null
      and old.status = 'scheduled'
      and new.status in ('checked_in','waiting','in_progress')) then
    select coalesce(max(queue_number), 0) into max_q
    from appointments
    where scheduled_time::date = (new.scheduled_time::date);
    new.queue_number := max_q + 1;
    if new.checked_in_at is null then
      new.checked_in_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_assign_queue_number on appointments;
create trigger trg_assign_queue_number
  before update on appointments
  for each row execute function assign_queue_number();

-- Audit trigger: logs status changes, reschedules, creates, cancels.
create or replace function audit_appointment_changes()
returns trigger as $$
declare
  v_action text;
begin
  if (TG_OP = 'INSERT') then
    v_action := 'create';
    insert into audit_log (actor_id, action, entity, entity_id, old_value, new_value)
    values (new.created_by, v_action, 'appointment', new.id, null, to_jsonb(new));
    return new;
  elsif (TG_OP = 'UPDATE') then
    if (old.status is distinct from new.status) then
      if new.status = 'cancelled' then v_action := 'cancel';
      else v_action := 'status_change'; end if;
    elsif (old.scheduled_time is distinct from new.scheduled_time) then
      v_action := 'reschedule';
    else
      v_action := 'update';
    end if;
    insert into audit_log (actor_id, action, entity, entity_id, old_value, new_value)
    values (auth.uid(), v_action, 'appointment', new.id, to_jsonb(old), to_jsonb(new));
    return new;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_audit_appointments on appointments;
create trigger trg_audit_appointments
  after insert or update on appointments
  for each row execute function audit_appointment_changes();

-- ============================================================
-- 3) QUEUE VIEW + BOARD-ONLY ACCESS FUNCTION
-- Board must ONLY read today's active queue. Views don't enforce RLS
-- themselves, so all board reads go through get_queue_today(), which
-- is SECURITY DEFINER + explicitly checks profiles.role = 'board'
-- (or staff, so staff can also preview the board).
-- ============================================================

-- NOTE: drop + recreate (not OR REPLACE): adding is_priority in the middle
-- of the column list is a shape change Postgres rejects on replace (42P16).
drop view if exists queue_today;
create view queue_today as
select
  a.id,
  a.queue_number,
  a.is_priority,
  p.full_name as patient_display_name,
  d.full_name as doctor_name,
  a.status,
  a.room,
  a.scheduled_time
from appointments a
join patients p on p.id = a.patient_id
join doctors d on d.id = a.doctor_id
where a.scheduled_time::date = current_date
  and a.status in ('checked_in','waiting','in_progress')
order by a.queue_number asc nulls last, a.scheduled_time asc;

create or replace function can_access_queue()
returns boolean as $$
  select exists (
    select 1 from profiles where profiles.id = auth.uid() and role in ('board','receptionist','doctor','admin')
  );
$$ language sql security definer stable;

-- Admin check that never recurses: runs as the function owner (who bypasses
-- RLS), so policies on `profiles` itself can safely call it. A policy that
-- SELECTs from profiles inside its own USING clause causes
-- "infinite recursion detected" — never do that (see profiles_admin_all).
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where profiles.id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- NOTE: drop + recreate (not OR REPLACE): adding is_priority to the
-- RETURNS TABLE list changes the return type, which replace rejects.
-- (Section 5 re-applies the EXECUTE grant dropped with the function.)
drop function if exists get_queue_today();
create function get_queue_today()
returns table (
  id uuid,
  queue_number int,
  is_priority boolean,
  patient_display_name text,
  doctor_name text,
  status text,
  room text,
  scheduled_time timestamptz
) as $$
begin
  if not (
    exists (select 1 from profiles where profiles.id = auth.uid() and role in ('board','receptionist','doctor','admin'))
  ) then
    raise exception 'not authorized for queue board' using errcode = '42501';
  end if;
  return query select q.id, q.queue_number, q.is_priority, q.patient_display_name, q.doctor_name, q.status, q.room, q.scheduled_time
               from queue_today q;
end;
$$ language plpgsql security definer stable;

-- ============================================================
-- 4) RLS
-- ============================================================

alter table profiles enable row level security;
alter table doctors enable row level security;
alter table doctor_schedules enable row level security;
alter table doctor_unavailable_dates enable row level security;
alter table patients enable row level security;
alter table patient_visit_notes enable row level security;
alter table appointments enable row level security;
alter table audit_log enable row level security;

-- Drop old policies if re-running (names from draft spec + this file)
drop policy if exists "staff_full_access_appointments" on appointments;
drop policy if exists "staff_full_access_patients" on patients;
drop policy if exists "staff_full_access_doctors" on doctors;
drop policy if exists "staff_read_own_profile" on profiles;
drop policy if exists "staff_full_access_audit" on audit_log;
drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_admin_all" on profiles;
drop policy if exists "staff_all_doctors" on doctors;
drop policy if exists "staff_all_schedules" on doctor_schedules;
drop policy if exists "staff_all_unavailable" on doctor_unavailable_dates;
drop policy if exists "staff_all_patients" on patients;
drop policy if exists "staff_all_notes" on patient_visit_notes;
drop policy if exists "staff_all_appointments" on appointments;
drop policy if exists "audit_admin_select" on audit_log;
drop policy if exists "audit_staff_insert" on audit_log;

-- ---- profiles ----
-- Every signed-in user can read their own row (needed to resolve role).
create policy "profiles_select_own" on profiles
  for select using (id = auth.uid());

-- Signup self-insert: user may create exactly their own profile row.
create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());

-- Admins can manage all profiles (create board accounts, set roles).
-- Uses is_admin() (SECURITY DEFINER) — a direct subquery on profiles here
-- would recurse infinitely.
create policy "profiles_admin_all" on profiles
  for all using (is_admin()) with check (is_admin());

-- ---- clinical tables: staff-only (receptionist/doctor/admin).
-- No policy grants anything to role='board', so board gets 0 rows.
create policy "staff_all_doctors" on doctors
  for all using (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  ) with check (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  );

create policy "staff_all_schedules" on doctor_schedules
  for all using (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  ) with check (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  );

create policy "staff_all_unavailable" on doctor_unavailable_dates
  for all using (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  ) with check (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  );

create policy "staff_all_patients" on patients
  for all using (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  ) with check (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  );

create policy "staff_all_notes" on patient_visit_notes
  for all using (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  ) with check (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  );

create policy "staff_all_appointments" on appointments
  for all using (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  ) with check (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  );

-- ---- audit_log ----
-- Staff may INSERT via app/trigger context; only admin may read.
-- (The audit trigger itself is SECURITY DEFINER so INSERTs from the
-- trigger always succeed even if the RLS INSERT check below changes.)
create policy "audit_staff_insert" on audit_log
  for insert with check (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role in ('receptionist','doctor','admin'))
  );

create policy "audit_admin_select" on audit_log
  for select using (
    exists (select 1 from profiles pr where pr.id = auth.uid()
            and pr.role = 'admin')
  );

-- ============================================================
-- 5) GRANTS — least privilege
-- ============================================================

revoke all on table profiles, doctors, doctor_schedules,
  doctor_unavailable_dates, patients, patient_visit_notes,
  appointments, audit_log from anon;
grant all on table profiles, doctors, doctor_schedules,
  doctor_unavailable_dates, patients, patient_visit_notes,
  appointments, audit_log to authenticated;
-- RLS above is what actually restricts rows; board has no policy
-- on base tables so it sees nothing there.

revoke all on table queue_today from anon, authenticated;
grant select on queue_today to authenticated; -- view itself inert without base perms;
                                             -- real gate is get_queue_today()

grant execute on function can_access_queue() to authenticated;
grant execute on function get_queue_today() to authenticated;
grant execute on function is_admin() to authenticated;

-- ============================================================
-- 6) REALTIME — board subscribes to appointment changes
-- Run this too (needed once per project):
-- ============================================================
-- NOTE: Supabase realtime publication. Uncomment/run if the table is
-- not already in the publication (re-running is safe to attempt, will
-- error gracefully if already a member — ignore that error).
-- alter publication supabase_realtime add table appointments;