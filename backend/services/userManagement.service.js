import { Op } from 'sequelize';
import { sequelize, Role, CatalogCategory, ChangeManagerCategory, ChangeImplementerCategory } from '../models/index.js';
import { Employee } from '../models/Employee.js';
import { UserS8 } from '../models/UserS8.js';
import { IdentityResolver } from './identityResolver.service.js';
import { addAuditLog } from './auditLog.service.js';
import { normalizeRole, ROLE } from '../config/constants.js';

// hot_desk_roles.rank: lower number = higher authority. Cached briefly since
// it's read on every settings write but essentially never changes.
let roleRankCache = null;
let roleRankCacheAt = 0;
const ROLE_RANK_CACHE_TTL_MS = 30_000;

const getRoleRankMap = async () => {
  if (roleRankCache && Date.now() - roleRankCacheAt < ROLE_RANK_CACHE_TTL_MS) return roleRankCache;
  const rows = await Role.findAll({ attributes: ['id', 'rank'], raw: true });
  roleRankCache = new Map(rows.map((r) => [r.id, r.rank]));
  roleRankCacheAt = Date.now();
  return roleRankCache;
};

// Unranked roles (e.g. the code-only 'role-employee' sentinel) are treated as
// the lowest possible rank so a real, ranked actor can always manage them.
const rankOf = async (roleId) => {
  const map = await getRoleRankMap();
  return map.get(roleId) ?? Infinity;
};

// Throws if the actor isn't strictly senior to the target's *current* role —
// this also naturally blocks acting on yourself, since your rank is never
// strictly senior to your own.
const assertCanManage = async (actorRoleId, targetRoleId, action) => {
  const [actorRank, targetRank] = await Promise.all([rankOf(actorRoleId), rankOf(targetRoleId)]);
  if (actorRank >= targetRank) {
    const err = new Error(`You cannot ${action} a user at or above your own role level.`);
    err.statusCode = 403;
    throw err;
  }
};

// Throws if the actor is trying to grant a role at or above their own rank.
const assertCanGrant = async (actorRoleId, newRoleId) => {
  const [actorRank, newRank] = await Promise.all([rankOf(actorRoleId), rankOf(newRoleId)]);
  if (actorRank >= newRank) {
    const err = new Error('You cannot assign a role at or above your own role level.');
    err.statusCode = 403;
    throw err;
  }
};

const findUserS8ByKey = async (userKey) => {
  const rawId = String(userKey).replace(/^(S8-|EMP-|usr-)/, '');
  if (/^\d+$/.test(rawId)) {
    const user = await UserS8.findByPk(Number(rawId));
    if (user) return user;
  }
  if (String(userKey).includes('@')) {
    return UserS8.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), String(userKey).trim().toLowerCase())
    });
  }
  return null;
};

// ---------- Category Assignments for Change Managers ----------

// userId is always a hot_desk_users.id now (category_role_assignments.user_id
// is a real FK to it) — no more EMP-/S8- alias-prefix forms to normalize.
const toHotDeskUserId = (userId) => {
  const n = Number(String(userId).replace(/^(S8-|EMP-|usr-)/, ''));
  return Number.isNaN(n) ? null : n;
};

export const getChangeManagerCategoriesService = async (userId) => {
  const where = userId ? { userId: toHotDeskUserId(userId) } : {};
  const assignments = await ChangeManagerCategory.findAll({ where, raw: true });
  return assignments.map((a) => ({ userId: a.userId, categoryId: a.categoryId }));
};

export const updateChangeManagerCategoriesService = async (userId, categoryIds = []) => {
  const id = toHotDeskUserId(userId);
  const current = await ChangeManagerCategory.findAll({ where: { userId: id } });
  const currentCatIds = current.map((c) => c.categoryId);

  const toAdd = categoryIds.filter((cid) => !currentCatIds.includes(cid));
  const toRemove = currentCatIds.filter((cid) => !categoryIds.includes(cid));

  if (toRemove.length > 0) {
    await ChangeManagerCategory.destroy({
      where: { userId: id, categoryId: { [Op.in]: toRemove } }
    });
  }

  for (const cid of toAdd) {
    const cmcId = `cmc-${id}-${cid}`;
    await ChangeManagerCategory.upsert({ id: cmcId, userId: id, categoryId: cid }).catch(() => {});
  }

  return getChangeManagerCategoriesService(userId);
};

// ---------- Category Assignments for Change Implementers ----------

