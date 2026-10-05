// ────────────────────────────────────────────────────────────────
//  Auth service – Email-only development authentication using IdentityResolver.
// ────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ROLE } from '../config/constants.js';
import { IdentityResolver } from './identityResolver.service.js';

// Single-use exchange codes for the SSO redirect: the browser lands with a short-lived
// opaque code instead of the bearer JWT itself, so a leaked URL (history, proxy/access
// logs, Referer headers) doesn't hand over a long-lived session.
const SSO_CODE_TTL_MS = 60_000;
const ssoExchangeCodes = new Map();

export const createSsoExchangeCode = (token) => {
  const code = crypto.randomBytes(24).toString('hex');
  ssoExchangeCodes.set(code, { token, expiresAt: Date.now() + SSO_CODE_TTL_MS });
  return code;
};

export const consumeSsoExchangeCode = (code) => {
  const entry = ssoExchangeCodes.get(code);
  ssoExchangeCodes.delete(code); // single use, win or lose
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.token;
};

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required and not set.');
}
const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'U';

import { UserS8 } from '../models/UserS8.js';
import { sequelize } from '../config/database.js';

/** Check if email exists in public.hot_desk_users (S8 table) */
export const checkUserInUserTable = async (email) => {
  if (!email) return false;
  try {
    const s8User = await UserS8.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email.trim().toLowerCase())
    });
    return Boolean(s8User);
  } catch (err) {
    return false;
  }
};

/** Formats normalized identity for frontend consumption. */
export const publicUser = (identity) => {
  if (!identity) return null;
  const u = identity.get ? identity.get({ plain: true }) : identity;
  
  return {
    id: u.userKey || u.id,
    userKey: u.userKey || u.id,
    sourceId: u.sourceId,
    identityType: u.identityType,
    name: u.displayName || u.name,
    displayName: u.displayName || u.name,
    email: u.email,
    employeeId: u.employeeBusinessId || u.employeeId || null,
    employeeBusinessId: u.employeeBusinessId || null,
    location: u.location || null,
    employee: u.employee || null,
    role: u.role || null,
    roleId: u.roleId || null,
    roles: u.roles || (u.role ? [u.role] : []),
    rolesList: u.rolesList || (u.roleId ? [u.roleId] : []),
    isSuperAdmin: Boolean(u.isSuperAdmin || u.roleId === ROLE.SUPER_ADMIN || u.roleName === 'Super Admin' || u.role === 'Super Admin' || u.role === 'ChangeDesk Super Admin' || u.roleName === 'ChangeDesk Super Admin'),
    isChangeAdmin: Boolean(u.isChangeAdmin || (u.rolesList && (u.rolesList.includes(ROLE.SUPER_ADMIN) || u.rolesList.includes(ROLE.ADMIN_LEGACY) || u.rolesList.includes(ROLE.CHANGE_ADMIN)))),
    isPreSpendAdmin: Boolean(u.isPreSpendAdmin || (u.rolesList && (u.rolesList.includes(ROLE.SUPER_ADMIN) || u.rolesList.includes(ROLE.PRESPEND_ADMIN)))),
    isTravelAdmin: Boolean(u.isTravelAdmin || (u.rolesList && (u.rolesList.includes(ROLE.SUPER_ADMIN) || u.rolesList.includes(ROLE.TRAVEL_ADMIN)))),
    isChangeManager: Boolean(u.isChangeManager || (u.rolesList && u.rolesList.includes(ROLE.CHANGE_MANAGER)) || (u.cmCategories && u.cmCategories.length > 0)),
    isChangeImplementer: Boolean(u.isChangeImplementer || (u.rolesList && u.rolesList.includes(ROLE.CHANGE_IMPLEMENTER)) || (u.ciCategories && u.ciCategories.length > 0)),
    isBoardMember: Boolean(u.isBoardMember || (u.rolesList && u.rolesList.includes(ROLE.BOARD))),
    applicationRole: u.applicationRole || null,
    status: 'Active',
    cmCategories: u.cmCategories || [],
    ciCategories: u.ciCategories || [],
    categoryIds: u.categoryIds || u.ciCategories || u.cmCategories || [],
    initials: initials(u.displayName || u.name || u.email),
    isInUserTable: Boolean(u.isInUserTable)
  };
};

export const publicUserAsync = async (identity) => {
  return publicUser(identity);
};

