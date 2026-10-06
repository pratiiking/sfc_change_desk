BEGIN;

-- pre_spend_requests.location was the employee's work location, auto-filled
-- at creation and never read back anywhere (no listing, email, or export
-- references it) -- unlike change_requests.location, which genuinely drives
-- the "Requests by Location" dashboard breakdown. Now that employeeId is a
-- real FK to employees, the employee's location is reachable via
-- employeeRecord.location if ever needed, making this stored copy dead and
-- redundant.
ALTER TABLE public.pre_spend_requests DROP COLUMN IF EXISTS location;

COMMIT;
