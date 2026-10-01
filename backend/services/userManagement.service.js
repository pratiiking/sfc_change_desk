import { Op } from 'sequelize';
import { sequelize, Role, CatalogCategory, ChangeManagerCategory, ChangeImplementerCategory } from '../models/index.js';
import { ChangeUser } from '../models/ChangeUser.js';
import { Employee } from '../models/Employee.js';
import { IdentityResolver } from './identityResolver.service.js';
import { addAuditLog } from './auditLog.service.js';
import { normalizeRole, ROLE } from '../config/constants.js';

// ---------- Category Assignments for Change Managers ----------

export const getChangeManagerCategoriesService = async (userId) => {
  if (!userId) {
    const assignments = await ChangeManagerCategory.findAll({ raw: true });
    return assignments.map((a) => ({ userId: a.userId, categoryId: a.categoryId }));
  }
  const normalizedKeys = [userId];
  if (typeof userId === 'string' && userId.startsWith('EMP-')) {
    normalizedKeys.push(userId.replace('EMP-', ''));
  } else if (typeof userId === 'string' && userId.startsWith('S8-')) {
    normalizedKeys.push(userId.replace('S8-', ''));
  } else if (!isNaN(Number(userId))) {
    normalizedKeys.push(`EMP-${userId}`);
    normalizedKeys.push(`S8-${userId}`);
  }
  const assignments = await ChangeManagerCategory.findAll({
    where: { userId: { [Op.in]: normalizedKeys } },
    raw: true
  });
  return assignments.map((a) => ({ userId: a.userId, categoryId: a.categoryId }));
};

export const updateChangeManagerCategoriesService = async (userId, categoryIds = []) => {
  const normalizedKeys = [userId];
  if (typeof userId === 'string' && userId.startsWith('EMP-')) {
    normalizedKeys.push(userId.replace('EMP-', ''));
  } else if (typeof userId === 'string' && userId.startsWith('S8-')) {
    normalizedKeys.push(userId.replace('S8-', ''));
  } else if (!isNaN(Number(userId))) {
    normalizedKeys.push(`EMP-${userId}`);
    normalizedKeys.push(`S8-${userId}`);
  }

  const current = await ChangeManagerCategory.findAll({
    where: { userId: { [Op.in]: normalizedKeys } }
  });
  const currentCatIds = current.map((c) => c.categoryId);

  const toAdd = categoryIds.filter((cid) => !currentCatIds.includes(cid));
  const toRemove = currentCatIds.filter((cid) => !categoryIds.includes(cid));

  if (toRemove.length > 0) {
    await ChangeManagerCategory.destroy({
      where: { userId: { [Op.in]: normalizedKeys }, categoryId: { [Op.in]: toRemove } }
    });
  }

  for (const cid of toAdd) {
    const id = `cmc-${userId}-${cid}`;
    await ChangeManagerCategory.upsert({ id, userId, categoryId: cid }).catch(() => {});
  }

  return getChangeManagerCategoriesService(userId);
};

// ---------- Category Assignments for Change Implementers ----------

export const getChangeImplementerCategoriesService = async (userId) => {
  if (!userId) {
    const assignments = await ChangeImplementerCategory.findAll({ raw: true });
    return assignments.map((a) => ({ userId: a.userId, categoryId: a.categoryId }));
  }
  const normalizedKeys = [userId];
  if (typeof userId === 'string' && userId.startsWith('EMP-')) {
    normalizedKeys.push(userId.replace('EMP-', ''));
  } else if (typeof userId === 'string' && userId.startsWith('S8-')) {
    normalizedKeys.push(userId.replace('S8-', ''));
  } else if (!isNaN(Number(userId))) {
    normalizedKeys.push(`EMP-${userId}`);
    normalizedKeys.push(`S8-${userId}`);
  }
  const assignments = await ChangeImplementerCategory.findAll({
    where: { userId: { [Op.in]: normalizedKeys } },
    raw: true
  });
  return assignments.map((a) => ({ userId: a.userId, categoryId: a.categoryId }));
};