export const issueToken = (identity) =>
  jwt.sign(
    {
      sub: identity.userKey || identity.id,
      identityType: identity.identityType,
      email: identity.email
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );

export const generateTempPassword = () => {
  const words = ['fox', 'change', 'desk', 'north', 'delta', 'quartz', 'ember', 'sable', 'orbit', 'ridge'];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)}-${n}`;
};

export const verifyToken = (token) => jwt.verify(token, SECRET);

/** Development Email-Only Authentication (No password, no OTP, no dummy lookup) */
export const authenticate = async (email) => {
  if (!email) {
    const e = new Error('Email is required');
    e.statusCode = 400;
    throw e;
  }

  const result = await IdentityResolver.resolveByEmail(email);

  if (result.status === 'USER_INACTIVE') {
    const e = new Error(result.message || 'Access Denied: Your account is deactivated as you are no longer with the organization.');
    e.statusCode = 403;
    throw e;
  }

  if (result.status === 'NOT_FOUND') {
    const e = new Error('Unknown email address — user not found in directory');
    e.statusCode = 401;
    throw e;
  }

  if (result.status === 'AMBIGUOUS') {
    const e = new Error('Ambiguous email match across directories. Contact support.');
    e.statusCode = 403;
    throw e;
  }

  if (result.status === 'NO_ROLE') {
    const e = new Error('Account has no assigned ChangeDesk application role');
    e.statusCode = 403;
    throw e;
  }

  if (result.status === 'INVALID_ROLE_COMBINATION') {
    const e = new Error('Account has invalid identity and role configuration');
    e.statusCode = 403;
    throw e;
  }

  if (result.status !== 'SUCCESS' || !result.identity) {
    const e = new Error('Authentication failed');
    e.statusCode = 401;
    throw e;
  }

  return result.identity;
};

/**
 * Generates Microsoft OAuth2 Authorization URL
 */
export const getMicrosoftAuthUrl = (state) => {
  if (!state) {
    const err = new Error('OAuth state is required to start Microsoft sign-in.');
    err.statusCode = 500;
    throw err;
  }
  const clientId = (process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID || '').trim();
  const tenantId = (process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID || 'common').trim();
  const redirectUri = (process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5001/api/auth/microsoft/callback').trim();

  if (!clientId || clientId === 'your-azure-client-id-here') {
    const err = new Error('Microsoft Client ID is not configured in backend/.env (MICROSOFT_CLIENT_ID).');
    err.statusCode = 500;
    throw err;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state: state,
    prompt: 'select_account'
  });

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
};

/**
 * Handles Microsoft OAuth2 callback: exchanges code for token, fetches Microsoft profile,
 * resolves ChangeDesk identity, updates UserS8, and issues JWT session token.
 */
export const handleMicrosoftCallbackService = async (code) => {
  if (!code) {
    const err = new Error('Authorization code missing from Microsoft callback.');
    err.statusCode = 400;
    throw err;
  }

  const clientId = (process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '').trim();
  const tenantId = (process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID || 'common').trim();
  const redirectUri = (process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:5001/api/auth/microsoft/callback').trim();

  if (!clientId || !clientSecret) {
    const err = new Error('Microsoft OAuth credentials missing in backend/.env (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).');
    err.statusCode = 500;
    throw err;
  }

  // 1. Exchange Authorization Code for Access Token
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'openid profile email User.Read'
  });

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString()
  });

  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    const err = new Error(tokenData.error_description || tokenData.error || 'Failed to exchange Microsoft authorization code for tokens.');
    err.statusCode = 401;
    throw err;
  }

  // 2. Fetch User Profile from Microsoft Graph
  const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });

  const graphData = await graphRes.json().catch(() => ({}));
  if (!graphRes.ok) {
    const err = new Error(graphData.error?.message || 'Failed to fetch user profile from Microsoft Graph API.');
    err.statusCode = 401;
    throw err;
  }

  const rawEmail = graphData.mail || graphData.userPrincipalName;
  if (!rawEmail) {
    const err = new Error('No email found associated with this Microsoft account.');
    err.statusCode = 400;
    throw err;
  }

  const email = rawEmail.trim().toLowerCase();
  const microsoftId = graphData.id || null;

  // 3. Resolve ChangeDesk Identity
  const identity = await authenticate(email);

  // 4. Update Microsoft login metadata in hot_desk_users, if this person has a row
  try {
    const { UserS8 } = await import('../models/UserS8.js');
    const s8User = await UserS8.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email)
    });

    if (s8User) {
      s8User.microsoftId = microsoftId || s8User.microsoftId;
      s8User.lastLogin = new Date();
      await s8User.save();
    }
  } catch (dbErr) {
    console.warn('[Microsoft SSO] Could not update hot_desk_users metadata:', dbErr.message);
  }

  // 5. Issue ChangeDesk JWT session token
  const token = issueToken(identity);
  const user = publicUser(identity);

  return { token, user };
};

