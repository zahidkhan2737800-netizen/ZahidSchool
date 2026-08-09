-- Add manual ordering and reversible active/inactive status to classes.
-- Run this once in the Supabase SQL Editor.

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS display_order INTEGER,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Give existing classes a stable positive order based on their current names/sections.
WITH ordered_classes AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY class_name, section, created_at, id) AS new_order
    FROM public.classes
)
UPDATE public.classes AS classes
SET display_order = ordered_classes.new_order
FROM ordered_classes
WHERE classes.id = ordered_classes.id
  AND classes.display_order IS NULL;

ALTER TABLE public.classes
    ALTER COLUMN display_order SET NOT NULL;

ALTER TABLE public.classes
    DROP CONSTRAINT IF EXISTS classes_display_order_check;

ALTER TABLE public.classes
    ADD CONSTRAINT classes_display_order_check
    CHECK (display_order > 0);

CREATE INDEX IF NOT EXISTS idx_classes_active_order
    ON public.classes (is_active, display_order, class_name, section);

COMMENT ON COLUMN public.classes.display_order IS
    'Positive integer used to control class display order.';

COMMENT ON COLUMN public.classes.is_active IS
    'FALSE hides/deactivates a class without deleting it; it can be reactivated later.';
