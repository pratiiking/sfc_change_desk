// ────────────────────────────────────────────────────────────────
// Central Application Constants & Dictionaries
//
// roles.id is now a real UUID (see migration 013_roles_id_to_uuid.sql).
// ROLE is the single source of truth for those UUIDs — every other file
// that needs to compare against a role imports from here instead of
// hardcoding a value, so the DB and the application code can never drift.
// The legacy slugs ('role-1', 'role-2-change', ...) only still exist as
// ROLE_LOOKUP_MAP *keys* below, so anything that still has an old slug
// lying around (a stale cache, an old bookmark, a draft payload) still
// resolves to the correct current identity.
// ────────────────────────────────────────────────────────────────

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

export const ROLE_ID_TO_NAME = {
  [ROLE.SUPER_ADMIN]: 'Super Admin',
  [ROLE.CHANGE_ADMIN]: 'Change Desk Admin',
  [ROLE.PRESPEND_ADMIN]: 'Pre-Spend Admin',
  [ROLE.TRAVEL_ADMIN]: 'Travel Desk Admin',
  [ROLE.ADMIN_LEGACY]: 'Change Desk Admin',
  [ROLE.CHANGE_MANAGER]: 'Change Manager',
  [ROLE.REQUESTER]: 'Requester',
  [ROLE.CHANGE_IMPLEMENTER]: 'Change Implementer',
  [ROLE.BOARD]: 'Board Member'
};

export const APP_ROLE_MAP = {
  [ROLE.SUPER_ADMIN]: 'SUPER_ADMIN',
  [ROLE.CHANGE_ADMIN]: 'CHANGE_ADMIN',
  [ROLE.PRESPEND_ADMIN]: 'PRESPEND_ADMIN',
  [ROLE.TRAVEL_ADMIN]: 'TRAVEL_ADMIN',
  [ROLE.ADMIN_LEGACY]: 'CHANGE_ADMIN',
  [ROLE.CHANGE_MANAGER]: 'CHANGE_MANAGER',
  [ROLE.REQUESTER]: 'REQUESTER',
  [ROLE.CHANGE_IMPLEMENTER]: 'CHANGE_IMPLEMENTER',
  [ROLE.BOARD]: 'BOARD'
};

