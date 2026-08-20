-- Family Fee Contact read-performance indexes.
-- Safe to run repeatedly: these indexes do not modify school data.

CREATE INDEX IF NOT EXISTS idx_admissions_family_contact_active
    ON public.admissions (school_id, father_mobile)
    WHERE status = 'Active';

CREATE INDEX IF NOT EXISTS idx_challans_family_contact_pending
    ON public.challans (school_id, student_id)
    WHERE status IN ('Unpaid', 'Partially Paid');

CREATE INDEX IF NOT EXISTS idx_attendance_family_contact_recent
    ON public.attendance (school_id, date, student_id);

CREATE INDEX IF NOT EXISTS idx_transactions_family_contact_month
    ON public.transactions (school_id, created_at, student_id)
    WHERE amount_paid > 0;

CREATE INDEX IF NOT EXISTS idx_family_contacts_school_month_mobile
    ON public.family_contacts (school_id, month_key, family_mobile);

CREATE INDEX IF NOT EXISTS idx_family_commitments_school_month_status
    ON public.family_fee_commitments (school_id, month_key, status, due_date, created_at);

-- Student Fee Contact uses the same balance/attendance/payment indexes above.
CREATE INDEX IF NOT EXISTS idx_fee_contacts_school_month_student
    ON public.fee_contacts (school_id, month_key, student_id);

CREATE INDEX IF NOT EXISTS idx_classes_school_display_order
    ON public.classes (school_id, display_order, class_name, section);