export const getChangeImplementerCategoriesService = async (userId) => {
  const where = userId ? { userId: toHotDeskUserId(userId) } : {};
  const assignments = await ChangeImplementerCategory.findAll({ where, raw: true });
  return assignments.map((a) => ({ userId: a.userId, categoryId: a.categoryId }));
};

export const updateChangeImplementerCategoriesService = async (userId, categoryIds = []) => {
  const id = toHotDeskUserId(userId);
  const current = await ChangeImplementerCategory.findAll({ where: { userId: id } });
  const currentCatIds = current.map((c) => c.categoryId);

  const toAdd = categoryIds.filter((cid) => !currentCatIds.includes(cid));
  const toRemove = currentCatIds.filter((cid) => !categoryIds.includes(cid));

  if (toRemove.length > 0) {
    await ChangeImplementerCategory.destroy({
      where: { userId: id, categoryId: { [Op.in]: toRemove } }
    });
  }

  for (const cid of toAdd) {
    const cicId = `cic-${id}-${cid}`;
    await ChangeImplementerCategory.upsert({ id: cicId, userId: id, categoryId: cid }).catch(() => {});
  }

  IdentityResolver.clearCache();
  return getChangeImplementerCategoriesService(userId);
};

// ---------- Approver & Implementer Email Resolvers ----------

export const getApproverEmails = async (categoryNameOrId = null) => {
  const emails = [];
  let targetCategoryId = null;

  if (categoryNameOrId) {
    const cat = await CatalogCategory.findOne({
      where: {
        [Op.or]: [
          { id: categoryNameOrId },
          sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), String(categoryNameOrId).toLowerCase().trim())
        ]
      }
    });
    if (cat) {
      targetCategoryId = cat.id;
    } else {
      targetCategoryId = categoryNameOrId;
    }
  }

  if (targetCategoryId) {
    const cmAssignments = await ChangeManagerCategory.findAll({
      where: { categoryId: targetCategoryId },
      raw: true
    });

    for (const cm of cmAssignments) {
      const res = await IdentityResolver.resolveByKey(cm.userId);
      if (res.status === 'SUCCESS' && res.identity.email) {
        emails.push(res.identity.email.trim());
      }
    }
  }

  const uniqueEmails = Array.from(new Set(emails.filter(Boolean)));
  if (uniqueEmails.length > 0) {
    return uniqueEmails;
  }

  const admins = await UserS8.findAll({
    where: {
      roleId: { [Op.in]: [ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY, ROLE.CHANGE_ADMIN] },
      status: 'Active'
    },
    raw: true
  });

  return Array.from(new Set(admins.map(a => (a.email || '').trim().toLowerCase()).filter(Boolean)));
};

export const getImplementerEmails = async (categoryNameOrId = null) => {
  const emails = [];
  let targetCategoryId = null;

  if (categoryNameOrId) {
    const cat = await CatalogCategory.findOne({
      where: {
        [Op.or]: [
          { id: categoryNameOrId },
          sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), String(categoryNameOrId).toLowerCase().trim())
        ]
      }
    });
    if (cat) {
      targetCategoryId = cat.id;
    } else {
      targetCategoryId = categoryNameOrId;
    }
  }

  if (targetCategoryId) {
    const ciAssignments = await ChangeImplementerCategory.findAll({
      where: { categoryId: targetCategoryId },
      raw: true
    });

    for (const ci of ciAssignments) {
      const res = await IdentityResolver.resolveByKey(ci.userId);
      if (res.status === 'SUCCESS' && res.identity.email) {
        emails.push(res.identity.email.trim());
      }
    }
  }

  const uniqueEmails = Array.from(new Set(emails.filter(Boolean)));
  if (uniqueEmails.length > 0) {
    return uniqueEmails;
  }

  const implementers = await UserS8.findAll({
    where: {
      roleId: { [Op.in]: [ROLE.CHANGE_IMPLEMENTER, ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY, ROLE.CHANGE_ADMIN] },
      status: 'Active'
    },
    raw: true
  });

  return Array.from(new Set(implementers.map(i => (i.email || '').trim().toLowerCase()).filter(Boolean)));
};

export const getBoardMemberEmails = async () => {
  const users = await UserS8.findAll({
    where: { status: 'Active', roleId: ROLE.BOARD },
    raw: true
  });
  return Array.from(new Set(users.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean)));
};

