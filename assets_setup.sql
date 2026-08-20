-- Assets Management: school-scoped, transaction-ledger based asset tracking.
-- Run once in the Supabase SQL Editor before opening assets.html.

BEGIN;

CREATE TABLE IF NOT EXISTS public.asset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.asset_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    building TEXT,
    floor TEXT,
    room TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
    asset_code TEXT,
    asset_name TEXT NOT NULL CHECK (length(trim(asset_name)) > 0),
    category_id UUID REFERENCES public.asset_categories(id) ON DELETE SET NULL,
    description TEXT,
    tracking_type TEXT NOT NULL DEFAULT 'quantity' CHECK (tracking_type IN ('quantity', 'individual')),
    serial_number TEXT,
    model_number TEXT,
    barcode TEXT,
    purchase_date DATE,
    purchase_price_per_unit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (purchase_price_per_unit >= 0),
    supplier TEXT,
    invoice_number TEXT,
    location_id UUID REFERENCES public.asset_locations(id) ON DELETE SET NULL,
    building TEXT,
    floor TEXT,
    room TEXT,
    asset_condition TEXT NOT NULL DEFAULT 'Good' CHECK (asset_condition IN ('New', 'Good', 'Fair', 'Poor')),
    useful_life_years NUMERIC(6,2) CHECK (useful_life_years IS NULL OR useful_life_years > 0),
    depreciation_percentage NUMERIC(6,2) CHECK (depreciation_percentage IS NULL OR (depreciation_percentage >= 0 AND depreciation_percentage <= 100)),
    depreciation_method TEXT NOT NULL DEFAULT 'Straight Line' CHECK (depreciation_method = 'Straight Line'),
    warranty_expiry_date DATE,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Archived', 'Deleted')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_assets_school_asset_code
    ON public.assets (school_id, asset_code)
    WHERE asset_code IS NOT NULL AND length(trim(asset_code)) > 0;

CREATE TABLE IF NOT EXISTS public.asset_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        'PURCHASE', 'ADD_QUANTITY', 'DAMAGE', 'SEND_REPAIR',
        'REPAIR_COMPLETED', 'REPAIR_UNREPAIRABLE', 'LOST',
        'DISPOSAL', 'TRANSFER', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'
    )),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source_bucket TEXT CHECK (source_bucket IS NULL OR source_bucket IN ('working', 'damaged', 'repair', 'lost', 'disposed')),
    destination_bucket TEXT CHECK (destination_bucket IS NULL OR destination_bucket IN ('working', 'damaged', 'repair', 'lost', 'disposed')),
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    from_location_id UUID REFERENCES public.asset_locations(id) ON DELETE SET NULL,
    to_location_id UUID REFERENCES public.asset_locations(id) ON DELETE SET NULL,
    incident_type TEXT,
    reason TEXT,
    repairable BOOLEAN,
    estimated_repair_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (estimated_repair_cost >= 0),
    estimated_loss NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (estimated_loss >= 0),
    responsible_person TEXT,
    vendor TEXT,
    expected_return_date DATE,
    repair_status TEXT CHECK (repair_status IS NULL OR repair_status IN ('Awaiting Repair', 'Under Repair', 'Repaired', 'Unrepairable')),
    repair_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (repair_cost >= 0),
    recovery_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (recovery_amount >= 0),
    loss_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (loss_amount >= 0),
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_school_status ON public.assets (school_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_school_category ON public.assets (school_id, category_id);
CREATE INDEX IF NOT EXISTS idx_asset_transactions_asset_date ON public.asset_transactions (asset_id, transaction_date, created_at);
CREATE INDEX IF NOT EXISTS idx_asset_transactions_school_type ON public.asset_transactions (school_id, transaction_type, transaction_date);

CREATE OR REPLACE FUNCTION public.touch_asset_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_assets ON public.assets;
CREATE TRIGGER trg_touch_assets
BEFORE UPDATE ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.touch_asset_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_asset_transaction_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Asset history is immutable. Record a correcting transaction instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_transactions_immutable ON public.asset_transactions;
CREATE TRIGGER trg_asset_transactions_immutable
BEFORE UPDATE OR DELETE ON public.asset_transactions
FOR EACH ROW EXECUTE FUNCTION public.prevent_asset_transaction_mutation();

ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Asset categories tenant access" ON public.asset_categories;
CREATE POLICY "Asset categories tenant access" ON public.asset_categories
FOR ALL TO authenticated
USING (public.is_super_admin() OR school_id = public.get_current_user_school_id())
WITH CHECK (public.is_super_admin() OR school_id = public.get_current_user_school_id());

DROP POLICY IF EXISTS "Asset locations tenant access" ON public.asset_locations;
CREATE POLICY "Asset locations tenant access" ON public.asset_locations
FOR ALL TO authenticated
USING (public.is_super_admin() OR school_id = public.get_current_user_school_id())
WITH CHECK (public.is_super_admin() OR school_id = public.get_current_user_school_id());

DROP POLICY IF EXISTS "Assets tenant access" ON public.assets;
CREATE POLICY "Assets tenant access" ON public.assets
FOR ALL TO authenticated
USING (public.is_super_admin() OR school_id = public.get_current_user_school_id())
WITH CHECK (public.is_super_admin() OR school_id = public.get_current_user_school_id());

DROP POLICY IF EXISTS "Asset transactions tenant read" ON public.asset_transactions;
CREATE POLICY "Asset transactions tenant read" ON public.asset_transactions
FOR SELECT TO authenticated
USING (public.is_super_admin() OR school_id = public.get_current_user_school_id());

DROP POLICY IF EXISTS "Asset transactions tenant insert" ON public.asset_transactions;
CREATE POLICY "Asset transactions tenant insert" ON public.asset_transactions
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin() OR school_id = public.get_current_user_school_id());

