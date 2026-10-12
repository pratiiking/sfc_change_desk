BEGIN;

-- hot_desk_users.status only ever had two real states in practice:
-- 'Active' (set on create) and 'Inactive' (set on deactivate). 'Suspended'
-- was read in identityResolver.service.js but never actually written
-- anywhere. There is also no "reactivate" UI anywhere in the product --
-- deactivation was a one-way action in practice already.
--
-- Deactivation now means deleting the row outright (see
-- deleteSettingsUserService), not flagging it -- so once this column is
-- gone, a row's mere existence means "active" by definition. The 6 rows
-- currently marked 'Inactive' must be deleted now, in this same migration,
-- not left behind: if the column were simply dropped without first
-- removing them, they would silently regain privileged access (presence
-- alone becomes the active signal going forward).
--
-- category_role_assignments rows for these users cascade-delete
-- automatically (ON DELETE CASCADE, migration 024) -- verified zero
-- currently reference these 6 ids anyway (already cleared by the old
-- deactivation flow). change_request_approvals.approver_id is NOT yet
-- anchored on employees.emp_id the way audit_logs.actor_id and
-- PreSpendApproval/TravelApproval.deciderId are -- 12 historical approval
-- rows reference these 6 hot_desk_users ids directly and will become
-- unresolvable (their decider's name/identity can no longer be looked up)
-- once these rows are gone. This is a known, accepted consequence, not an
-- oversight -- see session notes.
DELETE FROM public.hot_desk_users WHERE status = 'Inactive';

ALTER TABLE public.hot_desk_users DROP COLUMN status;

COMMIT;