export const getTravelDeskApproverEmails = async (isShortNotice = false) => {
  const roleIds = isShortNotice ? [ROLE.TRAVEL_ADMIN, ROLE.BOARD] : [ROLE.TRAVEL_ADMIN];
  const users = await UserS8.findAll({
    where: { status: 'Active', roleId: { [Op.in]: roleIds } },
    raw: true
  });

  const unique = Array.from(new Set(users.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean)));
  if (unique.length > 0) return unique;

  // Fallback to board members if no travel admin found
  return getBoardMemberEmails();
};

export const getPreSpendAdminEmails = async () => {
  const users = await UserS8.findAll({
    where: { status: 'Active', roleId: ROLE.PRESPEND_ADMIN },
    raw: true
  });
  return Array.from(new Set(users.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean)));
};

export const getTravelAdminEmails = async () => {
  const users = await UserS8.findAll({
    where: { status: 'Active', roleId: ROLE.TRAVEL_ADMIN },
    raw: true
  });
  return Array.from(new Set(users.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean)));
};

export const getPreSpendApproverEmails = async (isBoardRequired = false) => {
  const roleIds = isBoardRequired ? [ROLE.PRESPEND_ADMIN, ROLE.BOARD] : [ROLE.PRESPEND_ADMIN];
  const users = await UserS8.findAll({
    where: { status: 'Active', roleId: { [Op.in]: roleIds } },
    raw: true
  });

  const unique = Array.from(new Set(users.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean)));
  if (unique.length > 0) return unique;

  return getBoardMemberEmails();
};

// ---------- Settings Users & Roles ----------

export const getSettingsUsersService = async () => {
  const PRIVILEGED_ROLE_IDS = [
    ROLE.SUPER_ADMIN,
    ROLE.CHANGE_ADMIN,
    ROLE.PRESPEND_ADMIN,
    ROLE.TRAVEL_ADMIN,
    ROLE.ADMIN_LEGACY,
    ROLE.CHANGE_MANAGER,
    ROLE.CHANGE_IMPLEMENTER,
    ROLE.BOARD
  ];

  const users = await UserS8.findAll({
    where: {
      roleId: { [Op.in]: PRIVILEGED_ROLE_IDS },
      status: { [Op.ne]: 'Inactive' }
    },
    order: [['createdAt', 'DESC']]
  });

  const [cmAssignments, ciAssignments] = await Promise.all([
    ChangeManagerCategory.findAll({ raw: true }),
    ChangeImplementerCategory.findAll({ raw: true })
  ]);

  const cmMap = new Map();
  cmAssignments.forEach((c) => {
    const key = String(c.userId || c.user_id);
    if (!cmMap.has(key)) cmMap.set(key, []);
    cmMap.get(key).push(c.categoryId || c.category_id);
  });

  const ciMap = new Map();
  ciAssignments.forEach((c) => {
    const key = String(c.userId || c.user_id);
    if (!ciMap.has(key)) ciMap.set(key, []);
    ciMap.get(key).push(c.categoryId || c.category_id);
  });

  const results = [];
  for (const u of users) {
    const userKey = String(u.id);
    const email = (u.email || '').trim().toLowerCase();
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
    const roleName = normalizeRole(u.roleId)?.roleName || 'Requester';

    // Fetch authoritative employee ID from Employee directory by email
    let empRecord = null;
    if (email) {
      empRecord = await Employee.findOne({
        where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email),
        raw: true
      });
    }

    const authoritativeEmpId = empRecord?.empId || '';
    const userCmCats = cmMap.get(userKey) || cmMap.get(`S8-${u.id}`) || cmMap.get(email) || [];
    const userCiCats = ciMap.get(userKey) || ciMap.get(`S8-${u.id}`) || ciMap.get(email) || [];

    results.push({
      id: userKey,
      userKey,
      sourceId: u.id,
      identityType: 'CHANGE_USER',
      name,
      displayName: name,
      email: u.email,
      designation: u.designation || '',
      empId: authoritativeEmpId,
      employeeId: authoritativeEmpId,
      employeeBusinessId: authoritativeEmpId,
      roleId: u.roleId,
      role: roleName,
      roles: [{ roleId: u.roleId, roleName }],
      rolesList: [u.roleId],
      status: u.status || 'Active',
      categoryIds: Array.from(new Set([...userCmCats, ...userCiCats])),
      cmCategoryIds: userCmCats,
      ciCategoryIds: userCiCats,
      isInUserTable: true
    });
  }

  return results;
};

