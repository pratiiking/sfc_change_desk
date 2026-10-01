import jwt from 'jsonwebtoken';
import { verifyToken, publicUser } from '../services/auth.service.js';
import { IdentityResolver } from '../services/identityResolver.service.js';
import { ROLE } from '../config/constants.js';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required and not set.');
}

/**
 * Validates Bearer token, resolves identity and sets req.user
 */
export const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (token) {
    try {
      const payload = verifyToken(token);
      const userKey = payload.sub;
      const result = await IdentityResolver.resolveByKey(userKey);

      if (result.status === 'SUCCESS' && result.identity) {
        req.user = publicUser(result.identity);
        return next();
      }
    } catch (err) {
      // Token verification failed or expired
    }
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication required. Please log in.'
  });
};

export const requireAuth = authenticateUser;

/**
 * Enforces role authorization (Super Admin always bypasses)
 */
export const requireRole = (allowedRoles = []) => {
  const rolesList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    const userRole = req.user?.role || '';
    const userRoleId = req.user?.roleId || '';
    const appRole = req.user?.applicationRole || '';

    if (
      userRole === 'Super Admin' ||
      userRoleId === ROLE.SUPER_ADMIN ||
      appRole === 'SUPER_ADMIN' ||
      rolesList.includes(userRole) ||
      rolesList.includes(userRoleId) ||
      rolesList.includes(appRole)
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Access denied. Role "${userRole}" lacks permissions for this action. Required: [${rolesList.join(', ')}]`
    });
  };
};

/**
 * Restricts organization-scoped queries to Super Admin and Board Members
 */
export const requireOrganizationScopeRole = (req, res, next) => {
  const scope = String(req.query.scope || '').toLowerCase();
  if (scope !== 'organization' && scope !== 'org') return next();
  return requireRole(['Super Admin', ROLE.SUPER_ADMIN, 'role-board', ROLE.BOARD, 'Board Member', 'Board'])(req, res, next);
};

/**
 * Restricts ?view=worklist queries (the approver inbox, which surfaces every other
 * user's requests) to the roles allowed to approve that domain
 */
export const requireWorklistViewRole = (allowedRoles = []) => (req, res, next) => {
  if (req.query.view !== 'worklist') return next();
  return requireRole(allowedRoles)(req, res, next);
};
