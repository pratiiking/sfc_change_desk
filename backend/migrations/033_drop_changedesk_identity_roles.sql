BEGIN;

-- changedesk_identity_roles was a legacy user_key -> role_id mapping table from
-- before the hot_desk_users consolidation. Nothing in the app writes to it
-- anymore; getVotersForCategory() now reads hot_desk_users directly instead.
-- Its remaining rows were frozen as of Sept 2026 and no longer reflect live
-- role assignments, so it's dead, misleading data.
DROP TABLE IF EXISTS public.changedesk_identity_roles;

COMMIT;