export const updateSettingsUserService = async (userKey, payload = {}, meta = {}) => {
  const user = await findUserS8ByKey(userKey);

  if (!user) {
    const err = new Error(`User ${userKey} not found in hot_desk_users`);
    err.statusCode = 404;
    throw err;
  }

  if (meta.actorId && String(meta.actorId) === String(user.id)) {
    const err = new Error('You cannot change your own role.');
    err.statusCode = 403;
    throw err;
  }
  if (meta.actorRoleId) {
    await assertCanManage(meta.actorRoleId, user.roleId, 'modify');
  }

  const matchedRole = payload.roleId || payload.role
    ? normalizeRole(payload.roleId || payload.role)
    : null;
  if (matchedRole) {
    if (meta.actorRoleId) await assertCanGrant(meta.actorRoleId, matchedRole.roleId);
    user.roleId = matchedRole.roleId;
  }

  if (payload.name) {
    const [firstName, ...rest] = String(payload.name).trim().split(' ');
    user.firstName = firstName || null;
    user.lastName = rest.join(' ') || null;
  }
  if (payload.designation) user.designation = payload.designation;
  if (payload.status) user.status = payload.status;

  await user.save();

  const hasCM = user.roleId === ROLE.CHANGE_MANAGER;
  const hasCI = user.roleId === ROLE.CHANGE_IMPLEMENTER;

  if (hasCM) {
    const cmCats = payload.cmCategoryIds || payload.cmCategories || payload.categoryIds || [];
    await updateChangeManagerCategoriesService(user.id, cmCats);
  } else {
    await updateChangeManagerCategoriesService(user.id, []);
  }

  if (hasCI) {
    const ciCats = payload.ciCategoryIds || payload.ciCategories || payload.categoryIds || [];
    await updateChangeImplementerCategoriesService(user.id, ciCats);
  } else {
    await updateChangeImplementerCategoriesService(user.id, []);
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const roleName = normalizeRole(user.roleId)?.roleName || 'Requester';
  const actorStr = meta.actorId ? String(meta.actorId) : 'SYSTEM';
  await addAuditLog({
    actorId: actorStr,
    action: 'User Role Updated',
    ref: String(user.id),
    detail: `Updated role to ${roleName} for ${name} (${user.email}).`
  }).catch((logErr) => console.warn('[auditLog] Notice:', logErr.message));

  IdentityResolver.clearCache();
  const updatedRes = await IdentityResolver.resolveByKey(String(user.id));
  return updatedRes.identity;
};

export const createSettingsUserService = async (payload = {}, meta = {}) => {
  const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
  if (!email) {
    const e = new Error('Email is required to invite or add a user');
    e.statusCode = 400;
    throw e;
  }

  const primaryRole = normalizeRole(payload.roleId || payload.role) || { roleId: ROLE.REQUESTER, roleName: 'Requester' };
  if (meta.actorRoleId) await assertCanGrant(meta.actorRoleId, primaryRole.roleId);

  const rawName = (payload.name || '').trim();
  const displayName = rawName || email.split('@')[0];
  const [firstName, ...rest] = displayName.split(' ');
  const lastName = rest.join(' ') || null;

  let user = await UserS8.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email)
  });

  if (user) {
    if (meta.actorId && String(meta.actorId) === String(user.id)) {
      const err = new Error('You cannot change your own role.');
      err.statusCode = 403;
      throw err;
    }
    if (meta.actorRoleId) await assertCanManage(meta.actorRoleId, user.roleId, 'modify');

    user.firstName = firstName || null;
    user.lastName = lastName;
    user.roleId = primaryRole.roleId;
    user.status = payload.status || 'Active';
    if (payload.designation) user.designation = payload.designation;
    await user.save();
  } else {
    user = await UserS8.create({
      firstName: firstName || null,
      lastName,
      email,
      roleId: primaryRole.roleId,
      designation: payload.designation || '',
      status: 'Active',
      invitedBy: meta.invitedByName || meta.actorId || 'Super Admin'
    });
  }

  const hasCM = primaryRole.roleId === ROLE.CHANGE_MANAGER;
  const hasCI = primaryRole.roleId === ROLE.CHANGE_IMPLEMENTER;

  if (hasCM) {
    const cmCats = payload.cmCategoryIds || payload.cmCategories || payload.categoryIds || [];
    if (cmCats.length > 0) {
      await updateChangeManagerCategoriesService(user.id, cmCats);
    }
  }
  if (hasCI) {
    const ciCats = payload.ciCategoryIds || payload.ciCategories || payload.categoryIds || [];
    if (ciCats.length > 0) {
      await updateChangeImplementerCategoriesService(user.id, ciCats);
    }
  }

  const actorStr = meta.actorId ? String(meta.actorId) : 'SYSTEM';
  await addAuditLog({
    actorId: actorStr,
    action: 'User Invited / Added',
    ref: String(user.id),
    detail: `Invited ${displayName} (${email}) with role: ${primaryRole.roleName}.`
  }).catch((logErr) => console.warn('[auditLog] Notice:', logErr.message));

  // User invitation emails disabled per configuration
  // sendUserInviteEmail({ ... });

  IdentityResolver.clearCache();
  const resolved = await IdentityResolver.resolveByKey(String(user.id));
  return resolved.identity;
};