-- Atomic ledger writer. It locks the asset and rejects any movement that would
-- take more units from a state than are currently available there.
CREATE OR REPLACE FUNCTION public.record_asset_transaction(
    p_asset_id UUID,
    p_transaction_type TEXT,
    p_quantity INTEGER,
    p_transaction_date DATE DEFAULT CURRENT_DATE,
    p_source_bucket TEXT DEFAULT NULL,
    p_destination_bucket TEXT DEFAULT NULL,
    p_unit_cost NUMERIC DEFAULT 0,
    p_from_location_id UUID DEFAULT NULL,
    p_to_location_id UUID DEFAULT NULL,
    p_incident_type TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_repairable BOOLEAN DEFAULT NULL,
    p_estimated_repair_cost NUMERIC DEFAULT 0,
    p_estimated_loss NUMERIC DEFAULT 0,
    p_responsible_person TEXT DEFAULT NULL,
    p_vendor TEXT DEFAULT NULL,
    p_expected_return_date DATE DEFAULT NULL,
    p_repair_status TEXT DEFAULT NULL,
    p_repair_cost NUMERIC DEFAULT 0,
    p_recovery_amount NUMERIC DEFAULT 0,
    p_loss_amount NUMERIC DEFAULT 0,
    p_notes TEXT DEFAULT NULL,
    p_created_by_name TEXT DEFAULT NULL
)
RETURNS public.asset_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_asset public.assets%ROWTYPE;
    v_result public.asset_transactions%ROWTYPE;
    v_working INTEGER := 0;
    v_damaged INTEGER := 0;
    v_repair INTEGER := 0;
    v_lost INTEGER := 0;
    v_disposed INTEGER := 0;
    v_available INTEGER := 0;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than zero.';
    END IF;

    SELECT * INTO v_asset
    FROM public.assets
    WHERE id = p_asset_id AND status <> 'Deleted'
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Asset was not found or is deleted.'; END IF;
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.'; END IF;
    IF NOT public.is_super_admin() AND v_asset.school_id <> public.get_current_user_school_id() THEN
        RAISE EXCEPTION 'This asset belongs to another school.';
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN destination_bucket = 'working' THEN quantity ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN source_bucket = 'working' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN destination_bucket = 'damaged' THEN quantity ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN source_bucket = 'damaged' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN destination_bucket = 'repair' THEN quantity ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN source_bucket = 'repair' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN destination_bucket = 'lost' THEN quantity ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN source_bucket = 'lost' THEN quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN destination_bucket = 'disposed' THEN quantity ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN source_bucket = 'disposed' THEN quantity ELSE 0 END), 0)
    INTO v_working, v_damaged, v_repair, v_lost, v_disposed
    FROM public.asset_transactions
    WHERE asset_id = p_asset_id;

    IF p_source_bucket IS NOT NULL THEN
        v_available := CASE p_source_bucket
            WHEN 'working' THEN v_working
            WHEN 'damaged' THEN v_damaged
            WHEN 'repair' THEN v_repair
            WHEN 'lost' THEN v_lost
            WHEN 'disposed' THEN v_disposed
            ELSE 0
        END;
        IF p_quantity > v_available THEN
            RAISE EXCEPTION 'Only % unit(s) are available in the % state.', v_available, p_source_bucket;
        END IF;
    END IF;

    IF p_transaction_type IN ('PURCHASE', 'ADD_QUANTITY', 'ADJUSTMENT_IN')
       AND (p_source_bucket IS NOT NULL OR p_destination_bucket <> 'working') THEN
        RAISE EXCEPTION 'Quantity additions must enter the working state.';
    END IF;

    IF p_transaction_type = 'DAMAGE'
       AND (p_source_bucket IS DISTINCT FROM 'working' OR p_destination_bucket IS DISTINCT FROM 'damaged') THEN
        RAISE EXCEPTION 'Damage must move units from working to damaged.';
    END IF;
    IF p_transaction_type = 'SEND_REPAIR'
       AND (p_source_bucket IS DISTINCT FROM 'damaged' OR p_destination_bucket IS DISTINCT FROM 'repair') THEN
        RAISE EXCEPTION 'Repair intake must move units from damaged to repair.';
    END IF;
    IF p_transaction_type = 'REPAIR_COMPLETED'
       AND (p_source_bucket IS DISTINCT FROM 'repair' OR p_destination_bucket IS DISTINCT FROM 'working') THEN
        RAISE EXCEPTION 'A completed repair must move units from repair to working.';
    END IF;
    IF p_transaction_type = 'REPAIR_UNREPAIRABLE'
       AND (p_source_bucket IS DISTINCT FROM 'repair' OR p_destination_bucket IS DISTINCT FROM 'damaged') THEN
        RAISE EXCEPTION 'An unrepairable unit must move from repair back to damaged.';
    END IF;
    IF p_transaction_type = 'LOST'
       AND (p_source_bucket NOT IN ('working', 'damaged', 'repair') OR p_destination_bucket IS DISTINCT FROM 'lost') THEN
        RAISE EXCEPTION 'A loss must move an active unit to lost.';
    END IF;
    IF p_transaction_type = 'DISPOSAL'
       AND (p_source_bucket NOT IN ('working', 'damaged', 'repair') OR p_destination_bucket IS DISTINCT FROM 'disposed') THEN
        RAISE EXCEPTION 'A disposal must move an active unit to disposed.';
    END IF;
    IF p_transaction_type = 'ADJUSTMENT_OUT'
       AND (p_source_bucket NOT IN ('working', 'damaged', 'repair') OR p_destination_bucket IS NOT NULL) THEN
        RAISE EXCEPTION 'An outward adjustment must remove an active unit.';
    END IF;

    IF p_transaction_type = 'TRANSFER'
       AND (p_from_location_id IS NULL OR p_to_location_id IS NULL OR p_from_location_id = p_to_location_id) THEN
        RAISE EXCEPTION 'A transfer needs two different locations.';
    END IF;
    IF p_transaction_type = 'TRANSFER'
       AND (p_source_bucket IS DISTINCT FROM 'working' OR p_destination_bucket IS DISTINCT FROM 'working') THEN
        RAISE EXCEPTION 'A transfer must preserve the working quantity.';
    END IF;

    INSERT INTO public.asset_transactions (
        school_id, asset_id, transaction_type, quantity, transaction_date,
        source_bucket, destination_bucket, unit_cost, from_location_id, to_location_id,
        incident_type, reason, repairable, estimated_repair_cost, estimated_loss,
        responsible_person, vendor, expected_return_date, repair_status, repair_cost,
        recovery_amount, loss_amount, notes, created_by, created_by_name
    ) VALUES (
        v_asset.school_id, p_asset_id, p_transaction_type, p_quantity, COALESCE(p_transaction_date, CURRENT_DATE),
        p_source_bucket, p_destination_bucket, COALESCE(p_unit_cost, 0), p_from_location_id, p_to_location_id,
        p_incident_type, p_reason, p_repairable, COALESCE(p_estimated_repair_cost, 0), COALESCE(p_estimated_loss, 0),
        p_responsible_person, p_vendor, p_expected_return_date, p_repair_status, COALESCE(p_repair_cost, 0),
        COALESCE(p_recovery_amount, 0), COALESCE(p_loss_amount, 0), p_notes, auth.uid(), p_created_by_name
    ) RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE VIEW public.asset_balances