export const updateChangeImplementerCategoriesService = async (userId, categoryIds = []) => {
  const normalizedKeys = [userId];
  if (typeof userId === 'string' && userId.startsWith('EMP-')) {
    normalizedKeys.push(userId.replace('EMP-', ''));
  } else if (typeof userId === 'string' && userId.startsWith('S8-')) {
    normalizedKeys.push(userId.replace('S8-', ''));
  } else if (!isNaN(Number(userId))) {
    normalizedKeys.push(`EMP-${userId}`);
    normalizedKeys.push(`S8-${userId}`);
  }

  const current = await ChangeImplementerCategory.findAll({
    where: { userId: { [Op.in]: normalizedKeys } }
  });
  const currentCatIds = current.map((c) => c.categoryId);

  const toAdd = categoryIds.filter((cid) => !currentCatIds.includes(cid));
  const toRemove = currentCatIds.filter((cid) => !categoryIds.includes(cid));

  if (toRemove.length > 0) {
    await ChangeImplementerCategory.destroy({
      where: { userId: { [Op.in]: normalizedKeys }, categoryId: { [Op.in]: toRemove } }
    });
  }

  for (const cid of toAdd) {
    const id = `cic-${userId}-${cid}`;
    await ChangeImplementerCategory.upsert({ id, userId, categoryId: cid }).catch(() => {});
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

  const admins = await ChangeUser.findAll({
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

  const implementers = await ChangeUser.findAll({
    where: {
      roleId: { [Op.in]: [ROLE.CHANGE_IMPLEMENTER, ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY, ROLE.CHANGE_ADMIN] },
      status: 'Active'
    },
    raw: true
  });

  return Array.from(new Set(implementers.map(i => (i.email || '').trim().toLowerCase()).filter(Boolean)));
};

export const getBoardMemberEmails = async () => {
  const users = await ChangeUser.findAll({
    where: { status: 'Active' },
    raw: true
  });

  const boardEmails = [];
  for (const u of users) {
    const rawRoles = u.metadata?.roles || [];
    const roleIds = [
      u.roleId,
      ...(Array.isArray(rawRoles) ? rawRoles.map(r => (typeof r === 'string' ? r : r.roleId || r.role)) : [])
    ].filter(Boolean);

    const isBoard = roleIds.some(r => r === ROLE.BOARD || r === 'role-board' || String(r).toLowerCase().includes('board'));
    if (isBoard && u.email) {
      boardEmails.push(u.email.trim().toLowerCase());
    }
  }

  return Array.from(new Set(boardEmails.filter(Boolean)));
};

export const getTravelDeskApproverEmails = async (isShortNotice = false) => {
  const users = await ChangeUser.findAll({
    where: { status: 'Active' },
    raw: true
  });

  const approverEmails = [];
  for (const u of users) {
    const rawRoles = u.metadata?.roles || [];
    const roleIds = [
      u.roleId,
      ...(Array.isArray(rawRoles) ? rawRoles.map(r => (typeof r === 'string' ? r : r.roleId || r.role)) : [])
    ].filter(Boolean);

    const isTravelAdmin = roleIds.some(r => r === ROLE.TRAVEL_ADMIN || String(r).toLowerCase().includes('travel'));
    const isBoard = roleIds.some(r => r === ROLE.BOARD || r === 'role-board' || String(r).toLowerCase().includes('board'));

    // If short notice or requires board approval, notify Board members + Travel Admins
    if (isShortNotice) {
      if ((isBoard || isTravelAdmin) && u.email) {
        approverEmails.push(u.email.trim().toLowerCase());
      }
    } else {
      // Normal booking: notify Travel Desk Admins (and fallback to Board if no Travel Admin configured)
      if (isTravelAdmin && u.email) {
        approverEmails.push(u.email.trim().toLowerCase());
      }
    }
  }

  const unique = Array.from(new Set(approverEmails.filter(Boolean)));
  if (unique.length > 0) return unique;

  // Fallback to board members if no travel admin found
  return getBoardMemberEmails();
};

export const getPreSpendAdminEmails = async () => {
  const users = await ChangeUser.findAll({
    where: { status: 'Active' },
    raw: true
  });
  const adminEmails = [];
  for (const u of users) {
    const rawRoles = u.metadata?.roles || [];
    const roleIds = [
      u.roleId,
      ...(Array.isArray(rawRoles) ? rawRoles.map(r => (typeof r === 'string' ? r : r.roleId || r.role)) : [])
    ].filter(Boolean);
    const isPreSpendAdmin = roleIds.some(r => r === ROLE.PRESPEND_ADMIN || String(r).toLowerCase().includes('prespend') || String(r).toLowerCase().includes('spend'));
    if (isPreSpendAdmin && u.email) {
      adminEmails.push(u.email.trim().toLowerCase());
    }
  }
  return Array.from(new Set(adminEmails.filter(Boolean)));
};

export const getTravelAdminEmails = async () => {
  const users = await ChangeUser.findAll({
    where: { status: 'Active' },
    raw: true
  });
  const adminEmails = [];
  for (const u of users) {
    const rawRoles = u.metadata?.roles || [];
    const roleIds = [
      u.roleId,
      ...(Array.isArray(rawRoles) ? rawRoles.map(r => (typeof r === 'string' ? r : r.roleId || r.role)) : [])
    ].filter(Boolean);
    const isTravelAdmin = roleIds.some(r => r === ROLE.TRAVEL_ADMIN || String(r).toLowerCase().includes('travel'));
    if (isTravelAdmin && u.email) {
      adminEmails.push(u.email.trim().toLowerCase());
    }
  }
  return Array.from(new Set(adminEmails.filter(Boolean)));
};

export const getPreSpendApproverEmails = async (isBoardRequired = false) => {
  const users = await ChangeUser.findAll({
    where: { status: 'Active' },
    raw: true
  });

  const approverEmails = [];
  for (const u of users) {
    const rawRoles = u.metadata?.roles || [];
    const roleIds = [
      u.roleId,
      ...(Array.isArray(rawRoles) ? rawRoles.map(r => (typeof r === 'string' ? r : r.roleId || r.role)) : [])
    ].filter(Boolean);

    const isPreSpendAdmin = roleIds.some(r => r === ROLE.PRESPEND_ADMIN || String(r).toLowerCase().includes('prespend') || String(r).toLowerCase().includes('spend'));
    const isBoard = roleIds.some(r => r === ROLE.BOARD || r === 'role-board' || String(r).toLowerCase().includes('board'));

    if (isBoardRequired) {
      if ((isBoard || isPreSpendAdmin) && u.email) {
        approverEmails.push(u.email.trim().toLowerCase());
      }
    } else {
      if (isPreSpendAdmin && u.email) {
        approverEmails.push(u.email.trim().toLowerCase());
      }
    }
  }

  const unique = Array.from(new Set(approverEmails.filter(Boolean)));
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

  const users = await ChangeUser.findAll({
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
    const assignedCats = u.roleId === ROLE.CHANGE_IMPLEMENTER
      ? (ciMap.get(userKey) || ciMap.get(`S8-${u.id}`) || ciMap.get(email) || [])
      : (cmMap.get(userKey) || cmMap.get(`S8-${u.id}`) || cmMap.get(email) || []);

    const isInUserTable = await IdentityResolver.checkUserInUserTable(email);

    // Multi-role extraction
    const rawRoles = u.metadata?.roles || [];
    let rolesList = Array.isArray(rawRoles) && rawRoles.length > 0
      ? rawRoles.map(r => typeof r === 'string' ? normalizeRole(r) : r)
      : [{ roleId: u.roleId, roleName: u.roleName }];

    // Ensure primary role is included if missing
    if (!rolesList.some(r => r.roleId === u.roleId)) {
      rolesList.unshift({ roleId: u.roleId, roleName: u.roleName });
    }

    // Fetch authoritative employee ID from Employee directory by email
    let empRecord = null;
    if (email) {
      empRecord = await Employee.findOne({
        where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email),
        raw: true
      });
    }

    const authoritativeEmpId = empRecord?.empId || u.metadata?.empId || (u.metadata?.employeeId ? String(u.metadata.employeeId) : '');
    const userCmCats = cmMap.get(userKey) || cmMap.get(`S8-${u.id}`) || cmMap.get(email) || [];
    const userCiCats = ciMap.get(userKey) || ciMap.get(`S8-${u.id}`) || ciMap.get(email) || [];

    results.push({
      id: userKey,
      userKey,
      sourceId: u.id,
      identityType: 'CHANGE_USER',
      name: u.name || u.email,
      displayName: u.name || u.email,
      email: u.email,
      designation: u.designation || '',
      empId: authoritativeEmpId,
      employeeId: authoritativeEmpId,
      employeeBusinessId: authoritativeEmpId,
      roleId: u.roleId,
      role: u.roleName,
      roles: rolesList,
      rolesList: rolesList.map(r => r.roleId),
      status: u.status || 'Active',
      categoryIds: Array.from(new Set([...userCmCats, ...userCiCats])),
      cmCategoryIds: userCmCats,
      ciCategoryIds: userCiCats,
      isInUserTable
    });
  }

  return results;
};

export const updateSettingsUserService = async (userKey, payload = {}, meta = {}) => {
  const rawId = String(userKey).replace(/^(S8-|EMP-|usr-)/, '');
  let user = await ChangeUser.findByPk(rawId);
  if (!user && String(userKey).includes('@')) {
    user = await ChangeUser.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), String(userKey).trim().toLowerCase())
    });
  }

  if (!user) {
    const err = new Error(`User ${userKey} not found in change_user`);
    err.statusCode = 404;
    throw err;
  }

  // Handle multi-role list if passed in payload
  let normalizedRoles = [];
  const currentMeta = user.metadata && typeof user.metadata === 'object' ? { ...user.metadata } : {};
  if (Array.isArray(payload.roles) && payload.roles.length > 0) {
    normalizedRoles = payload.roles.map(r => typeof r === 'string' ? normalizeRole(r) : normalizeRole(r.roleId || r.roleName || r.role)).filter(Boolean);
    const primary = normalizedRoles[0];
    if (primary) {
      user.roleId = primary.roleId;
      user.roleName = primary.roleName;
    }
    currentMeta.roles = normalizedRoles;
  } else if (payload.roleId || payload.role) {
    const matchedRole = normalizeRole(payload.roleId || payload.role);
    if (matchedRole) {
      user.roleId = matchedRole.roleId;
      user.roleName = matchedRole.roleName;
      normalizedRoles = [matchedRole];
      currentMeta.roles = normalizedRoles;
    }
  }

  if (payload.empId || payload.employeeId) {
    currentMeta.empId = String(payload.empId || payload.employeeId).trim();
  }

  user.metadata = currentMeta;
  user.changed('metadata', true);

  if (payload.name) user.name = payload.name;
  if (payload.designation) user.designation = payload.designation;
  if (payload.status) user.status = payload.status;

  await user.save();

  const activeRoleIds = normalizedRoles.map(r => r.roleId);
  const hasCM = activeRoleIds.includes(ROLE.CHANGE_MANAGER) || user.roleId === ROLE.CHANGE_MANAGER;
  const hasCI = activeRoleIds.includes(ROLE.CHANGE_IMPLEMENTER) || user.roleId === ROLE.CHANGE_IMPLEMENTER;

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

  const actorStr = meta.actorId ? String(meta.actorId) : 'SYSTEM';
  await addAuditLog({
    actorId: actorStr,
    action: 'User Role Updated',
    ref: String(user.id),
    detail: `Updated role(s) to ${normalizedRoles.map(r => r.roleName).join(', ') || user.roleName} for ${user.name} (${user.email}).`
  }).catch((logErr) => console.warn('[auditLog] Notice:', logErr.message));

  IdentityResolver.clearCache();
  const updatedRes = await IdentityResolver.resolveByKey(user.id);
  return updatedRes.identity;
};