export const deleteSettingsUserService = async (userKey, meta = {}) => {
  const user = await findUserS8ByKey(userKey);

  if (!user) {
    const err = new Error(`User ${userKey} not found in hot_desk_users`);
    err.statusCode = 404;
    throw err;
  }

  // Prevent self-deletion if the caller is the same user
  if (meta.actorId && (String(meta.actorId) === String(user.id) || String(meta.actorEmail || '').toLowerCase() === String(user.email).toLowerCase())) {
    const err = new Error('You cannot delete or deactivate your own account.');
    err.statusCode = 400;
    throw err;
  }
  if (meta.actorRoleId) {
    await assertCanManage(meta.actorRoleId, user.roleId, 'delete');
  }

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  // Set status to Inactive and revoke privileged roles
  user.status = 'Inactive';
  user.roleId = ROLE.REQUESTER;
  await user.save();

  // Clear any assigned category mappings
  await Promise.all([
    updateChangeManagerCategoriesService(user.id, []),
    updateChangeImplementerCategoriesService(user.id, [])
  ]);

  const actorStr = meta.actorId ? String(meta.actorId) : 'SYSTEM';
  await addAuditLog({
    actorId: actorStr,
    action: 'User Deactivated',
    ref: String(user.id),
    detail: `Deactivated user ${name} (${user.email}) and revoked all privileged roles.`
  }).catch((logErr) => console.warn('[auditLog] Notice:', logErr.message));

  IdentityResolver.clearCache();
  return { id: user.id, email: user.email, status: 'Inactive' };
};

export const getSettingsRolesService = async () => {
  const [rows, users] = await Promise.all([
    Role.findAll({ order: [['id', 'ASC']] }),
    UserS8.findAll({ attributes: ['roleId'], raw: true })
  ]);

  const counts = {};
  users.forEach((u) => {
    const rId = u.roleId || ROLE.REQUESTER;
    counts[rId] = (counts[rId] || 0) + 1;
  });

  return rows.map((r) => {
    const plainRole = r.get ? r.get({ plain: true }) : r;
    return {
      id: plainRole.id,
      name: plainRole.name,
      rank: plainRole.rank,
      usersCount: counts[plainRole.id] || 0,
      description: plainRole.description,
      permissions: plainRole.permissions
    };
  });
};

export const updateRolePermissionsService = async (roleId, permissions = [], actorId = null) => {
  const role = await Role.findByPk(roleId);
  if (!role) {
    const err = new Error(`Role ${roleId} not found`);
    err.statusCode = 404;
    throw err;
  }

  role.permissions = permissions;
  await role.save();

  await addAuditLog({
    actorId: actorId || 'SYSTEM',
    action: 'Role Permissions Updated',
    ref: roleId,
    detail: `Updated permissions for role ${role.name}.`
  });

  const usersCount = await UserS8.count({ where: { roleId } });
  const plainRole = role.get ? role.get({ plain: true }) : role;
  return {
    id: plainRole.id,
    name: plainRole.name,
    usersCount,
    description: plainRole.description,
    permissions: plainRole.permissions
  };
};

export const getAllUsersListService = async () => {
  const employees = await Employee.findAll({
    where: { leftAt: null },
    attributes: ['id', 'name', 'email', 'empId', 'location'],
    order: [['name', 'ASC']],
    raw: true
  });

  return employees
    .filter(e => e && e.name && e.email)
    .map(e => ({
      id: String(e.id),
      name: e.name.trim(),
      email: e.email.trim().toLowerCase(),
      empId: e.empId || '',
      location: e.location || ''
    }));
};
