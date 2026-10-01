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
 * Rules:
 * - Super Admin (ROLE.SUPER_ADMIN / isSuperAdmin): all three ['change_request', 'prespend', 'travel']
 * - Board User (role-board / isBoardMember / ROLE.BOARD): all three ['change_request', 'prespend', 'travel']
 * - Change Request: ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY, ROLE.CHANGE_ADMIN, ROLE.CHANGE_MANAGER, ROLE.CHANGE_IMPLEMENTER, or cmCategories / ciCategories assigned
 * - Pre-Spend Request: ROLE.SUPER_ADMIN, ROLE.PRESPEND_ADMIN, isPreSpendAdmin, ROLE.BOARD, role-board
 * - Travel Desk: ROLE.SUPER_ADMIN, ROLE.TRAVEL_ADMIN, isTravelAdmin, ROLE.BOARD, role-board
 * - Independent Set resolution: Multiple roles accumulate without cancelling each other.
 * - No fallback: Returns empty array if user has no approver/admin roles.
 */
export function getAllowedWorklistModules(user) {
  if (!user) return [];

  const roleName = String(user?.role || '').toLowerCase();
  const roleId = String(user?.roleId || '');
  const rawRolesList = Array.isArray(user?.roles) ? user.roles : [];
  const rawRoleIds = Array.isArray(user?.rolesList) ? user.rolesList : [];

  const allRoleStrings = [
    roleName,
    roleId,
    ...rawRolesList.map(r => (typeof r === 'string' ? r : r.roleName || r.name || r.roleId || '')).map(s => String(s).toLowerCase()),
    ...rawRoleIds.map(r => String(r).toLowerCase())
  ];

  const hasRole = (...targets) => {
    return targets.some(target => {
      const t = target.toLowerCase();
      return allRoleStrings.some(r => r === t || r.includes(t));
    });
  };

  const isSuperAdmin = Boolean(
    user?.isSuperAdmin ||
    roleId === ROLE.SUPER_ADMIN ||
    rawRoleIds.includes(ROLE.SUPER_ADMIN) ||
    hasRole(ROLE.SUPER_ADMIN, 'super admin', 'superadmin', 'changedesk super admin')
  );

  const isBoardUser = Boolean(
    user?.isBoardMember ||
    roleId === 'role-board' ||
    roleId === ROLE.BOARD ||
    rawRoleIds.includes(ROLE.BOARD) ||
    rawRoleIds.includes('role-board') ||
    hasRole('board', 'role-board', ROLE.BOARD)
  );

  if (isSuperAdmin) {
    return ['change_request', 'prespend', 'travel'];
  }

  const modulesSet = new Set();

  if (isBoardUser) {
    modulesSet.add('prespend');
    modulesSet.add('travel');
  }

  // 1. Change Request Module Checks
  const isChangeAdmin = Boolean(
    user?.isChangeAdmin ||
    roleId === ROLE.ADMIN_LEGACY ||
    roleId === ROLE.CHANGE_ADMIN ||
    rawRoleIds.includes(ROLE.ADMIN_LEGACY) ||
    rawRoleIds.includes(ROLE.CHANGE_ADMIN) ||
    hasRole(ROLE.CHANGE_ADMIN, 'change desk admin', 'change admin')
  );

  const isChangeManager = Boolean(
    user?.isChangeManager ||
    roleId === ROLE.CHANGE_MANAGER ||
    rawRoleIds.includes(ROLE.CHANGE_MANAGER) ||
    hasRole(ROLE.CHANGE_MANAGER, 'manager', 'change manager') ||
    (Array.isArray(user?.cmCategories) && user.cmCategories.length > 0)
  );

  const isChangeImplementer = Boolean(
    user?.isChangeImplementer ||
    roleId === ROLE.CHANGE_IMPLEMENTER ||
    rawRoleIds.includes(ROLE.CHANGE_IMPLEMENTER) ||
    hasRole(ROLE.CHANGE_IMPLEMENTER, 'implementer', 'change implementer') ||
    (Array.isArray(user?.ciCategories) && user.ciCategories.length > 0)
  );

  if (isChangeAdmin || isChangeManager || isChangeImplementer) {
    modulesSet.add('change_request');
  }

  // 2. Pre-Spend Module Checks
  const isPreSpendAdmin = Boolean(
    user?.isPreSpendAdmin ||
    roleId === ROLE.PRESPEND_ADMIN ||
    rawRoleIds.includes(ROLE.PRESPEND_ADMIN) ||
    hasRole(ROLE.PRESPEND_ADMIN, 'prespend admin', 'pre-spend admin', 'spend admin')
  );

  if (isPreSpendAdmin) {
    modulesSet.add('prespend');
  }

  // 3. Travel Desk Module Checks
  const isTravelAdmin = Boolean(
    user?.isTravelAdmin ||
    roleId === ROLE.TRAVEL_ADMIN ||
    rawRoleIds.includes(ROLE.TRAVEL_ADMIN) ||
    hasRole(ROLE.TRAVEL_ADMIN, 'travel admin', 'travel desk admin')
  );

  if (isTravelAdmin) {
    modulesSet.add('travel');
  }

  return Array.from(modulesSet);
}
