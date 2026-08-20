-- Library Books Record: school-scoped catalogue and immutable circulation ledger.
-- Run once in the Supabase SQL Editor before opening library_books.html.

BEGIN;

CREATE TABLE IF NOT EXISTS public.library_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.library_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
    accession_code TEXT,
    isbn TEXT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    author TEXT,
    category_id UUID REFERENCES public.library_categories(id) ON DELETE SET NULL,
    publisher TEXT,
    edition TEXT,
    language TEXT,
    shelf_location TEXT,
    purchase_date DATE,
    purchase_price_per_copy NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (purchase_price_per_copy >= 0),
    supplier TEXT,
    invoice_number TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Archived', 'Deleted')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_library_books_school_accession
    ON public.library_books (school_id, accession_code)
    WHERE accession_code IS NOT NULL AND length(trim(accession_code)) > 0;
CREATE INDEX IF NOT EXISTS idx_library_books_school_title ON public.library_books (school_id, title);
CREATE INDEX IF NOT EXISTS idx_library_books_school_isbn ON public.library_books (school_id, isbn);

CREATE TABLE IF NOT EXISTS public.library_book_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.library_books(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'ACQUIRE', 'ADD_COPIES', 'ISSUE', 'RETURN', 'RETURN_DAMAGED',
        'DAMAGE', 'REPAIR', 'LOST', 'WITHDRAW'
    )),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source_bucket TEXT CHECK (source_bucket IS NULL OR source_bucket IN ('available', 'issued', 'damaged', 'lost', 'withdrawn')),
    destination_bucket TEXT CHECK (destination_bucket IS NULL OR destination_bucket IN ('available', 'issued', 'damaged', 'lost', 'withdrawn')),
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    related_issue_id UUID REFERENCES public.library_book_transactions(id) ON DELETE RESTRICT,
    borrower_type TEXT CHECK (borrower_type IS NULL OR borrower_type IN ('Student', 'Staff', 'Other')),
    borrower_id UUID,
    borrower_name TEXT,
    borrower_number TEXT,
    borrower_class TEXT,
    borrower_mobile TEXT,
    due_date DATE,
    return_date DATE,
    condition_note TEXT,
    reason TEXT,
    fine_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
    repair_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (repair_cost >= 0),
    loss_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (loss_amount >= 0),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_transactions_book_date ON public.library_book_transactions (book_id, transaction_date, created_at);
CREATE INDEX IF NOT EXISTS idx_library_transactions_school_type ON public.library_book_transactions (school_id, transaction_type, transaction_date);
CREATE INDEX IF NOT EXISTS idx_library_transactions_related_issue ON public.library_book_transactions (related_issue_id);
CREATE INDEX IF NOT EXISTS idx_library_transactions_due_date ON public.library_book_transactions (school_id, due_date) WHERE transaction_type = 'ISSUE';

CREATE OR REPLACE FUNCTION public.touch_library_book_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_library_books ON public.library_books;
CREATE TRIGGER trg_touch_library_books BEFORE UPDATE ON public.library_books
FOR EACH ROW EXECUTE FUNCTION public.touch_library_book_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_library_transaction_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Library history is immutable. Record a correcting transaction instead.'; END;
$$;

DROP TRIGGER IF EXISTS trg_library_transactions_immutable ON public.library_book_transactions;
CREATE TRIGGER trg_library_transactions_immutable BEFORE UPDATE OR DELETE ON public.library_book_transactions
FOR EACH ROW EXECUTE FUNCTION public.prevent_library_transaction_mutation();

ALTER TABLE public.library_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_book_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Library categories tenant access" ON public.library_categories;
CREATE POLICY "Library categories tenant access" ON public.library_categories FOR ALL TO authenticated
USING (public.is_super_admin() OR school_id = public.get_current_user_school_id())
WITH CHECK (public.is_super_admin() OR school_id = public.get_current_user_school_id());

DROP POLICY IF EXISTS "Library books tenant access" ON public.library_books;
CREATE POLICY "Library books tenant access" ON public.library_books FOR ALL TO authenticated
USING (public.is_super_admin() OR school_id = public.get_current_user_school_id())
WITH CHECK (public.is_super_admin() OR school_id = public.get_current_user_school_id());

DROP POLICY IF EXISTS "Library transactions tenant read" ON public.library_book_transactions;
CREATE POLICY "Library transactions tenant read" ON public.library_book_transactions FOR SELECT TO authenticated
USING (public.is_super_admin() OR school_id = public.get_current_user_school_id());