export const createSettingsUserService = async (payload = {}, meta = {}) => {
  const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
  if (!email) {
    const e = new Error('Email is required to invite or add a user');
    e.statusCode = 400;
    throw e;
  }

  let normalizedRoles = [];
  if (Array.isArray(payload.roles) && payload.roles.length > 0) {
    normalizedRoles = payload.roles.map(r => typeof r === 'string' ? normalizeRole(r) : normalizeRole(r.roleId || r.roleName || r.role)).filter(Boolean);
  } else {
    normalizedRoles = [normalizeRole(payload.roleId || payload.role || ROLE.REQUESTER)];
  }

  const primaryRole = normalizedRoles[0] || { roleId: ROLE.REQUESTER, roleName: 'Requester' };
  const rawName = (payload.name || '').trim();
  const displayName = rawName || email.split('@')[0];

  let changeUser = await ChangeUser.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email)
  });

  const customEmpId = payload.empId || payload.employeeId ? String(payload.empId || payload.employeeId).trim() : null;

  if (changeUser) {
    changeUser.name = displayName;
    changeUser.roleId = primaryRole.roleId;
    changeUser.roleName = primaryRole.roleName;
    changeUser.status = payload.status || 'Active';
    if (payload.designation) changeUser.designation = payload.designation;
    const currentMeta = changeUser.metadata && typeof changeUser.metadata === 'object' ? { ...changeUser.metadata } : {};
    currentMeta.roles = normalizedRoles;
    if (customEmpId) currentMeta.empId = customEmpId;
    changeUser.metadata = currentMeta;
    changeUser.changed('metadata', true);
    await changeUser.save();
  } else {
    const userMeta = { roles: normalizedRoles };
    if (customEmpId) userMeta.empId = customEmpId;
    changeUser = await ChangeUser.create({
      name: displayName,
      email,
      roleId: primaryRole.roleId,
      roleName: primaryRole.roleName,
      designation: payload.designation || '',
      status: 'Active',
      invitedBy: meta.invitedByName || meta.actorId || 'Super Admin',
      metadata: userMeta
    });
  }

  const activeRoleIds = normalizedRoles.map(r => r.roleId);
  const hasCM = activeRoleIds.includes(ROLE.CHANGE_MANAGER);
  const hasCI = activeRoleIds.includes(ROLE.CHANGE_IMPLEMENTER);

  if (hasCM) {
    const cmCats = payload.cmCategoryIds || payload.cmCategories || payload.categoryIds || [];
    if (cmCats.length > 0) {
      await updateChangeManagerCategoriesService(changeUser.id, cmCats);
    }
  }
  if (hasCI) {
    const ciCats = payload.ciCategoryIds || payload.ciCategories || payload.categoryIds || [];
    if (ciCats.length > 0) {
      await updateChangeImplementerCategoriesService(changeUser.id, ciCats);
    }
  }

  const actorStr = meta.actorId ? String(meta.actorId) : 'SYSTEM';
  await addAuditLog({
    actorId: actorStr,
    action: 'User Invited / Added',
    ref: String(changeUser.id),
    detail: `Invited ${displayName} (${email}) with role(s): ${normalizedRoles.map(r => r.roleName).join(', ')}.`
  }).catch((logErr) => console.warn('[auditLog] Notice:', logErr.message));

  // User invitation emails disabled per configuration
  // sendUserInviteEmail({ ... });

  IdentityResolver.clearCache();
  const resolved = await IdentityResolver.resolveByKey(changeUser.id);
  return resolved.identity;
};

