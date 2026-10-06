// Shared Worklist Permissions and Module Resolution Helper
// Resolves permitted modules cumulatively based on the user's complete role set.
//
// roles.id is now a real UUID (backend migration 013_roles_id_to_uuid.sql).
// ROLE below must stay byte-for-byte identical to backend/config/constants.js's
// ROLE export — this is the single source of truth every other frontend file
// importing a role id should use instead of hardcoding a value.
export const ROLE = Object.freeze({
  SUPER_ADMIN: '6ec4d686-d45b-4799-9ca5-47df8b129b49',
  ADMIN_LEGACY: 'a121824e-e101-4bb9-8d97-e321434c4741',
  CHANGE_ADMIN: '4956462d-8b9d-4cd5-8cbf-427ff031a217',
  PRESPEND_ADMIN: '2e4b2955-17f3-40dd-8a57-0584345c5334',
  TRAVEL_ADMIN: 'ce1292e3-6159-40e9-acd5-97b760881d73',
  CHANGE_MANAGER: '77b8ffd1-61cb-4b95-9269-6dcac2f7781a',
  REQUESTER: '0af92e2d-5a2f-4568-8c65-505bec4535f2',
  CHANGE_IMPLEMENTER: 'e4039e02-9139-4e9e-8e9d-28ae2338116d',
  BOARD: '3417e445-d172-4c97-ab04-e10b8b87b3ce'
});

/**
 * Returns an array of permitted worklist module IDs for the given user.
 * Permitted modules: 'change_request' | 'prespend' | 'travel'
 *
 * Driven directly by the user's real, DB-backed authority
 * (hot_desk_roles.authority, resolved onto user.permissions) instead of
 * hardcoded role-name/role-id matching, so this always matches what the
 * backend actually grants (see worklist/preSpend/travelDesk routes'
 * requirePermission/requireWorklistViewPermission checks) and stays correct
 * if a role's authority is ever edited from Settings > Roles.
 *
 * Category-scoped Change Manager/Implementer assignments (cmCategories /
 * ciCategories) grant 'change_request' access even without the named role,
 * since that access is additive and independent of the primary role.
 */
export function getAllowedWorklistModules(user) {
  if (!user) return [];

  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  const modulesSet = new Set();

  if (
    permissions.includes('changeRequest.worklist.view') ||
    (Array.isArray(user?.cmCategories) && user.cmCategories.length > 0) ||
    (Array.isArray(user?.ciCategories) && user.ciCategories.length > 0)
  ) {
    modulesSet.add('change_request');
  }

  if (permissions.includes('preSpend.worklist.view')) {
    modulesSet.add('prespend');
  }

  if (permissions.includes('travel.worklist.view')) {
    modulesSet.add('travel');
  }

  return Array.from(modulesSet);
}
