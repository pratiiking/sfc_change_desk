import jwt from 'jsonwebtoken';
import { verifyToken, publicUser } from '../services/auth.service.js';
import { IdentityResolver } from '../services/identityResolver.service.js';

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
 * Enforces that the authenticated user's role carries the given permission key
 * (hot_desk_roles.permissions, resolved onto req.user.permissions by
 * IdentityResolver). Super Admin always bypasses, same as before this was
 * permission-driven.
 */
export const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    const userPermissions = req.user?.permissions || [];

    if (req.user?.isSuperAdmin || userPermissions.includes(requiredPermission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Access denied. Missing required permission: "${requiredPermission}".`
    });
  };
};

/**
 * Restricts organization-scoped queries (?scope=organization|org) to whoever
 * holds the dashboard.org.view permission (Super Admin, Board).
 */
export const requireOrganizationScopeRole = (req, res, next) => {
  const scope = String(req.query.scope || '').toLowerCase();
  if (scope !== 'organization' && scope !== 'org') return next();
  return requirePermission('dashboard.org.view')(req, res, next);
};

/**
 * Restricts ?view=worklist queries (the approver inbox, which surfaces every
 * other user's requests) to whoever holds the given module's worklist
 * permission.
 */
export const requireWorklistViewPermission = (permission) => (req, res, next) => {
  if (req.query.view !== 'worklist') return next();
  return requirePermission(permission)(req, res, next);
};