export const ROLE_LOOKUP_MAP = {
  'super admin': { roleId: ROLE.SUPER_ADMIN, roleName: 'Super Admin' },
  'change desk admin': { roleId: ROLE.CHANGE_ADMIN, roleName: 'Change Desk Admin' },
  'change admin': { roleId: ROLE.CHANGE_ADMIN, roleName: 'Change Desk Admin' },
  'pre-spend admin': { roleId: ROLE.PRESPEND_ADMIN, roleName: 'Pre-Spend Admin' },
  'prespend admin': { roleId: ROLE.PRESPEND_ADMIN, roleName: 'Pre-Spend Admin' },
  'travel desk admin': { roleId: ROLE.TRAVEL_ADMIN, roleName: 'Travel Desk Admin' },
  'travel admin': { roleId: ROLE.TRAVEL_ADMIN, roleName: 'Travel Desk Admin' },
  'admin': { roleId: ROLE.CHANGE_ADMIN, roleName: 'Change Desk Admin' },
  'change manager': { roleId: ROLE.CHANGE_MANAGER, roleName: 'Change Manager' },
  'requester': { roleId: ROLE.REQUESTER, roleName: 'Requester' },
  'change implementer': { roleId: ROLE.CHANGE_IMPLEMENTER, roleName: 'Change Implementer' },
  'board': { roleId: ROLE.BOARD, roleName: 'Board Member' },
  'board member': { roleId: ROLE.BOARD, roleName: 'Board Member' },
  // Legacy slug ids — kept as lookup keys only, so anything still holding
  // an old value (a stale cache, an old bookmark) still resolves correctly.
  'role-1': { roleId: ROLE.SUPER_ADMIN, roleName: 'Super Admin' },
  'role-2-change': { roleId: ROLE.CHANGE_ADMIN, roleName: 'Change Desk Admin' },
  'role-2-prespend': { roleId: ROLE.PRESPEND_ADMIN, roleName: 'Pre-Spend Admin' },
  'role-2-travel': { roleId: ROLE.TRAVEL_ADMIN, roleName: 'Travel Desk Admin' },
  'role-2': { roleId: ROLE.CHANGE_ADMIN, roleName: 'Change Desk Admin' },
  'role-3': { roleId: ROLE.CHANGE_MANAGER, roleName: 'Change Manager' },
  'role-4': { roleId: ROLE.REQUESTER, roleName: 'Requester' },
  'role-5': { roleId: ROLE.CHANGE_IMPLEMENTER, roleName: 'Change Implementer' },
  'role-6': { roleId: ROLE.BOARD, roleName: 'Board Member' },
  // New UUIDs also round-trip through the same lookup.
  [ROLE.SUPER_ADMIN]: { roleId: ROLE.SUPER_ADMIN, roleName: 'Super Admin' },
  [ROLE.CHANGE_ADMIN]: { roleId: ROLE.CHANGE_ADMIN, roleName: 'Change Desk Admin' },
  [ROLE.PRESPEND_ADMIN]: { roleId: ROLE.PRESPEND_ADMIN, roleName: 'Pre-Spend Admin' },
  [ROLE.TRAVEL_ADMIN]: { roleId: ROLE.TRAVEL_ADMIN, roleName: 'Travel Desk Admin' },
  [ROLE.ADMIN_LEGACY]: { roleId: ROLE.CHANGE_ADMIN, roleName: 'Change Desk Admin' },
  [ROLE.CHANGE_MANAGER]: { roleId: ROLE.CHANGE_MANAGER, roleName: 'Change Manager' },
  [ROLE.REQUESTER]: { roleId: ROLE.REQUESTER, roleName: 'Requester' },
  [ROLE.CHANGE_IMPLEMENTER]: { roleId: ROLE.CHANGE_IMPLEMENTER, roleName: 'Change Implementer' },
  [ROLE.BOARD]: { roleId: ROLE.BOARD, roleName: 'Board Member' }
};

export const normalizeRole = (roleInput) => {
  if (!roleInput) return { roleId: ROLE.REQUESTER, roleName: 'Requester' };
  const key = String(roleInput).trim().toLowerCase();
  return ROLE_LOOKUP_MAP[key] || {
    roleId: roleInput,
    roleName: ROLE_ID_TO_NAME[roleInput] || 'Requester'
  };
};

export const RESTRICTED_ACTIONS = [
  { action: 'create an email id', subcategoryId: 'subcat-o365-mb' },
  { action: 'disable / revoke mailbox', subcategoryId: 'subcat-o365-mb' },
  { action: 'request m365 license', subcategoryId: 'subcat-o365-lic' },
  { action: 'remove m365 license', subcategoryId: 'subcat-o365-lic' },
  { action: 'request for procurement of laptop / desktop', subcategoryId: 'subcat-asset-dev' },
  { action: 'repair request', subcategoryId: 'subcat-asset-dev' },
  { action: 'dispose request', subcategoryId: 'subcat-asset-dev' },
  { action: 'request for procurement of it hardware / accessories', subcategoryId: 'subcat-asset-hw' },
  { action: 'repair request', subcategoryId: 'subcat-asset-hw' },
  { action: 'dispose request', subcategoryId: 'subcat-asset-hw' },
  { action: 'request physical access', subcategoryId: 'subcat-acc-phys' },
  { action: 'revoke physical access', subcategoryId: 'subcat-acc-phys' }
];

export const isRestrictedAction = (actionRequired, subcategoryId) => {
  if (!actionRequired || !subcategoryId) return false;
  const target = String(actionRequired).trim().toLowerCase();
  return RESTRICTED_ACTIONS.some(
    (rule) => rule.action === target && rule.subcategoryId === subcategoryId
  );
};
