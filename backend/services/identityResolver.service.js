import { UserS8 } from '../models/UserS8.js';
import { ChangeManagerCategory, ChangeImplementerCategory } from '../models/index.js';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';

import { ROLE_ID_TO_NAME as ROLE_NAME_MAP, APP_ROLE_MAP, ROLE } from '../config/constants.js';

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

  /** Check if email exists in hot_desk_users (anyone with a role above Requester). */
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
   * 2. Resolves application profile and permissions from 'hot_desk_users', if a row
   *    exists there (anyone above Requester); otherwise everyone in the employee
   *    directory resolves as a plain Requester by default.
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

    // 2. Lookup in hot_desk_users
    let s8User = await UserS8.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email)
    });

    if (s8User) {
      if (s8User.status === 'Inactive' || s8User.status === 'Suspended') {
        // If deactivated in Settings, fall back to standard Employee login
        // (their privileged role is revoked, but standard employee login is preserved)
      } else {
        return await this._buildIdentityDTO(s8User, employee);
      }
    }

    // 3. If employee exists and active, return pure Employee identity without mutating hot_desk_users
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
   * Resolves identity by ID or UserKey directly from hot_desk_users.
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

    // Direct lookup by numeric id, or stripped prefix (S8-xx, EMP-xx, usr-xx)
    let s8User = null;
    const rawId = userKey.replace(/^(S8-|EMP-|usr-)/, '');
    if (/^\d+$/.test(rawId)) {
      s8User = await UserS8.findByPk(Number(rawId));
    }

    // If still not found, search by email
    if (!s8User && userKey.includes('@')) {
      s8User = await UserS8.findOne({
        where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), userKey.trim().toLowerCase())
      });
    }

    if (s8User) {
      if (s8User.status === 'Inactive' || s8User.status === 'Suspended') {
        // Fallback to employee resolution to preserve login access
        return this.resolveByEmail(s8User.email);
      }
      return await this._buildIdentityDTO(s8User);
    }

    // Fallback: check Employee table if key is EMP-id or numeric
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
   * Helper to fetch role assignment and construct normalized DTO from a hot_desk_users record.
   */
  static async _buildIdentityDTO(s8User, employeeRecord = null) {
    const email = s8User.email.trim().toLowerCase();
    const roleId = s8User.roleId || ROLE.REQUESTER;
    const roleName = ROLE_NAME_MAP[roleId] || 'Requester';
    const applicationRole = APP_ROLE_MAP[roleId] || 'REQUESTER';
    const name = [s8User.firstName, s8User.lastName].filter(Boolean).join(' ') || email.split('@')[0];

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

    const authoritativeEmpId = emp?.empId || String(s8User.id);
    const authoritativeLocation = emp?.location || null;

    const keysToCheck = [String(s8User.id), `S8-${s8User.id}`, `EMP-${s8User.id}`, `usr-${s8User.id}`, email];

    // Fetch CM category assignments
    const cmAssignments = await ChangeManagerCategory.findAll({
      where: { userId: { [Op.in]: keysToCheck } }
    });
    const cmCategories = cmAssignments.map(a => a.categoryId);

    // Fetch CI category assignments
    const ciAssignments = await ChangeImplementerCategory.findAll({
      where: { userId: { [Op.in]: keysToCheck } }
    });
    const ciCategories = ciAssignments.map(a => a.categoryId);

    const rolesList = [{ roleId, roleName }];
    const assignedRoleIds = [roleId];

    const dto = {
      identityType: 'CHANGE_USER',
      sourceId: s8User.id,
      userKey: String(s8User.id),
      id: String(s8User.id),
      email: s8User.email,
      displayName: name,
      name,
      designation: s8User.designation || '',
      applicationRole,
      roleId,
      role: roleName,
      roles: rolesList,
      rolesList: assignedRoleIds,
      isSuperAdmin: assignedRoleIds.includes(ROLE.SUPER_ADMIN),
      isChangeAdmin: assignedRoleIds.includes(ROLE.SUPER_ADMIN) || assignedRoleIds.includes(ROLE.ADMIN_LEGACY) || assignedRoleIds.includes(ROLE.CHANGE_ADMIN),
      isPreSpendAdmin: assignedRoleIds.includes(ROLE.SUPER_ADMIN) || assignedRoleIds.includes(ROLE.PRESPEND_ADMIN),
      isTravelAdmin: assignedRoleIds.includes(ROLE.SUPER_ADMIN) || assignedRoleIds.includes(ROLE.TRAVEL_ADMIN),
      isChangeManager: assignedRoleIds.includes(ROLE.CHANGE_MANAGER) || cmCategories.length > 0,
      isChangeImplementer: assignedRoleIds.includes(ROLE.CHANGE_IMPLEMENTER) || ciCategories.length > 0,
      isBoardMember: assignedRoleIds.includes(ROLE.BOARD),
      status: s8User.status || 'Active',
      isExplicitRole: roleId !== ROLE.REQUESTER,
      employeeBusinessId: authoritativeEmpId,
      employeeId: authoritativeEmpId,
      empId: authoritativeEmpId,
      location: authoritativeLocation,
      employee: {
        id: emp?.id || s8User.id,
        name,
        email: s8User.email,
        empId: authoritativeEmpId,
        location: authoritativeLocation
      },
      cmCategories,
      ciCategories,
      categoryIds: roleId === ROLE.CHANGE_IMPLEMENTER ? ciCategories : cmCategories,
      aliases: keysToCheck,
      isInUserTable: true
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