CREATE OR REPLACE FUNCTION public.record_library_transaction(
    p_book_id UUID,
    p_transaction_type TEXT,
    p_quantity INTEGER,
    p_transaction_date DATE DEFAULT CURRENT_DATE,
    p_source_bucket TEXT DEFAULT NULL,
    p_destination_bucket TEXT DEFAULT NULL,
    p_unit_cost NUMERIC DEFAULT 0,
    p_related_issue_id UUID DEFAULT NULL,
    p_borrower_type TEXT DEFAULT NULL,
    p_borrower_id UUID DEFAULT NULL,
    p_borrower_name TEXT DEFAULT NULL,
    p_borrower_number TEXT DEFAULT NULL,
    p_borrower_class TEXT DEFAULT NULL,
    p_borrower_mobile TEXT DEFAULT NULL,
    p_due_date DATE DEFAULT NULL,
    p_return_date DATE DEFAULT NULL,
    p_condition_note TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_fine_amount NUMERIC DEFAULT 0,
    p_repair_cost NUMERIC DEFAULT 0,
    p_loss_amount NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_created_by_name TEXT DEFAULT NULL
)
RETURNS public.library_book_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_book public.library_books%ROWTYPE;
    v_issue public.library_book_transactions%ROWTYPE;
    v_result public.library_book_transactions%ROWTYPE;
    v_available INTEGER := 0;
    v_issued INTEGER := 0;
    v_damaged INTEGER := 0;
    v_lost INTEGER := 0;
    v_withdrawn INTEGER := 0;
    v_source_available INTEGER := 0;
    v_issue_closed INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero.'; END IF;

    SELECT * INTO v_book FROM public.library_books
    WHERE id = p_book_id AND status <> 'Deleted' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Book was not found or is deleted.'; END IF;
    IF NOT public.is_super_admin() AND v_book.school_id <> public.get_current_user_school_id() THEN
        RAISE EXCEPTION 'This book belongs to another school.';
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN destination_bucket='available' THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN source_bucket='available' THEN quantity ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN destination_bucket='issued' THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN source_bucket='issued' THEN quantity ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN destination_bucket='damaged' THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN source_bucket='damaged' THEN quantity ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN destination_bucket='lost' THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN source_bucket='lost' THEN quantity ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN destination_bucket='withdrawn' THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN source_bucket='withdrawn' THEN quantity ELSE 0 END),0)
    INTO v_available,v_issued,v_damaged,v_lost,v_withdrawn
    FROM public.library_book_transactions WHERE book_id=p_book_id;

    IF p_source_bucket IS NOT NULL THEN
        v_source_available := CASE p_source_bucket WHEN 'available' THEN v_available WHEN 'issued' THEN v_issued WHEN 'damaged' THEN v_damaged WHEN 'lost' THEN v_lost WHEN 'withdrawn' THEN v_withdrawn ELSE 0 END;
        IF p_quantity > v_source_available THEN RAISE EXCEPTION 'Only % copy/copies are available in the % state.',v_source_available,p_source_bucket; END IF;
    END IF;

    IF p_transaction_type IN ('ACQUIRE','ADD_COPIES') AND (p_source_bucket IS NOT NULL OR p_destination_bucket IS DISTINCT FROM 'available') THEN RAISE EXCEPTION 'Acquired copies must enter available stock.'; END IF;
    IF p_transaction_type='ISSUE' AND (p_source_bucket IS DISTINCT FROM 'available' OR p_destination_bucket IS DISTINCT FROM 'issued' OR length(trim(COALESCE(p_borrower_name,'')))=0 OR p_due_date IS NULL) THEN RAISE EXCEPTION 'An issue needs available stock, borrower name and due date.'; END IF;
    IF p_transaction_type='RETURN' AND (p_source_bucket IS DISTINCT FROM 'issued' OR p_destination_bucket IS DISTINCT FROM 'available') THEN RAISE EXCEPTION 'A normal return must move issued copies to available.'; END IF;
    IF p_transaction_type='RETURN_DAMAGED' AND (p_source_bucket IS DISTINCT FROM 'issued' OR p_destination_bucket IS DISTINCT FROM 'damaged') THEN RAISE EXCEPTION 'A damaged return must move issued copies to damaged.'; END IF;
    IF p_transaction_type='DAMAGE' AND (p_source_bucket IS DISTINCT FROM 'available' OR p_destination_bucket IS DISTINCT FROM 'damaged') THEN RAISE EXCEPTION 'Damage must move available copies to damaged.'; END IF;
    IF p_transaction_type='REPAIR' AND (p_source_bucket IS DISTINCT FROM 'damaged' OR p_destination_bucket IS DISTINCT FROM 'available') THEN RAISE EXCEPTION 'Repair must move damaged copies to available.'; END IF;
    IF p_transaction_type='LOST' AND (p_source_bucket NOT IN ('available','issued','damaged') OR p_destination_bucket IS DISTINCT FROM 'lost') THEN RAISE EXCEPTION 'Loss must move available, issued or damaged copies to lost.'; END IF;
    IF p_transaction_type='WITHDRAW' AND (p_source_bucket NOT IN ('available','damaged') OR p_destination_bucket IS DISTINCT FROM 'withdrawn') THEN RAISE EXCEPTION 'Withdrawal must move available or damaged copies to withdrawn.'; END IF;

    IF p_transaction_type IN ('RETURN','RETURN_DAMAGED') OR (p_transaction_type='LOST' AND p_source_bucket='issued') THEN
        IF p_related_issue_id IS NULL THEN RAISE EXCEPTION 'Select the original issue transaction.'; END IF;
        SELECT * INTO v_issue FROM public.library_book_transactions
        WHERE id=p_related_issue_id AND book_id=p_book_id AND transaction_type='ISSUE';
        IF NOT FOUND THEN RAISE EXCEPTION 'The selected issue transaction is invalid.'; END IF;
        SELECT COALESCE(SUM(quantity),0) INTO v_issue_closed FROM public.library_book_transactions
        WHERE related_issue_id=p_related_issue_id AND transaction_type IN ('RETURN','RETURN_DAMAGED','LOST');
        IF p_quantity > v_issue.quantity-v_issue_closed THEN RAISE EXCEPTION 'Only % copy/copies remain against this issue.',v_issue.quantity-v_issue_closed; END IF;
    END IF;

    INSERT INTO public.library_book_transactions (
        school_id,book_id,transaction_type,quantity,transaction_date,source_bucket,destination_bucket,unit_cost,related_issue_id,
        borrower_type,borrower_id,borrower_name,borrower_number,borrower_class,borrower_mobile,due_date,return_date,
        condition_note,reason,fine_amount,repair_cost,loss_amount,notes,created_by,created_by_name
    ) VALUES (
        v_book.school_id,p_book_id,p_transaction_type,p_quantity,COALESCE(p_transaction_date,CURRENT_DATE),p_source_bucket,p_destination_bucket,COALESCE(p_unit_cost,0),p_related_issue_id,
        p_borrower_type,p_borrower_id,p_borrower_name,p_borrower_number,p_borrower_class,p_borrower_mobile,p_due_date,p_return_date,
        p_condition_note,p_reason,COALESCE(p_fine_amount,0),COALESCE(p_repair_cost,0),COALESCE(p_loss_amount,0),p_notes,auth.uid(),p_created_by_name
    ) RETURNING * INTO v_result;
    RETURN v_result;
