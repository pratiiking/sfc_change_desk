import { ChangeUser } from '../models/ChangeUser.js';
import { UserS8 } from '../models/UserS8.js';
import { ChangeManagerCategory, ChangeImplementerCategory } from '../models/index.js';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';

import { ROLE_ID_TO_NAME as ROLE_NAME_MAP, APP_ROLE_MAP } from '../config/constants.js';

export class IdentityResolver {
  static keyCache = new Map();
  static CACHE_TTL_MS = 30_000;

  static clearCache(key = null) {
    if (key) {
      this.keyCache.delete(String(key));
    } else {
      this.keyCache.clear();
    }
  }

  /** Check if email exists in DB's User table (UserS8 / public.hot_desk_users) */
  static async checkUserInUserTable(email) {
    if (!email) return false;
    try {
      const s8User = await UserS8.findOne({
        where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email.trim().toLowerCase())
      });
      return Boolean(s8User);
    } catch {
      return false;
    }
  }

  /**
   * Resolves identity by email address:
   * 1. Validates presence and active status in the 'employees' table.
   *    - If not found in employees table -> BLOCKED
   *    - If left_at / left_reason / left_by is NOT NULL (exited) -> BLOCKED
   *    - If IS NULL (active) -> ALLOWED
   * 2. Resolves application profile and permissions from 'change_user' table.
   */
  static async resolveByEmail(rawEmail) {
    if (!rawEmail || typeof rawEmail !== 'string') {
      return { status: 'NOT_FOUND', message: 'Email address is required' };
    }

    const email = rawEmail.trim().toLowerCase();

    // 1. Enforce Employee Table Validation Gate
    const { Employee } = await import('../models/Employee.js');
    const employee = await Employee.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email)
    });

    if (!employee) {
      return {
        status: 'NOT_FOUND',
        message: 'Access Denied: Email address not found in employee directory.'
      };
    }

    if (employee.leftAt || employee.leftReason || employee.leftBy) {
      return {
        status: 'USER_INACTIVE',
        message: 'Access Denied: Your account is deactivated as you are no longer with the organization.'
      };
    }

    // 2. Lookup in change_user table
    let changeUser = await ChangeUser.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email)
    });

    if (changeUser) {
      if (changeUser.status === 'Inactive' || changeUser.status === 'Suspended') {
        // If deactivated in ChangeUser (removed from Settings), fall back to standard Employee login
        // (Roles 1, 2, 3, 5, 6 are revoked, but standard employee login is preserved)
      } else {
        return await this._buildIdentityDTO(changeUser, employee);
      }
    }

    // 3. If employee exists and active, return pure Employee identity without mutating ChangeUser
    return {
      status: 'SUCCESS',
      identity: {
        identityType: 'EMPLOYEE_DIRECTORY',
        sourceId: employee.id,
        userKey: `EMP-${employee.id}`,
        id: `EMP-${employee.id}`,
        email: employee.email,
        displayName: employee.name || email.split('@')[0],
        name: employee.name || email.split('@')[0],
        designation: '',
        applicationRole: 'EMPLOYEE',
        roleId: 'role-employee',
        roleName: 'Employee',
        role: 'Employee',
        isSuperAdmin: false,
        isChangeAdmin: false,
        isTravelAdmin: false,
        isPreSpendAdmin: false,
        isBoardUser: false,
        roles: [{ roleId: 'role-employee', roleName: 'Employee' }],
        rolesList: ['role-employee'],
        cmCategories: [],
        ciCategories: [],
        employeeBusinessId: employee.empId || `EMP-${employee.id}`,
        location: employee.location || null,
        aliases: [String(employee.id), `EMP-${employee.id}`, `S8-${employee.id}`, email]
      }
    };
  }

  /**
   * Resolves identity by ID or UserKey directly from ChangeUser table.
   */
  static async resolveByKey(userKey) {
    const key = String(userKey || '');
    const cached = this.keyCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const result = await this._resolveByKey(key);
    this.keyCache.set(key, { result, expiresAt: Date.now() + this.CACHE_TTL_MS });
    return result;
  }

  static async _resolveByKey(userKey) {
    if (!userKey || typeof userKey !== 'string') {
      return { status: 'NOT_FOUND', message: 'User key is required' };
    }

    // Direct lookup by ID or numeric ID
    let changeUser = await ChangeUser.findByPk(userKey);

    // If not found, try stripped prefix (S8-xx, EMP-xx, usr-xx)
    if (!changeUser) {
      const rawId = userKey.replace(/^(S8-|EMP-|usr-)/, '');
      if (rawId && rawId !== userKey) {
        changeUser = await ChangeUser.findByPk(rawId);
      }
    }

    // If still not found, search by email
    if (!changeUser && userKey.includes('@')) {
      changeUser = await ChangeUser.findOne({
        where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), userKey.trim().toLowerCase())
      });
    }

    if (changeUser) {
      if (changeUser.status === 'Inactive' || changeUser.status === 'Suspended') {
        // Fallback to employee resolution to preserve login access
        return this.resolveByEmail(changeUser.email);
      }
      return await this._buildIdentityDTO(changeUser);
    }

    // Fallback: check Employee table if key is EMP-id or numeric
    const rawId = userKey.replace(/^(S8-|EMP-|usr-)/, '');
    const numId = parseInt(rawId, 10);
    if (!isNaN(numId)) {
      const { Employee } = await import('../models/Employee.js');
      const emp = await Employee.findByPk(numId);
      if (emp && !emp.leftAt && !emp.leftReason && !emp.leftBy) {
        return this.resolveByEmail(emp.email);
      }
    }

    return { status: 'NOT_FOUND', message: `User not found: ${userKey}` };
  }

  /**
   * Helper to fetch role assignment and construct normalized DTO from ChangeUser record.
   */
  static async _buildIdentityDTO(changeUser, employeeRecord = null) {
    const email = changeUser.email.trim().toLowerCase();
    const roleId = changeUser.roleId || 'role-4';
    const roleName = changeUser.roleName || ROLE_NAME_MAP[roleId] || 'Requester';
    const applicationRole = APP_ROLE_MAP[roleId] || 'REQUESTER';

    // If employeeRecord is not provided, fetch from employees table
    let emp = employeeRecord;
    if (!emp) {
      const { Employee } = await import('../models/Employee.js');
      emp = await Employee.findOne({
        where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email)
      });
    }

    if (emp && (emp.leftAt || emp.leftReason || emp.leftBy)) {
      return {
        status: 'USER_INACTIVE',
        message: 'Access Denied: Your account is deactivated as you are no longer with the organization.'
      };
    }

    const authoritativeEmpId = emp?.empId || changeUser.metadata?.empId || changeUser.id;
    const authoritativeLocation = emp?.location || null;

    // Fetch CM category assignments
    const keysToCheck = [String(changeUser.id), `S8-${changeUser.id}`, `EMP-${changeUser.id}`, `usr-${changeUser.id}`, email];
    const cmAssignments = await ChangeManagerCategory.findAll({
      where: { userId: { [Op.in]: keysToCheck } }
    });
    const cmCategories = cmAssignments.map(a => a.categoryId);

    // Fetch CI category assignments
    const ciAssignments = await ChangeImplementerCategory.findAll({
      where: { userId: { [Op.in]: keysToCheck } }
    });
    const ciCategories = ciAssignments.map(a => a.categoryId);

    // Check presence in the DB's User table (UserS8)
    const isInUserTable = await this.checkUserInUserTable(email);

    const rawRoles = changeUser.metadata?.roles || [];
    let rolesList = Array.isArray(rawRoles) && rawRoles.length > 0
      ? rawRoles.map(r => typeof r === 'string' ? { roleId: r, roleName: ROLE_NAME_MAP[r] || r } : r)
      : [{ roleId, roleName }];

    if (!rolesList.some(r => r.roleId === roleId)) {
      rolesList.unshift({ roleId, roleName });
    }

    const assignedRoleIds = rolesList.map(r => r.roleId);

    const dto = {
      identityType: 'CHANGE_USER',
      sourceId: changeUser.id,
      userKey: String(changeUser.id),
      id: String(changeUser.id),
      email: changeUser.email,
      displayName: changeUser.name,
      name: changeUser.name,
      designation: changeUser.designation || '',
      applicationRole,
      roleId,
      role: roleName,
      roles: rolesList,
      rolesList: assignedRoleIds,
      isSuperAdmin: assignedRoleIds.includes('role-1'),
      isChangeAdmin: assignedRoleIds.includes('role-1') || assignedRoleIds.includes('role-2') || assignedRoleIds.includes('role-2-change'),
      isPreSpendAdmin: assignedRoleIds.includes('role-1') || assignedRoleIds.includes('role-2-prespend'),
      isTravelAdmin: assignedRoleIds.includes('role-1') || assignedRoleIds.includes('role-2-travel'),
      isChangeManager: assignedRoleIds.includes('role-3') || cmCategories.length > 0,
      isChangeImplementer: assignedRoleIds.includes('role-5') || ciCategories.length > 0,
      isBoardMember: assignedRoleIds.includes('role-6'),
      status: changeUser.status || 'Active',
      isExplicitRole: roleId !== 'role-4',
      employeeBusinessId: authoritativeEmpId,
      employeeId: authoritativeEmpId,
      empId: authoritativeEmpId,
      location: authoritativeLocation,
      employee: {
        id: emp?.id || changeUser.id,
        name: changeUser.name,
        email: changeUser.email,
        empId: authoritativeEmpId,
        location: authoritativeLocation
      },
      cmCategories,
      ciCategories,
      categoryIds: roleId === 'role-5' ? ciCategories : cmCategories,
      aliases: keysToCheck,
      isInUserTable
    };

    return { status: 'SUCCESS', identity: dto };
  }
}

export const resolveEmailForUser = async (userId) => {
  if (!userId) return null;
  const res = await IdentityResolver.resolveByKey(String(userId));
  return (res.status === 'SUCCESS' && res.identity?.email) ? res.identity.email.trim().toLowerCase() : null;
};

export const resolveDualSourceIdentities = async (userId) => {
  if (!userId) return [];
  const res = await IdentityResolver.resolveByKey(String(userId));
  if (res.status !== 'SUCCESS' || !res.identity) return [];
  return res.identity.aliases || [String(userId)];
};
