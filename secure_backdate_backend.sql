-- =========================================================================
-- SECURE BACKDATE PAYMENT BACKEND (FIXED)
-- Separate functions because 'receipts' table doesn't have 'payment_date'
-- =========================================================================

-- 1. Transactions Trigger Function
CREATE OR REPLACE FUNCTION check_backdate_permission_transactions()
RETURNS TRIGGER AS $$
DECLARE
    current_role_name TEXT;
    has_permission BOOLEAN;
BEGIN
    IF (NEW.payment_date IS NOT NULL AND NEW.payment_date != (TIMEZONE('Asia/Karachi', CURRENT_TIMESTAMP)::date)) 
       OR (NEW.created_at IS NOT NULL AND NEW.created_at::date != (TIMEZONE('Asia/Karachi', CURRENT_TIMESTAMP)::date)) THEN
        
        SELECT r.role_name INTO current_role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid();
        
        IF current_role_name IN ('admin', 'super_admin') THEN
            RETURN NEW;
        END IF;

        SELECT p.can_view INTO has_permission
        FROM permissions p
        JOIN roles r ON p.role_id = r.id
        JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() 
          AND p.page_key = 'allow_backdate_payment.html';

        IF has_permission IS NOT TRUE THEN
            RAISE EXCEPTION 'Access Denied: You do not have permission to backdate payments.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Receipts Trigger Function
CREATE OR REPLACE FUNCTION check_backdate_permission_receipts()
RETURNS TRIGGER AS $$
DECLARE
    current_role_name TEXT;
    has_permission BOOLEAN;
BEGIN
    IF (NEW.created_at IS NOT NULL AND NEW.created_at::date != (TIMEZONE('Asia/Karachi', CURRENT_TIMESTAMP)::date)) THEN
        
        SELECT r.role_name INTO current_role_name
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid();
        
        IF current_role_name IN ('admin', 'super_admin') THEN
            RETURN NEW;
        END IF;

        SELECT p.can_view INTO has_permission
        FROM permissions p
        JOIN roles r ON p.role_id = r.id
        JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() 
          AND p.page_key = 'allow_backdate_payment.html';

        IF has_permission IS NOT TRUE THEN
            RAISE EXCEPTION 'Access Denied: You do not have permission to backdate payments.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Attach triggers
DROP TRIGGER IF EXISTS trigger_check_backdate_transactions ON transactions;
CREATE TRIGGER trigger_check_backdate_transactions
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION check_backdate_permission_transactions();

DROP TRIGGER IF EXISTS trigger_check_backdate_receipts ON receipts;
CREATE TRIGGER trigger_check_backdate_receipts
BEFORE INSERT OR UPDATE ON receipts
FOR EACH ROW
EXECUTE FUNCTION check_backdate_permission_receipts();