export const deleteSettingsUserService = async (userKey, meta = {}) => {
  const rawId = String(userKey).replace(/^(S8-|EMP-|usr-)/, '');
  let user = await ChangeUser.findByPk(rawId);
  if (!user && String(userKey).includes('@')) {
    user = await ChangeUser.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), String(userKey).trim().toLowerCase())
    });
  }

  if (!user) {
    const err = new Error(`User ${userKey} not found in change_user`);
    err.statusCode = 404;
    throw err;
  }

  // Prevent self-deletion if the caller is the same user
  if (meta.actorId && (String(meta.actorId) === String(user.id) || String(meta.actorEmail || '').toLowerCase() === String(user.email).toLowerCase())) {
    const err = new Error('You cannot delete or deactivate your own account.');
    err.statusCode = 400;
    throw err;
  }

  // Set status to Inactive and revoke privileged roles
  user.status = 'Inactive';
  user.roleId = ROLE.REQUESTER;
  user.roleName = 'Requester';
  const currentMeta = user.metadata && typeof user.metadata === 'object' ? { ...user.metadata } : {};
  currentMeta.roles = [{ roleId: ROLE.REQUESTER, roleName: 'Requester' }];
  user.metadata = currentMeta;
  user.changed('metadata', true);
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
    detail: `Deactivated user ${user.name} (${user.email}) and revoked all privileged roles.`
  }).catch((logErr) => console.warn('[auditLog] Notice:', logErr.message));

  IdentityResolver.clearCache();
  return { id: user.id, email: user.email, status: 'Inactive' };
};

export const getSettingsRolesService = async () => {
  const [rows, users] = await Promise.all([
    Role.findAll({ order: [['id', 'ASC']] }),
    ChangeUser.findAll({ attributes: ['roleId'], raw: true })
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

  const usersCount = await ChangeUser.count({ where: { roleId } });
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
