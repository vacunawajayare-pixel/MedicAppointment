-- ============================================================
-- SEED DATA — MedicalAppointment system
-- Safe to re-run: every row has an explicit UUID + ON CONFLICT DO NOTHING.
-- Run AFTER the schema file. Populates doctors, schedules, patients,
-- and appointments spanning yesterday / today / tomorrow / next week
-- with every status so Dashboard, Booking, Check-in, Patients, Doctors,
-- and Reports all have data to render.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) DOCTORS
-- ------------------------------------------------------------
insert into doctors (id, profile_id, full_name, specialty, is_active) values
  ('a0000000-0000-0000-0000-000000000001', null, 'Dr. Ana Reyes',       'General medicine', true),
  ('a0000000-0000-0000-0000-000000000002', null, 'Dr. Mark Santos',     'Pediatrics',        true),
  ('a0000000-0000-0000-0000-000000000003', null, 'Dr. Liza Cruz',       'OB-Gyne',           true),
  ('a0000000-0000-0000-0000-000000000004', null, 'Dr. Paolo Bautista',  'Dentistry',         true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2) DOCTOR SCHEDULES (Mon–Fri, 8:00 AM – 5:00 PM, 30-min slots)
-- ------------------------------------------------------------
insert into doctor_schedules (id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes) values
  ('c0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', 1, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000001', 2, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000103', 'a0000000-0000-0000-0000-000000000001', 3, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000104', 'a0000000-0000-0000-0000-000000000001', 4, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000105', 'a0000000-0000-0000-0000-000000000001', 5, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000002', 1, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000202', 'a0000000-0000-0000-0000-000000000002', 3, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000203', 'a0000000-0000-0000-0000-000000000002', 5, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000003', 2, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000302', 'a0000000-0000-0000-0000-000000000003', 4, '08:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000004', 1, '13:00', '17:00', 30),
  ('c0000000-0000-0000-0000-000000000402', 'a0000000-0000-0000-0000-000000000004', 4, '13:00', '17:00', 30)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3) DOCTOR UNAVAILABLE DATES (leave / seminar)
-- ------------------------------------------------------------
insert into doctor_unavailable_dates (id, doctor_id, date, reason) values
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', current_date + 2, 'Seminar')
on conflict (doctor_id, date) do nothing;

-- ------------------------------------------------------------
-- 4) PATIENTS
-- ------------------------------------------------------------
insert into patients (id, full_name, date_of_birth, contact_number, address) values
  ('b0000000-0000-0000-0000-000000000001', 'Juan Dela Cruz',    '1985-03-12', '09171234501', 'Poblacion, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000002', 'Maria Santos',      '1990-07-22', '09171234502', 'Paringao, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000003', 'Pedro Reyes',       '1955-01-05', '09171234503', 'Central West, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000004', 'Ana Lopez',         '2022-05-10', '09171234504', 'Nagrebcan, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000005', 'Carmela Ramos',     '1998-11-30', '09171234505', 'Pilar, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000006', 'Jose Manalo',       '1948-09-18', '09171234506', 'Payocpoc, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000007', 'Grace Fernandez',   '1975-02-14', '09171234507', 'Baccuit, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000008', 'Ramon Torres',      '2001-06-25', '09171234508', 'Acao, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000009', 'Liza Gonzales',     '1988-12-01', '09171234509', 'Cabalayangan, Bauang, La Union'),
  ('b0000000-0000-0000-0000-000000000010', 'Mark Villanueva',   '1965-04-09', '09171234510', 'Disso-or, Bauang, La Union')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5) APPOINTMENTS — yesterday / today / tomorrow / next week
-- ------------------------------------------------------------

-- Yesterday
insert into appointments (id, patient_id, doctor_id, scheduled_time, source, status, queue_number, is_priority, room, checked_in_at) values
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
    (current_date - 1) + time '09:00', 'pre_booked', 'completed', 1, false, '1', (current_date - 1) + time '08:55'),
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001',
    (current_date - 1) + time '09:30', 'pre_booked', 'no_show', null, true, null, null)
on conflict (id) do nothing;

-- Today
insert into appointments (id, patient_id, doctor_id, scheduled_time, source, status, queue_number, is_priority, room, checked_in_at) values
  ('e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
    current_date + time '08:30', 'walk_in',    'completed',   1, false, '1', current_date + time '08:28'),
  ('e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
    current_date + time '09:00', 'pre_booked', 'in_progress', 2, true,  '1', current_date + time '08:50'),
  ('e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002',
    current_date + time '09:00', 'pre_booked', 'waiting',     1, false, '2', current_date + time '08:45'),
  ('e0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002',
    current_date + time '09:30', 'walk_in',    'checked_in',  2, false, null, current_date + time '09:20'),
  ('e0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000003',
    current_date + time '10:00', 'pre_booked', 'scheduled',   null, false, null, null),
  ('e0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001',
    current_date + time '10:30', 'walk_in',    'scheduled',   null, false, null, null),
  ('e0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003',
    current_date + time '11:00', 'pre_booked', 'cancelled',   null, false, null, null),
  ('e0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000004',
    current_date + time '13:00', 'pre_booked', 'scheduled',   null, true,  null, null)
on conflict (id) do nothing;

-- Tomorrow — follow-up, linked to today's completed visit (id ...003)
insert into appointments (id, patient_id, doctor_id, scheduled_time, source, status, is_recurring, recurrence_parent_id) values
  ('e0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
    (current_date + 1) + time '09:00', 'pre_booked', 'scheduled', true, 'e0000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- Next week
insert into appointments (id, patient_id, doctor_id, scheduled_time, source, status) values
  ('e0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002',
    (current_date + 7) + time '10:00', 'pre_booked', 'scheduled')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 6) VISIT NOTE for today's completed appointment (...003)
-- ------------------------------------------------------------
insert into patient_visit_notes (id, patient_id, appointment_id, note) values
  ('f0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000003',
   'Mild fever and cough. Prescribed paracetamol, advised rest and follow-up in one week.')
on conflict (id) do nothing;

commit;