END;
$$;

CREATE OR REPLACE VIEW public.library_book_balances WITH (security_invoker=true) AS
SELECT b.id AS book_id,b.school_id,
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('ACQUIRE','ADD_COPIES') THEN t.quantity ELSE 0 END),0)::INTEGER AS total_copies,
    (COALESCE(SUM(CASE WHEN t.destination_bucket='available' THEN t.quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN t.source_bucket='available' THEN t.quantity ELSE 0 END),0))::INTEGER AS available_copies,
    (COALESCE(SUM(CASE WHEN t.destination_bucket='issued' THEN t.quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN t.source_bucket='issued' THEN t.quantity ELSE 0 END),0))::INTEGER AS issued_copies,
    (COALESCE(SUM(CASE WHEN t.destination_bucket='damaged' THEN t.quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN t.source_bucket='damaged' THEN t.quantity ELSE 0 END),0))::INTEGER AS damaged_copies,
    (COALESCE(SUM(CASE WHEN t.destination_bucket='lost' THEN t.quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN t.source_bucket='lost' THEN t.quantity ELSE 0 END),0))::INTEGER AS lost_copies,
    (COALESCE(SUM(CASE WHEN t.destination_bucket='withdrawn' THEN t.quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN t.source_bucket='withdrawn' THEN t.quantity ELSE 0 END),0))::INTEGER AS withdrawn_copies,
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('ACQUIRE','ADD_COPIES') THEN t.quantity*t.unit_cost ELSE 0 END),0) AS purchase_value,
    COALESCE(SUM(t.fine_amount),0) AS fines_recorded,
    COALESCE(SUM(t.repair_cost),0) AS repair_expenses,
    COALESCE(SUM(t.loss_amount),0) AS recorded_loss
FROM public.library_books b LEFT JOIN public.library_book_transactions t ON t.book_id=b.id
GROUP BY b.id,b.school_id;

CREATE OR REPLACE VIEW public.library_active_loans WITH (security_invoker=true) AS
SELECT i.id AS issue_id,i.school_id,i.book_id,i.transaction_date AS issue_date,i.due_date,i.borrower_type,i.borrower_id,
       i.borrower_name,i.borrower_number,i.borrower_class,i.borrower_mobile,i.quantity,
       (i.quantity-COALESCE(SUM(c.quantity),0))::INTEGER AS outstanding_quantity,i.created_by_name
FROM public.library_book_transactions i
LEFT JOIN public.library_book_transactions c ON c.related_issue_id=i.id AND c.transaction_type IN ('RETURN','RETURN_DAMAGED','LOST')
WHERE i.transaction_type='ISSUE'
GROUP BY i.id
HAVING i.quantity-COALESCE(SUM(c.quantity),0)>0;

GRANT SELECT,INSERT,UPDATE ON public.library_categories,public.library_books TO authenticated;
GRANT SELECT ON public.library_book_transactions TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.library_book_transactions FROM authenticated;
GRANT SELECT ON public.library_book_balances,public.library_active_loans TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_library_transaction(
    UUID,TEXT,INTEGER,DATE,TEXT,TEXT,NUMERIC,UUID,TEXT,UUID,TEXT,TEXT,TEXT,TEXT,
    DATE,DATE,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT
) TO authenticated;

COMMENT ON TABLE public.library_book_transactions IS 'Immutable library acquisition, circulation and condition ledger.';

COMMIT;