WITH (security_invoker = true)
AS
SELECT
    a.id AS asset_id,
    a.school_id,
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('PURCHASE', 'ADD_QUANTITY', 'ADJUSTMENT_IN') THEN t.quantity ELSE 0 END), 0)::INTEGER AS original_quantity,
    (COALESCE(SUM(CASE WHEN t.destination_bucket = 'working' THEN t.quantity ELSE 0 END), 0)
     - COALESCE(SUM(CASE WHEN t.source_bucket = 'working' THEN t.quantity ELSE 0 END), 0))::INTEGER AS working_quantity,
    (COALESCE(SUM(CASE WHEN t.destination_bucket = 'damaged' THEN t.quantity ELSE 0 END), 0)
     - COALESCE(SUM(CASE WHEN t.source_bucket = 'damaged' THEN t.quantity ELSE 0 END), 0))::INTEGER AS damaged_quantity,
    (COALESCE(SUM(CASE WHEN t.destination_bucket = 'repair' THEN t.quantity ELSE 0 END), 0)
     - COALESCE(SUM(CASE WHEN t.source_bucket = 'repair' THEN t.quantity ELSE 0 END), 0))::INTEGER AS repair_quantity,
    (COALESCE(SUM(CASE WHEN t.destination_bucket = 'lost' THEN t.quantity ELSE 0 END), 0)
     - COALESCE(SUM(CASE WHEN t.source_bucket = 'lost' THEN t.quantity ELSE 0 END), 0))::INTEGER AS lost_quantity,
    (COALESCE(SUM(CASE WHEN t.destination_bucket = 'disposed' THEN t.quantity ELSE 0 END), 0)
     - COALESCE(SUM(CASE WHEN t.source_bucket = 'disposed' THEN t.quantity ELSE 0 END), 0))::INTEGER AS disposed_quantity,
    COALESCE(SUM(CASE WHEN t.transaction_type IN ('PURCHASE', 'ADD_QUANTITY', 'ADJUSTMENT_IN') THEN t.quantity * t.unit_cost ELSE 0 END), 0) AS total_purchase_cost,
    COALESCE(SUM(t.repair_cost), 0) AS repair_expenses,
    COALESCE(SUM(t.loss_amount), 0) AS recorded_loss
FROM public.assets a
LEFT JOIN public.asset_transactions t ON t.asset_id = a.id
GROUP BY a.id, a.school_id;

CREATE OR REPLACE VIEW public.asset_damage_records WITH (security_invoker = true) AS
SELECT * FROM public.asset_transactions WHERE transaction_type IN ('DAMAGE', 'LOST');
CREATE OR REPLACE VIEW public.asset_repairs WITH (security_invoker = true) AS
SELECT * FROM public.asset_transactions WHERE transaction_type IN ('SEND_REPAIR', 'REPAIR_COMPLETED', 'REPAIR_UNREPAIRABLE');
CREATE OR REPLACE VIEW public.asset_disposals WITH (security_invoker = true) AS
SELECT * FROM public.asset_transactions WHERE transaction_type = 'DISPOSAL';
CREATE OR REPLACE VIEW public.asset_transfers WITH (security_invoker = true) AS
SELECT * FROM public.asset_transactions WHERE transaction_type = 'TRANSFER';

GRANT SELECT, INSERT, UPDATE ON public.asset_categories, public.asset_locations, public.assets TO authenticated;
GRANT SELECT ON public.asset_transactions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.asset_transactions FROM authenticated;
GRANT SELECT ON public.asset_balances, public.asset_damage_records, public.asset_repairs, public.asset_disposals, public.asset_transfers TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_asset_transaction(
    UUID, TEXT, INTEGER, DATE, TEXT, TEXT, NUMERIC, UUID, UUID, TEXT, TEXT,
    BOOLEAN, NUMERIC, NUMERIC, TEXT, TEXT, DATE, TEXT, NUMERIC, NUMERIC,
    NUMERIC, TEXT, TEXT
) TO authenticated;

COMMENT ON TABLE public.asset_transactions IS 'Immutable asset movement ledger; quantities are calculated, never overwritten.';
COMMENT ON VIEW public.asset_balances IS 'Current asset quantities and ledger totals derived from immutable transactions.';

COMMIT;
