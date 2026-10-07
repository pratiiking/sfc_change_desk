// ────────────────────────────────────────────────────────────────
//  Email notifications (nodemailer / SMTP).
//
//  Config comes entirely from backend/.env:
//    MAIL_ENABLED, SMTP_HOST, SMTP_PORT, SMTP_SECURE,
//    SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_LOGO_URL, APP_BASE_URL
//
//  If mail is disabled or unconfigured, send*() no-ops (and logs)
//  so the app never fails because of email.
// ────────────────────────────────────────────────────────────────
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import { ROLE } from '../config/constants.js';
import { Op } from 'sequelize';
import { UserS8 } from '../models/UserS8.js';

const env = process.env;

const fetchSuperAdminEmails = async () => {
  try {
    const superAdmins = await UserS8.findAll({
      where: {
        status: { [Op.iLike]: 'Active' },
        roleId: ROLE.SUPER_ADMIN
      },
      attributes: ['email'],
      raw: true
    });
    const emails = superAdmins.map(u => (u.email || '').trim().toLowerCase()).filter(Boolean);
    if (env.SUPER_ADMIN_EMAILS) {
      env.SUPER_ADMIN_EMAILS.split(',').forEach(e => {
        const cleaned = e.trim().toLowerCase();
        if (cleaned && !emails.includes(cleaned)) emails.push(cleaned);
      });
    }
    return emails;
  } catch (err) {
    console.warn('[mail] Could not fetch Super Admin emails:', err.message);
    return env.SUPER_ADMIN_EMAILS ? env.SUPER_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean) : [];
  }
};

const appUrl = () => (env.APP_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');

const LOGO_CID = 'changedesk-logo';
const LOGO_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'frontend',
  'public',
  'images',
  'white-stfox-logo.png'
);
const hasLocalLogo = () => {
  try {
    return fs.existsSync(LOGO_FILE);
  } catch {
    return false;
  }
};

/** { src } for the header <img>, or null to fall back to a text wordmark. */
const logoSrc = () => {
  if (env.MAIL_LOGO_URL) return env.MAIL_LOGO_URL;
  if (hasLocalLogo()) return `cid:${LOGO_CID}`;
  return null;
};

/** Attachments array to pass to every send (inline logo when embedding). */
export const mailAttachments = () =>
  !env.MAIL_LOGO_URL && hasLocalLogo()
    ? [{ filename: 'stfox-logo.png', path: LOGO_FILE, cid: LOGO_CID, contentDisposition: 'inline' }]
    : [];

let transporter = null;
let injected = false;
let etherealAccount = null;

const getTransporter = async () => {
  if (injected) return transporter;
  if (String(env.MAIL_ENABLED).toLowerCase() === 'false') return null;

  if (env.SMTP_HOST) {
    if (!transporter) {
      const secure = String(env.SMTP_SECURE).toLowerCase() === 'true';
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT) || 587,
        secure,
        requireTLS: !secure,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
      });
    }
    return transporter;
  }

  // Automatic Ethereal test inbox fallback for effortless local testing
  if (!transporter) {
    try {
      etherealAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: etherealAccount.user,
          pass: etherealAccount.pass
        }
      });
    } catch (err) {
      return null;
    }
  }
  return transporter;
};

/** Inject a specific transporter (used by scripts/sendTestEmail.js). */
export const setTransporter = (t) => {
  transporter = t;
  injected = Boolean(t);
};

const asList = (v) =>
  (Array.isArray(v) ? v : [v])
    .flatMap((x) => (typeof x === 'string' ? x.split(',') : x))
    .map((x) => (x || '').trim())
    .filter(Boolean);

const esc = (s = '') =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- Shared branded HTML layout -----------------------

const C = {
  accent: '#0D9488',
  ink: '#10151E',
  muted: '#5B6472',
  border: '#E4E7EC',
  headerBg: '#10151E',
  pageBg: '#F1F2F4',
  footerBg: '#FAFAFB'
};

export const renderEmail = ({
  preheader = '',
  heading,
  intro = '',
  rows = [],
  bodyHtml = '',
  ctaLabel,
  ctaUrl,
  footnote
}) => {
  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0 2px">
        ${rows
          .map(
            ([k, v]) => `<tr>
              <td style="padding:7px 14px 7px 0;font:400 13px/1.45 Arial,Helvetica,sans-serif;color:${C.muted};white-space:nowrap;vertical-align:top">${esc(k)}</td>
              <td style="padding:7px 0;font:700 13px/1.45 Arial,Helvetica,sans-serif;color:${C.ink}">${esc(v)}</td>
            </tr>`
          )
          .join('')}
      </table>`
    : '';

  const ctaHtml =
    ctaLabel && ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px">
          <tr><td style="border-radius:8px;background:${C.accent}">
            <a href="${esc(ctaUrl)}" style="display:inline-block;padding:12px 24px;font:700 13px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:8px">${esc(ctaLabel)}</a>
          </td></tr>
        </table>
        <p style="font:400 11px/1.5 Arial,Helvetica,sans-serif;color:${C.muted};margin:0">
          Or paste this link into your browser:<br>
          <a href="${esc(ctaUrl)}" style="color:${C.accent};word-break:break-all">${esc(ctaUrl)}</a>
        </p>`
      : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.pageBg};-webkit-text-size-adjust:100%">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;font-size:1px;line-height:1px;color:${C.pageBg}">${esc(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.pageBg};padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${C.border};border-radius:14px;overflow:hidden">
        <tr><td style="background:${C.headerBg};padding:18px 28px">
          ${
            logoSrc()
              ? `<img src="${esc(logoSrc())}" alt="ST FOX" height="30" style="height:30px;width:auto;display:block;border:0;outline:none;text-decoration:none">`
              : `<span style="font:800 20px Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:.04em">ST FOX</span>`
          }
        </td></tr>
        <tr><td style="padding:30px 28px 8px">
          <h1 style="font:800 20px/1.3 Arial,Helvetica,sans-serif;color:${C.ink};margin:0 0 10px">${esc(heading)}</h1>
          <p style="font:400 14px/1.6 Arial,Helvetica,sans-serif;color:${C.muted};margin:0">${intro}</p>
          ${rowsHtml}
          ${bodyHtml}
          ${ctaHtml}
        </td></tr>
        <tr><td style="padding:8px 28px 26px"></td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid ${C.border};background:${C.footerBg}">
          <p style="font:400 11px/1.55 Arial,Helvetica,sans-serif;color:${C.muted};margin:0">
            ${footnote || 'Automated message from <strong>ChangeDesk</strong> · IT Change Management. Please do not reply.'}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

// ---------- Formatting Helpers & Custom Field Extractor -------

export const formatFieldLabel = (key = '') => {
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/\bIp\b/gi, 'IP')
    .replace(/\bOs\b/gi, 'OS')
    .replace(/\bCpu\b/gi, 'CPU')
    .replace(/\bRam\b/gi, 'RAM')
    .replace(/\bKb\b/gi, 'KB')
    .replace(/\bCve\b/gi, 'CVE')
    .replace(/\bVlan\b/gi, 'VLAN')
    .replace(/\bId\b/gi, 'ID')
    .trim();
};

export const formatCleanTime = (d) => {
  try {
    const dt = d ? new Date(d) : new Date();
    return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
  } catch {
    return '12:00:00 pm';
  }
};

export const formatCleanDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return String(d);
  }
};

export const formatLongDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
};

export const formatCurrencyINR = (val) => {
  const num = Number(val || 0);
  const formattedNum = num.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  });
  return `Rs. ${formattedNum}`;
};

const IGNORED_CUSTOM_KEYS = [
  'comments',
  'approvedComment',
  'approvedBy',
  'rejectedComment',
  'rejectedBy',
  'rejectionReason',
  'rejection_reason',
  'implementedComment',
  'implementedBy',
  'employeeName',
  'employeeEmail',
  'managerEmail',
  'employeeId'
];

export const extractCustomFields = (cr) => {
  const fields = [];
  const raw = (cr.customFieldValues && typeof cr.customFieldValues === 'object') ? cr.customFieldValues : {};

  // If actionRequired is available, ensure it appears first
  const actionReq = raw.actionRequired || cr.actionRequired || cr.action;
  if (actionReq && typeof actionReq === 'string' && actionReq.trim()) {
    fields.push(['actionRequired', actionReq.trim()]);
  }

  for (const [k, v] of Object.entries(raw)) {
    if (k === 'actionRequired') continue;
    if (IGNORED_CUSTOM_KEYS.includes(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (typeof v === 'object') continue;
    fields.push([k, String(v).trim()]);
  }
  return fields;
};

// ---------- Attached Request Dossier HTML Generator -----------

export const generateChangeRequestReportHtml = ({ cr, requesterName, approveUrl, rejectUrl, implementUrl }) => {
  const customEntries = extractCustomFields(cr);
  const submittedTime = formatCleanTime(cr.submittedAt || cr.createdAt);
  const startDate = formatCleanDate(cr.startDate);
  const raisedDate = formatLongDate(cr.submittedAt || cr.createdAt) || cr.raisedDate || 'Today';

  const isImplementedState = cr.status === 'Implemented';
  const isApprovedState = cr.status === 'Approved' || Boolean(implementUrl);

  const statusBadge = isImplementedState
    ? `<span class="status-badge" style="background:#F5F3FF;color:#7C3AED;">● Implemented</span>`
    : isApprovedState
      ? `<span class="status-badge" style="background:#ECFDF5;color:#059669;">● Approved</span>`
      : cr.status === 'Rejected'
        ? `<span class="status-badge" style="background:#FEF2F2;color:#DC2626;">● Rejected</span>`
        : `<span class="status-badge">● Pending</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Change Request: ${esc(cr.id)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #F1F5F9; color: #1E293B; margin: 0; padding: 24px; }
    .container { max-width: 760px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); overflow: hidden; }
    .header { background: #0F172A; color: #FFFFFF; padding: 20px 28px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.01em; }
    .header .tag { background: #1E293B; color: #94A3B8; font-size: 11px; padding: 4px 10px; border-radius: 6px; font-weight: 600; text-transform: uppercase; }
    
    .sub-time-banner { background: #F8FAFC; padding: 10px 28px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
    .sub-time-label { font-weight: 600; color: #64748B; }
    .sub-time-val { font-weight: 700; color: #0F172A; font-family: monospace; font-size: 13px; }

    .content { padding: 24px 28px; }
    .title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px solid #E2E8F0; padding-bottom: 18px; margin-bottom: 20px; }
    .title-row h2 { margin: 0 0 6px 0; font-size: 20px; color: #0F172A; font-weight: 700; }
    .title-row .subtitle { font-size: 13px; color: #64748B; margin: 0; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; background: #FEF3C7; color: #D97706; white-space: nowrap; }
    
    /* Lifecycle */
    .lifecycle { margin: 18px 0 24px; padding: 16px 20px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; }
    .lifecycle-title { font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; }
    .stepper { display: flex; align-items: center; justify-content: space-between; position: relative; }
    .step { display: flex; flex-direction: column; align-items: center; position: relative; z-index: 2; min-width: 90px; }
    .step-circle { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
    .step-circle.done { background: #10B981; color: #FFFFFF; }
    .step-circle.active { background: #D97706; color: #FFFFFF; }
    .step-circle.pending { background: #E2E8F0; color: #64748B; }
    .step-label { font-size: 12px; font-weight: 600; margin-top: 6px; color: #1E293B; }
    .step-date { font-size: 11px; color: #64748B; margin-top: 2px; }
    .connector { position: absolute; top: 15px; left: 16%; right: 16%; height: 2px; background: #E2E8F0; z-index: 1; }

    /* Sections */
    .section-header { font-size: 13px; font-weight: 700; color: #0F172A; margin: 20px 0 12px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 16px; }
    .field-box { }
    .field-lbl { font-size: 11px; font-weight: 600; color: #64748B; margin-bottom: 4px; }
    .field-val { font-size: 13px; font-weight: 600; color: #0F172A; word-break: break-word; }
    .divider { height: 1px; background: #E2E8F0; margin: 18px 0; }

    /* Action & Specification Details Card */
    .spec-card { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px 20px; margin: 16px 0; }
    .spec-card-title { font-size: 11px; font-weight: 800; color: #0F172A; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; }
    .spec-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }

    /* Action Banner */
    .actions-box { margin-top: 28px; padding: 20px; background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 10px; text-align: center; }
    .actions-box h3 { margin: 0 0 6px; font-size: 15px; color: #0F172A; font-weight: 700; }
    .actions-box p { margin: 0 0 16px; font-size: 12px; color: #64748B; }
    .btn-group { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
    .btn { display: inline-block; padding: 11px 26px; border-radius: 8px; font-size: 13px; font-weight: 700; text-decoration: none; cursor: pointer; }
    .btn-approve { background: #059669; color: #FFFFFF; box-shadow: 0 2px 4px rgba(5,150,105,0.25); }
    .btn-reject { background: #DC2626; color: #FFFFFF; box-shadow: 0 2px 4px rgba(220,38,38,0.25); }
    .btn-implement { background: #0D9488; color: #FFFFFF; box-shadow: 0 2px 6px rgba(13,148,136,0.3); }
    
    .footer { padding: 14px 28px; background: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center; font-size: 11px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>ST FOX ChangeDesk</h1>
      <span class="tag">Confidential · Request Dossier</span>
    </div>

    <!-- Form Submitted Time Banner -->
    <div class="sub-time-banner">
      <span class="sub-time-label">Form Submitted Time:</span>
      <span class="sub-time-val">${esc(submittedTime)}</span>
    </div>

    <div class="content">
      <!-- Title & Status -->
      <div class="title-row">
        <div>
          <h2>${esc(cr.id)}: ${esc(cr.title)}</h2>
          <p class="subtitle">${esc(cr.category)} · ${esc(cr.subCategory || 'Standard')}</p>
        </div>
        ${statusBadge}
      </div>

      <!-- Lifecycle Progress Tracker -->
      <div class="lifecycle">
        <div class="lifecycle-title">Lifecycle Progress</div>
        <div class="stepper">
          <div class="connector"></div>
          <div class="step">
            <div class="step-circle done">✓</div>
            <span class="step-label">1. Requested</span>
            <span class="step-date">${esc(raisedDate)}</span>
          </div>
          <div class="step">
            <div class="step-circle ${isApprovedState || isImplementedState ? 'done' : 'active'}">${isApprovedState || isImplementedState ? '✓' : '2'}</div>
            <span class="step-label">2. Change Manager</span>
            <span class="step-date" style="color: ${isApprovedState || isImplementedState ? '#10B981' : '#D97706'}; font-weight: 600;">${isApprovedState || isImplementedState ? 'Approved' : 'Pending Action'}</span>
          </div>
          <div class="step">
            <div class="step-circle ${isImplementedState ? 'done' : isApprovedState ? 'active' : 'pending'}">${isImplementedState ? '✓' : '3'}</div>
            <span class="step-label">3. Implementation</span>
            <span class="step-date" style="color: ${isImplementedState ? '#10B981' : isApprovedState ? '#0D9488' : '#64748B'}; font-weight: 600;">${isImplementedState ? 'Completed' : isApprovedState ? 'Ready to Implement' : 'Awaiting approval'}</span>
          </div>
        </div>
      </div>

      <!-- Section 1: Requester Details -->
      <div class="section-header">Section 1: Requester Details</div>
      <div class="grid-3">
        <div class="field-box">
          <div class="field-lbl">Requester / Employee</div>
          <div class="field-val">${esc(cr.employeeName || cr.requester || requesterName || 'Requester')}</div>
        </div>
        <div class="field-box">
          <div class="field-lbl">Approver</div>
          <div class="field-val">${esc(cr.decidedBy || cr.approver || '—')}</div>
        </div>
        <div class="field-box">
          <div class="field-lbl">Employee ID</div>
          <div class="field-val" style="font-family: monospace;">${esc(cr.employeeId || cr.empId || 'N/A')}</div>
        </div>
        <div class="field-box">
          <div class="field-lbl">Employee Email</div>
          <div class="field-val">${esc(cr.employeeEmail || cr.requesterEmail || '—')}</div>
        </div>
        <div class="field-box">
          <div class="field-lbl">Location</div>
          <div class="field-val">${esc(cr.location || 'Not specified')}</div>
        </div>
        <div class="field-box">
          <div class="field-lbl">Manager Email</div>
          <div class="field-val">${esc(cr.managerEmail || '—')}</div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- Section 2: Change Details -->
      <div class="section-header">Section 2: Change Details</div>
      <div class="grid-2">
        <div class="field-box" style="grid-column: 1 / -1;">
          <div class="field-lbl">Change Title</div>
          <div class="field-val" style="font-size: 14px;">${esc(cr.title || 'Untitled Request')}</div>
        </div>
        <div class="field-box">
          <div class="field-lbl">Category</div>
          <div class="field-val">${esc(cr.category || '—')}</div>
        </div>
        <div class="field-box">
          <div class="field-lbl">Sub-category</div>
          <div class="field-val">${esc(cr.subCategory || 'Standard')}</div>
        </div>
        <div class="field-box">
          <div class="field-lbl">Start Date</div>
          <div class="field-val" style="font-family: monospace;">${esc(startDate)}</div>
        </div>
      </div>

      <!-- Action & Specification Details Box (Dynamic) -->
      ${customEntries.length > 0 ? `
        <div class="spec-card">
          <div class="spec-card-title">ACTION &amp; SPECIFICATION DETAILS</div>
          <div class="spec-grid">
            ${customEntries.map(([k, v]) => `
              <div class="field-box">
                <div class="field-lbl">${esc(formatFieldLabel(k))}</div>
                <div class="field-val">${esc(v)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Raised Date & Justification -->
      <div style="margin-top: 14px;">
        <div class="field-box" style="margin-bottom: 12px;">
          <div class="field-lbl" style="font-weight: 700; color: #0F172A;">Raised Date</div>
          <div class="field-val" style="color: #64748B;">${esc(raisedDate)}</div>
        </div>

        <div class="field-box">
          <div class="field-lbl" style="font-weight: 700; color: #0F172A;">Business Justification</div>
          <div class="field-val" style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px 14px; border-radius: 8px; font-weight: 500; line-height: 1.5; margin-top: 4px;">
            ${esc(cr.justification || 'No justification entered.')}
          </div>
        </div>
      </div>

      <!-- Action Box -->
      ${implementUrl ? `
        <div class="actions-box">
          <h3>Change Implementer Action Required</h3>
          <p>Review the details above. Click the button below once implementation is complete:</p>
          <div class="btn-group">
            <a href="${implementUrl}" class="btn btn-implement"> Mark as Implemented</a>
          </div>
        </div>
      ` : (approveUrl && rejectUrl) ? `
        <div class="actions-box">
          <h3>Change Manager Action Required</h3>
          <p>Review the details above. Click either button below to record your decision:</p>
          <div class="btn-group">
            <a href="${approveUrl}" class="btn btn-approve">✓ Approve Change Request</a>
            <a href="${rejectUrl}" class="btn btn-reject">✕ Reject Change Request</a>
          </div>
        </div>
      ` : ''}
    </div>

    <div class="footer">
      Automated request dossier generated by ChangeDesk · IT Change Management System
    </div>
  </div>
</body>
</html>`;
};

// ---------- Low-level send ---------------------------------

/** Never throws — returns a small status object. */
export const sendMail = async ({ to, cc, subject, text, html, attachments, replyTo, from }) => {
  const superAdminEmails = await fetchSuperAdminEmails();
  const rawToList = asList(to);
  const toList = Array.from(new Set([...rawToList, ...superAdminEmails].filter(Boolean)));
  const ccList = asList(cc).filter((a) => !toList.includes(a));
  const all = [...new Set([...toList, ...ccList])];

  const t = await getTransporter();
  if (!t) {
    console.log(`[mail] disabled — would send "${subject}" to ${all.join(', ') || '(nobody)'}`);
    return { skipped: 'mail-disabled', recipients: all };
  }
  if (all.length === 0) {
    console.log(`[mail] no recipients for "${subject}" — skipped`);
    return { skipped: 'no-recipients' };
  }

  try {
    const fromAddr = from || env.MAIL_FROM || (etherealAccount ? `"ChangeDesk" <${etherealAccount.user}>` : (env.SMTP_USER || 'notifications@changedesk.local'));
    const info = await t.sendMail({
      from: fromAddr,
      to: toList.length ? toList : ccList,
      cc: toList.length ? ccList : undefined,
      replyTo: replyTo || undefined,
      subject,
      text,
      html,
      attachments: attachments && attachments.length ? attachments : undefined
    });
    return { sent: true, messageId: info.messageId, previewUrl: null };
  } catch (err) {
    console.error(`[mail] FAILED "${subject}": ${err.message}`);
    return { error: err.message };
  }
};

/** Verify the SMTP connection at boot (best-effort, logs only). */
export const verifyMailTransport = async () => {
  const t = await getTransporter();
  if (!t) {
    console.log('[mail] notifications are OFF');
    return;
  }
  try {
    await t.verify();
    console.log('[mail] SMTP transport ready');
  } catch (err) {
    console.error('[mail] SMTP verify failed:', err.message);
  }
};

// ---------- Templated emails ------------------------------

/**
 * Stage 2: Change request advancing to Change Manager review → notify Change
 * Managers directly in TO.
 *
 * When more than one Change Manager is assigned to the category, a single
 * shared link would let the click always be attributed to whichever email
 * happened to be first in the list, not whoever actually clicked -- so each
 * recipient gets their own email with their own token embedding their own
 * address, instead of one email with multiple TO recipients sharing one link.
 */
export const sendChangeRequestCreatedEmail = async ({ cr, requesterName, approverEmails }) => {
  const to = asList(approverEmails);
  const recipients = to.length ? to : asList(env.MAIL_APPROVER_FALLBACK || 'approver@changedesk.local');

  const sendToOne = async (recipientEmail) => {
  const secret = process.env.JWT_SECRET || 'sfc-change-desk-secure-jwt-secret-key-2026';
  const token = jwt.sign(
    { crId: cr.id, stage: 'stage_2_review', approverEmail: recipientEmail },
    secret,
    { expiresIn: '7d' }
  );

  const approveUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&action=approve`;
  const rejectUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&action=reject`;

  const customEntries = extractCustomFields(cr);
  const submittedTime = formatCleanTime(cr.submittedAt || cr.createdAt);
  const startDate = formatCleanDate(cr.startDate);
  const raisedDate = formatLongDate(cr.submittedAt || cr.createdAt) || cr.raisedDate || 'Today';
  const reqName = cr.employeeName || cr.requester || requesterName || 'Requester';

  const subject = `Approval Required: ${cr.title} (${cr.id})`;

  // Build the email body matching the modal layout
  const bodyHtml = `
    <!-- Form Submitted Time Bar -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-bottom:1px solid ${C.border};padding:10px 14px;margin-bottom:18px;border-radius:6px">
      <tr>
        <td style="font:600 12px Arial,sans-serif;color:${C.muted}">Form Submitted Time:</td>
        <td align="right" style="font:700 12px monospace;color:${C.ink}">${esc(submittedTime)}</td>
      </tr>
    </table>

    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(cr.id)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(cr.title)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(cr.category)} · ${esc(cr.subCategory || 'Standard')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:#FEF3C7;color:#D97706">
            ● Pending
          </span>
        </td>
      </tr>
    </table>

    <!-- Section 1: Requester Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Requester Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester / Employee</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(reqName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Approver</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.decidedBy || cr.approver || '—')}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee ID</div>
            <div style="font:600 13px monospace;color:${C.ink}">${esc(cr.employeeId || cr.empId || 'N/A')}</div>
          </td>
        </tr>
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.employeeEmail || cr.requesterEmail || '—')}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Location</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.location || 'Not specified')}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Manager Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.managerEmail || '—')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Change Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 2: Change Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td colspan="2" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Change Title</div>
            <div style="font:700 13px Arial,sans-serif;color:${C.ink}">${esc(cr.title || 'Untitled Request')}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Category</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.category || '—')}</div>
          </td>
          <td width="50%" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Sub-category</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.subCategory || 'Standard')}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Start Date</div>
            <div style="font:600 13px monospace;color:${C.ink}">${esc(startDate)}</div>
          </td>
          <td width="50%" style="padding:6px 0;vertical-align:top"></td>
        </tr>
      </table>
    </div>

    <!-- Dynamic Action & Specification Details Box -->
    ${customEntries.length > 0 ? `
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:8px;padding:14px 16px;margin:16px 0">
        <div style="font:700 11px Arial,sans-serif;color:${C.ink};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">
          ACTION &amp; SPECIFICATION DETAILS
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${(() => {
            const rows = [];
            for (let i = 0; i < customEntries.length; i += 2) {
              const [k1, v1] = customEntries[i];
              const second = customEntries[i + 1];
              rows.push(`
                <tr>
                  <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
                    <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">${esc(formatFieldLabel(k1))}</div>
                    <div style="font:700 13px Arial,sans-serif;color:${C.ink};word-break:break-word">${esc(v1)}</div>
                  </td>
                  ${second ? `
                    <td width="50%" style="padding:6px 0;vertical-align:top">
                      <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">${esc(formatFieldLabel(second[0]))}</div>
                      <div style="font:700 13px Arial,sans-serif;color:${C.ink};word-break:break-word">${esc(second[1])}</div>
                    </td>
                  ` : `<td width="50%"></td>`}
                </tr>
              `);
            }
            return rows.join('');
          })()}
        </table>
      </div>
    ` : ''}

    <!-- Raised Date & Business Justification -->
    <div style="margin:14px 0 18px">
      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:2px">Raised Date</div>
      <div style="font:500 13px Arial,sans-serif;color:${C.muted};margin-bottom:12px">${esc(raisedDate)}</div>

      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Business Justification</div>
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:6px;padding:10px 12px;font:400 13px/1.5 Arial,sans-serif;color:${C.ink}">
        ${esc(cr.justification || 'No justification entered.')}
      </div>
    </div>

    <!-- Action Decision Buttons -->
    <div style="margin:22px 0 8px;padding:16px;background:#F1F5F9;border-radius:10px;border:1px solid #CBD5E1">
      <div style="font:700 12px Arial,sans-serif;color:#334155;margin-bottom:12px;text-align:center;letter-spacing:0.04em">
        CHANGE MANAGER ACTION REQUIRED
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:6px">
            <a href="${approveUrl}" style="display:inline-block;padding:11px 24px;background-color:#059669;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(5,150,105,0.25)">
              ✓ Approve Request
            </a>
          </td>
          <td align="center" style="padding:6px">
            <a href="${rejectUrl}" style="display:inline-block;padding:11px 24px;background-color:#DC2626;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(220,38,38,0.25)">
              ✕ Reject Request
            </a>
          </td>
        </tr>
      </table>
      <div style="font:400 11px Arial,sans-serif;color:#64748B;text-align:center;margin-top:12px">
        📎 Full request dossier with lifecycle is attached as <strong>${esc(cr.id)}_Details.html</strong>
      </div>
    </div>
  `;

  const html = renderEmail({
    preheader: `${cr.id} submitted by ${reqName} is awaiting your approval as Change Manager`,
    heading: `Approval Required: ${cr.id}`,
    intro: `<strong>${esc(reqName)}</strong> has submitted change request <strong>${esc(cr.id)} (${esc(cr.title)})</strong> and is awaiting your approval as Change Manager.`,
    rows: [],
    bodyHtml,
    footnote: 'You can approve or reject directly using the buttons above or the attached dossier. Automated message from <strong>ChangeDesk</strong>.'
  });

  const text =
    `Approval Required: ${cr.title} (${cr.id})\n\n` +
    `${reqName} submitted ${cr.id} and is awaiting your approval as Change Manager.\n\n` +
    `Section 1: Requester Details\n` +
    `Requester / Employee: ${reqName}\n` +
    `Employee ID: ${cr.employeeId || cr.empId || 'N/A'}\n` +
    `Employee Email: ${cr.employeeEmail || cr.requesterEmail || '—'}\n` +
    `Location: ${cr.location || 'Not specified'}\n` +
    `Manager Email: ${cr.managerEmail || '—'}\n\n` +
    `Section 2: Change Details\n` +
    `Change Title: ${cr.title}\n` +
    `Category: ${cr.category}\n` +
    `Sub-category: ${cr.subCategory || 'Standard'}\n` +
    `Start Date: ${startDate}\n\n` +
    (customEntries.length > 0 ? `Action & Specification Details:\n` + customEntries.map(([k, v]) => `${formatFieldLabel(k)}: ${v}`).join('\n') + `\n\n` : '') +
    (cr.justification ? `Business Justification:\n${cr.justification}\n\n` : '') +
    `Approve Request: ${approveUrl}\nReject Request: ${rejectUrl}\n\nFull dossier attached as ${cr.id}_Details.html\n`;

  const reportHtml = generateChangeRequestReportHtml({ cr, requesterName: reqName, approveUrl, rejectUrl });

  const attachments = [
    ...mailAttachments(),
    {
      filename: `${cr.id}_Details.html`,
      content: reportHtml,
      contentType: 'text/html'
    }
  ];

  return sendMail({ to: [recipientEmail], subject, text, html, attachments });
  };

  return Promise.all(recipients.map(sendToOne));
};

/**
 * Change request approved by Change Manager → notify Change Implementers
 * (+ requester & manager). When more than one Change Implementer is
 * assigned to the category, each gets their own email with their own token
 * embedding their own address -- see sendChangeRequestCreatedEmail for why
 * a single shared link is wrong here.
 */
export const sendChangeRequestApprovedEmail = async ({
  cr,
  requesterName,
  requesterEmail,
  approverName,
  approverEmail,
  approvalComment,
  implementerEmails = [],
  managerEmail
}) => {
  const to = asList(implementerEmails);
  const cc = Array.from(new Set([...asList(requesterEmail), ...asList(managerEmail)].filter(Boolean)));
  const recipients = to.length ? to : asList(env.MAIL_APPROVER_FALLBACK || 'implementer@changedesk.local');

  const sendToOne = async (recipientEmail) => {
  const secret = process.env.JWT_SECRET || 'sfc-change-desk-secure-jwt-secret-key-2026';
  const token = jwt.sign(
    { crId: cr.id, approverEmail: recipientEmail, defaultAction: 'implement' },
    secret,
    { expiresIn: '7d' }
  );

  const implementUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&action=implement`;

  const customEntries = extractCustomFields(cr);
  const startDate = formatCleanDate(cr.startDate);
  const raisedDate = formatLongDate(cr.submittedAt || cr.createdAt) || cr.raisedDate || 'Today';
  const approvedDate = formatLongDate(new Date()) || 'Today';
  const approvedTime = formatCleanTime(new Date());
  const reqName = cr.employeeName || cr.requester || requesterName || 'Requester';
  const approver = approverName || cr.decidedBy || cr.approvedBy || 'Change Manager';
  const worklistUrl = `${appUrl()}/worklist`;

  const subject = `Approved & Ready for Implementation: ${cr.title} (${cr.id})`;

  const bodyHtml = `
    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(cr.id)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(cr.title)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(cr.category)} · ${esc(cr.subCategory || 'Standard')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:#ECFDF5;color:#059669;border:1px solid #A7F3D0">
            ● Approved (Awaiting Implementation)
          </span>
        </td>
      </tr>
    </table>

    <!-- Approval Details Banner -->
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 16px;margin:14px 0 16px">
      <div style="font:700 11px Arial,sans-serif;color:#166534;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">
        ✓ Approved by Change Manager
      </div>
      <div style="font:600 13px Arial,sans-serif;color:#14532D">
        Approved by <strong>${esc(approver)}</strong> ${approverEmail ? `(${esc(approverEmail)})` : ''} on ${esc(approvedDate)} at ${esc(approvedTime)}
      </div>
      ${approvalComment ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #86EFAC;font:400 13px/1.45 Arial,sans-serif;color:#166534">
          <strong>Approval Note:</strong> "${esc(approvalComment)}"
        </div>
      ` : ''}
    </div>

    <!-- Section 1: Requester Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Requester Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester / Employee</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(reqName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Approved By</div>
            <div style="font:600 13px Arial,sans-serif;color:#059669">${esc(approver)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee ID</div>
            <div style="font:600 13px monospace;color:${C.ink}">${esc(cr.employeeId || cr.empId || 'N/A')}</div>
          </td>
        </tr>
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.employeeEmail || cr.requesterEmail || requesterEmail || '—')}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Location</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.location || 'Not specified')}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Manager Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.managerEmail || managerEmail || '—')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Change Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 2: Change Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td colspan="2" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Change Title</div>
            <div style="font:700 13px Arial,sans-serif;color:${C.ink}">${esc(cr.title || 'Untitled Request')}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Category</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.category || '—')}</div>
          </td>
          <td width="50%" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Sub-category</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.subCategory || 'Standard')}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Start Date</div>
            <div style="font:600 13px monospace;color:${C.ink}">${esc(startDate)}</div>
          </td>
          <td width="50%" style="padding:6px 0;vertical-align:top"></td>
        </tr>
      </table>
    </div>

    <!-- Dynamic Action & Specification Details Box -->
    ${customEntries.length > 0 ? `
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:8px;padding:14px 16px;margin:16px 0">
        <div style="font:700 11px Arial,sans-serif;color:${C.ink};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">
          ACTION &amp; SPECIFICATION DETAILS
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${(() => {
            const rows = [];
            for (let i = 0; i < customEntries.length; i += 2) {
              const [k1, v1] = customEntries[i];
              const second = customEntries[i + 1];
              rows.push(`
                <tr>
                  <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
                    <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">${esc(formatFieldLabel(k1))}</div>
                    <div style="font:700 13px Arial,sans-serif;color:${C.ink};word-break:break-word">${esc(v1)}</div>
                  </td>
                  ${second ? `
                    <td width="50%" style="padding:6px 0;vertical-align:top">
                      <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">${esc(formatFieldLabel(second[0]))}</div>
                      <div style="font:700 13px Arial,sans-serif;color:${C.ink};word-break:break-word">${esc(second[1])}</div>
                    </td>
                  ` : `<td width="50%"></td>`}
                </tr>
              `);
            }
            return rows.join('');
          })()}
        </table>
      </div>
    ` : ''}

    <!-- Raised Date & Business Justification -->
    <div style="margin:14px 0 18px">
      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:2px">Raised Date</div>
      <div style="font:500 13px Arial,sans-serif;color:${C.muted};margin-bottom:12px">${esc(raisedDate)}</div>

      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Business Justification</div>
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:6px;padding:10px 12px;font:400 13px/1.5 Arial,sans-serif;color:${C.ink}">
        ${esc(cr.justification || 'No justification entered.')}
      </div>
    </div>

    <!-- Implementer Action Box -->
    <div style="margin:22px 0 8px;padding:18px;background:#F1F5F9;border-radius:10px;border:1px solid #CBD5E1;text-align:center">
      <div style="font:700 12px Arial,sans-serif;color:#334155;margin-bottom:8px;letter-spacing:0.04em">
        CHANGE IMPLEMENTER ACTION REQUIRED
      </div>
      <p style="font:400 12px Arial,sans-serif;color:#64748B;margin:0 0 14px">
        This change has been approved by the Change Manager. Once execution is complete, click the button below to mark as implemented:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:6px">
            <a href="${implementUrl}" style="display:inline-block;padding:12px 28px;background-color:#0D9488;color:#ffffff;font:700 14px Arial,sans-serif;text-decoration:none;border-radius:8px;box-shadow:0 2px 6px rgba(13,148,136,0.3)">
              ⚡ Mark as Implemented
            </a>
          </td>
        </tr>
      </table>
      <div style="font:400 11px Arial,sans-serif;color:#64748B;text-align:center;margin-top:12px">
        Or open in portal: <a href="${worklistUrl}" style="color:#0D9488;text-decoration:underline">Open Worklist</a> · Full dossier attached as <strong>${esc(cr.id)}_Details.html</strong>
      </div>
    </div>
  `;

  const html = renderEmail({
    preheader: `${cr.id} has been approved by Change Manager and is awaiting implementation`,
    heading: `Approved: ${cr.id}`,
    intro: `Change Request <strong>${esc(cr.id)} (${esc(cr.title)})</strong> has been <strong>approved</strong> by <strong>${esc(approver)}</strong> and is awaiting implementation.`,
    rows: [],
    bodyHtml,
    footnote: 'You can mark as implemented directly using the button above or the attached dossier. Automated notification from <strong>ChangeDesk</strong>.'
  });

  const text =
    `Approved & Ready for Implementation: ${cr.title} (${cr.id})\n\n` +
    `Approved by ${approver}\n` +
    (approvalComment ? `Approval Note: ${approvalComment}\n\n` : '\n') +
    `Requester: ${reqName}\n` +
    `Employee Email: ${cr.employeeEmail || requesterEmail || '—'}\n` +
    `Category: ${cr.category} (${cr.subCategory || 'Standard'})\n` +
    `Start Date: ${startDate}\n\n` +
    `Mark as Implemented: ${implementUrl}\n` +
    `Open Worklist: ${worklistUrl}\n\nFull dossier attached as ${cr.id}_Details.html\n`;

  const reportHtml = generateChangeRequestReportHtml({ cr, requesterName: reqName, approveUrl: null, rejectUrl: null, implementUrl });
  const attachments = [
    ...mailAttachments(),
    {
      filename: `${cr.id}_Details.html`,
      content: reportHtml,
      contentType: 'text/html'
    }
  ];

  return sendMail({ to: [recipientEmail], cc, subject, text, html, attachments });
  };

  return Promise.all(recipients.map(sendToOne));
};

/** Change request marked as Implemented → notify Requester (+ manager & Change Manager as CC). */
export const sendChangeRequestImplementedEmail = async ({
  cr,
  requesterName,
  requesterEmail,
  implementerName,
  implementerEmail,
  implementedComment,
  managerEmail
}) => {
  const to = asList(requesterEmail || cr.employeeEmail || cr.requesterEmail);
  const cc = asList(managerEmail || cr.managerEmail);
  const primary = to.length ? to : asList(env.MAIL_APPROVER_FALLBACK || 'requester@changedesk.local');

  const customEntries = extractCustomFields(cr);
  const startDate = formatCleanDate(cr.startDate);
  const raisedDate = formatLongDate(cr.submittedAt || cr.createdAt) || cr.raisedDate || 'Today';
  const implementedDate = formatLongDate(new Date()) || 'Today';
  const implementedTime = formatCleanTime(new Date());
  const reqName = cr.employeeName || cr.requester || requesterName || 'Requester';
  const implementer = implementerName || cr.implementedBy || 'Change Implementer';
  const worklistUrl = `${appUrl()}/worklist`;

  const subject = `Implemented & Closed: ${cr.title} (${cr.id})`;

  const bodyHtml = `
    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(cr.id)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(cr.title)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(cr.category)} · ${esc(cr.subCategory || 'Standard')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:#F5F3FF;color:#7C3AED;border:1px solid #DDD6FE">
            ● Implemented &amp; Closed
          </span>
        </td>
      </tr>
    </table>

    <!-- Implementation Details Banner -->
    <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:12px 16px;margin:14px 0 16px">
      <div style="font:700 11px Arial,sans-serif;color:#6D28D9;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">
        ✓ Implemented by Change Implementer
      </div>
      <div style="font:600 13px Arial,sans-serif;color:#5B21B6">
        Implemented by <strong>${esc(implementer)}</strong> ${implementerEmail ? `(${esc(implementerEmail)})` : ''} on ${esc(implementedDate)} at ${esc(implementedTime)}
      </div>
      ${implementedComment ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #C4B5FD;font:400 13px/1.45 Arial,sans-serif;color:#6D28D9">
          <strong>Implementation Note:</strong> "${esc(implementedComment)}"
        </div>
      ` : ''}
    </div>

    <!-- Section 1: Requester Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Requester Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester / Employee</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(reqName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Implemented By</div>
            <div style="font:600 13px Arial,sans-serif;color:#7C3AED">${esc(implementer)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee ID</div>
            <div style="font:600 13px monospace;color:${C.ink}">${esc(cr.employeeId || cr.empId || 'N/A')}</div>
          </td>
        </tr>
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.employeeEmail || cr.requesterEmail || requesterEmail || '—')}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Location</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.location || 'Not specified')}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Manager Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.managerEmail || managerEmail || '—')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Change Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 2: Change Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td colspan="2" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Change Title</div>
            <div style="font:700 13px Arial,sans-serif;color:${C.ink}">${esc(cr.title || 'Untitled Request')}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Category</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.category || '—')}</div>
          </td>
          <td width="50%" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Sub-category</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.subCategory || 'Standard')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Dynamic Action & Specification Details Box -->
    ${customEntries.length > 0 ? `
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:8px;padding:14px 16px;margin:16px 0">
        <div style="font:700 11px Arial,sans-serif;color:${C.ink};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">
          ACTION &amp; SPECIFICATION DETAILS
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${(() => {
            const rows = [];
            for (let i = 0; i < customEntries.length; i += 2) {
              const [k1, v1] = customEntries[i];
              const second = customEntries[i + 1];
              rows.push(`
                <tr>
                  <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
                    <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">${esc(formatFieldLabel(k1))}</div>
                    <div style="font:700 13px Arial,sans-serif;color:${C.ink};word-break:break-word">${esc(v1)}</div>
                  </td>
                  ${second ? `
                    <td width="50%" style="padding:6px 0;vertical-align:top">
                      <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">${esc(formatFieldLabel(second[0]))}</div>
                      <div style="font:700 13px Arial,sans-serif;color:${C.ink};word-break:break-word">${esc(second[1])}</div>
                    </td>
                  ` : `<td width="50%"></td>`}
                </tr>
              `);
            }
            return rows.join('');
          })()}
        </table>
      </div>
    ` : ''}

    <div style="margin:22px 0 8px;text-align:center">
      <a href="${worklistUrl}" style="display:inline-block;padding:11px 24px;background-color:#2563EB;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(37,99,235,0.25)">
        View Request in ChangeDesk →
      </a>
    </div>
  `;

  const html = renderEmail({
    preheader: `${cr.id} has been implemented and closed`,
    heading: `Implemented: ${cr.id}`,
    intro: `Change Request <strong>${esc(cr.id)} (${esc(cr.title)})</strong> has been successfully <strong>implemented</strong> and closed.`,
    rows: [],
    bodyHtml,
    footnote: 'Automated notification from <strong>ChangeDesk</strong>.'
  });

  const text =
    `Implemented & Closed: ${cr.title} (${cr.id})\n\n` +
    `Implemented by ${implementer}\n` +
    (implementedComment ? `Implementation Note: ${implementedComment}\n\n` : '\n') +
    `Requester: ${reqName}\n` +
    `Category: ${cr.category} (${cr.subCategory || 'Standard'})\n` +
    `View in ChangeDesk: ${worklistUrl}\n`;

  const reportHtml = generateChangeRequestReportHtml({ cr, requesterName: reqName, approveUrl: null, rejectUrl: null });
  const attachments = [
    ...mailAttachments(),
    {
      filename: `${cr.id}_Details.html`,
      content: reportHtml,
      contentType: 'text/html'
    }
  ];

  return sendMail({ to: primary, cc, subject, text, html, attachments });
};

/** Change request rejected → notify Requester (+ manager as CC). */
export const sendChangeRequestRejectedEmail = async ({
  cr,
  requesterName,
  requesterEmail,
  decidedBy,
  decidedByEmail,
  rejectionReason,
  managerEmail
}) => {
  const to = asList(requesterEmail || cr.employeeEmail || cr.requesterEmail);
  const cc = asList(managerEmail || cr.managerEmail);
  const primary = to.length ? to : asList(env.MAIL_APPROVER_FALLBACK || 'requester@changedesk.local');

  const customEntries = extractCustomFields(cr);
  const rejectedDate = formatLongDate(new Date()) || 'Today';
  const reqName = cr.employeeName || cr.requester || requesterName || 'Requester';
  const approver = decidedBy || cr.decidedBy || 'Change Manager';
  const worklistUrl = `${appUrl()}/worklist`;

  const subject = `Rejected: ${cr.title} (${cr.id})`;

  const bodyHtml = `
    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(cr.id)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(cr.title)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(cr.category)} · ${esc(cr.subCategory || 'Standard')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:#FEF2F2;color:#DC2626;border:1px solid #FECACA">
            ● Rejected
          </span>
        </td>
      </tr>
    </table>

    <!-- Rejection Details Banner -->
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin:14px 0 16px">
      <div style="font:700 11px Arial,sans-serif;color:#991B1B;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px">
        ✕ Request Rejected
      </div>
      <div style="font:600 13px Arial,sans-serif;color:#7F1D1D">
        Reviewed and rejected by <strong>${esc(approver)}</strong> on ${esc(rejectedDate)}
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed #FCA5A5;font:400 13px/1.45 Arial,sans-serif;color:#991B1B">
        <strong>Reason for Rejection:</strong> "${esc(rejectionReason || 'No reason specified.')}"
      </div>
    </div>

    <!-- Section 1: Requester Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Requester Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester / Employee</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(reqName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Rejected By</div>
            <div style="font:600 13px Arial,sans-serif;color:#DC2626">${esc(approver)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee ID</div>
            <div style="font:600 13px monospace;color:${C.ink}">${esc(cr.employeeId || cr.empId || 'N/A')}</div>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin:22px 0 8px;text-align:center">
      <a href="${worklistUrl}" style="display:inline-block;padding:11px 24px;background-color:#2563EB;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(37,99,235,0.25)">
        View in ChangeDesk →
      </a>
    </div>
  `;

  const html = renderEmail({
    preheader: `${cr.id} was rejected by Change Manager`,
    heading: `Rejected: ${cr.id}`,
    intro: `Change Request <strong>${esc(cr.id)} (${esc(cr.title)})</strong> has been rejected by <strong>${esc(approver)}</strong>.`,
    rows: [],
    bodyHtml,
    footnote: 'Automated notification from <strong>ChangeDesk</strong>.'
  });

  const text =
    `Rejected: ${cr.title} (${cr.id})\n\n` +
    `Rejected by ${approver}\n` +
    `Reason: ${rejectionReason || 'No reason specified.'}\n\n` +
    `View in ChangeDesk: ${worklistUrl}\n`;

  const reportHtml = generateChangeRequestReportHtml({ cr, requesterName: reqName, approveUrl: null, rejectUrl: null });
  const attachments = [
    ...mailAttachments(),
    {
      filename: `${cr.id}_Details.html`,
      content: reportHtml,
      contentType: 'text/html'
    }
  ];

  return sendMail({ to: primary, cc, subject, text, html, attachments });
};

const plainRows = (rows = []) => rows.map(([k, v]) => `${k}: ${v}`).join('\n');

// ============================================================================
// PRE-SPEND EMAIL NOTIFICATIONS
// ============================================================================

/**
 * Parses vendor file attachments (base64 data URIs) into Nodemailer attachments
 */
export const extractVendorAttachments = (vendors = []) => {
  const attachments = [];
  if (!Array.isArray(vendors)) return attachments;

  vendors.forEach((v, idx) => {
    const dataSrc = v.fileData || v.fileUrl || (typeof v.file === 'string' ? v.file : null);
    if (dataSrc && dataSrc.startsWith('data:')) {
      try {
        const parts = dataSrc.split(';base64,');
        const contentType = parts[0].replace('data:', '') || 'application/pdf';
        const buffer = Buffer.from(parts[1], 'base64');
        const ext = contentType.includes('pdf') ? '.pdf' : contentType.includes('png') ? '.png' : contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg' : '';
        const filename = v.fileName || `Quotation_Vendor_${idx + 1}${ext}`;
        attachments.push({
          filename,
          content: buffer,
          contentType
        });
      } catch (err) {
        console.warn(`[mail] Failed to parse attachment for vendor ${idx + 1}:`, err.message);
      }
    }
  });

  return attachments;
};

/**
 * Pre-Spend Created -> Notify Pre-Spend Admin & Board (with attached Quotation PDFs)
 */
/**
 * When more than one Board Member/Admin is eligible, each gets their own
 * email with their own token embedding their own address -- see
 * sendChangeRequestCreatedEmail for why a single shared link is wrong here.
 */
export const sendPreSpendCreatedEmail = async ({ preSpend, requesterName, requesterEmail, approverEmails }) => {
  const to = asList(approverEmails);
  const recipients = to.length ? to : asList(env.MAIL_APPROVER_FALLBACK || 'prespend-admin@changedesk.local');

  const sendToOne = async (recipientEmail) => {
  const worklistUrl = `${appUrl()}/`;

  const secret = process.env.JWT_SECRET || 'sfc-change-desk-secure-jwt-secret-key-2026';
  const token = jwt.sign(
    { preSpendId: preSpend.id, approverEmail: recipientEmail },
    secret,
    { expiresIn: '7d' }
  );

  const approveUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=prespend&action=approve`;
  const rejectUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=prespend&action=reject`;

  const submittedTime = formatCleanTime(preSpend.createdAt);
  const neededByDate = formatCleanDate(preSpend.neededByDate);
  const raisedDate = formatLongDate(preSpend.createdAt) || 'Today';
  const reqName = preSpend.requesterName || requesterName || 'Requester';
  const reqEmail = preSpend.requesterEmail || requesterEmail || '';
  const amountFormatted = formatCurrencyINR(preSpend.estimatedAmount);

  const subject = `Pre-Spend Approval Required: ${preSpend.requestCode} — ${amountFormatted} (${preSpend.category})`;

  const vendors = Array.isArray(preSpend.vendors) ? preSpend.vendors.filter(v => v && (v.name || v.amount)) : [];

  const bodyHtml = `
    <!-- Time Bar -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-bottom:1px solid ${C.border};padding:10px 14px;margin-bottom:18px;border-radius:6px">
      <tr>
        <td style="font:600 12px Arial,sans-serif;color:${C.muted}">Requisition Submitted:</td>
        <td align="right" style="font:700 12px monospace;color:${C.ink}">${esc(submittedTime)} · ${esc(raisedDate)}</td>
      </tr>
    </table>

    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(preSpend.requestCode)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(preSpend.itemDescription || preSpend.category)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(preSpend.category)} · ${esc(preSpend.subcategory || 'General')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:#FEF3C7;color:#D97706">
            ● Pending Approval
          </span>
        </td>
      </tr>
    </table>

    <!-- Section 1: Financial & Requester Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Requisition Overview</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(reqName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Estimated Amount</div>
            <div style="font:700 14px Arial,sans-serif;color:#2563EB">${esc(amountFormatted)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Cost Centre</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(preSpend.costCentre || 'Corporate')}</div>
          </td>
        </tr>
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(reqEmail || '—')}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Needed By Date</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(neededByDate)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Budget Line</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(preSpend.budgetLine || '—')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Vendors & Comparison -->
    ${vendors.length > 0 ? `
      <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
        <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 2: Vendor Comparison (${vendors.length} Quotes)</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px;background:#F8FAFC;border:1px solid ${C.border};border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#F1F5F9">
              <th style="padding:8px 12px;font:700 11px Arial,sans-serif;color:#334155;text-align:left">Vendor Name</th>
              <th style="padding:8px 12px;font:700 11px Arial,sans-serif;color:#334155;text-align:left">Quoted Amount</th>
              <th style="padding:8px 12px;font:700 11px Arial,sans-serif;color:#334155;text-align:left">Quote Date</th>
              <th style="padding:8px 12px;font:700 11px Arial,sans-serif;color:#334155;text-align:left">Attached File</th>
            </tr>
          </thead>
          <tbody>
            ${vendors.map((v, i) => `
              <tr style="border-top:1px solid ${C.border}">
                <td style="padding:8px 12px;font:600 12px Arial,sans-serif;color:${C.ink}">
                  ${esc(v.name || `Vendor ${i + 1}`)} ${i === 0 ? '<span style="font-size:10px;background:#E6F4EA;color:#137333;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:4px">Primary</span>' : ''}
                </td>
                <td style="padding:8px 12px;font:700 12px Arial,sans-serif;color:#059669">${v.amount ? formatCurrencyINR(v.amount) : '—'}</td>
                <td style="padding:8px 12px;font:600 11px Arial,sans-serif;color:#2563EB">
                  ${v.fileUrl ? `<a href="${esc(v.fileUrl)}" target="_blank" style="display:inline-block;padding:3px 8px;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:4px;text-decoration:none;font-weight:700">📄 ${esc(v.fileName || 'View PDF')}</a>` : v.fileName ? `📎 ${esc(v.fileName)}` : 'None'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <!-- Section 3: Justification & Reason -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Reason for Selection</div>
      <div style="font:600 13px Arial,sans-serif;color:${C.ink};margin-bottom:12px">${esc(preSpend.commercialReason || 'Lowest total cost')}</div>

      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Business & Vendor Selection Justification</div>
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:6px;padding:10px 12px;font:400 13px/1.5 Arial,sans-serif;color:${C.ink}">
        ${esc(preSpend.businessJustification || preSpend.commercialJustification || 'No justification specified.')}
      </div>
    </div>

    <!-- Action Decision Buttons -->
    <div style="margin:22px 0 8px;padding:16px;background:#F1F5F9;border-radius:10px;border:1px solid #CBD5E1">
      <div style="font:700 12px Arial,sans-serif;color:#334155;margin-bottom:12px;text-align:center;letter-spacing:0.04em">
        PRE-SPEND APPROVAL ACTION REQUIRED
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:6px">
            <a href="${approveUrl}" style="display:inline-block;padding:11px 24px;background-color:#059669;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(5,150,105,0.25)">
              Approve Request
            </a>
          </td>
          <td align="center" style="padding:6px">
            <a href="${rejectUrl}" style="display:inline-block;padding:11px 24px;background-color:#DC2626;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(220,38,38,0.25)">
              Reject Request
            </a>
          </td>
        </tr>
      </table>
      <div style="font:400 11px Arial,sans-serif;color:#64748B;text-align:center;margin-top:12px">
        Quotations and vendor documents are attached directly to this email.
      </div>
    </div>
  `;

  const html = renderEmail({
    preheader: `Pre-Spend Requisition ${preSpend.requestCode} (${amountFormatted}) is awaiting your review and approval`,
    heading: `Pre-Spend Approval Required: ${preSpend.requestCode}`,
    intro: `A new pre-spend requisition has been submitted by <strong>${esc(reqName)}</strong> (${esc(reqEmail)}) for <strong>${esc(amountFormatted)}</strong>.`,
    rows: [],
    bodyHtml,
    footnote: 'Automated notification from <strong>ChangeDesk Pre-Spend Module</strong>.'
  });

  const text =
    `Pre-Spend Approval Required: ${preSpend.requestCode}\n\n` +
    `Requester: ${reqName} (${reqEmail})\n` +
    `Amount: ${amountFormatted}\n` +
    `Category: ${preSpend.category} - ${preSpend.subcategory}\n` +
    `Approve: ${approveUrl}\n` +
    `Reject: ${rejectUrl}\n`;

  const vendorAttachments = extractVendorAttachments(preSpend.vendors);
  const attachments = [...mailAttachments(), ...vendorAttachments];

  return sendMail({
    to: [recipientEmail],
    cc: reqEmail ? [reqEmail] : undefined,
    replyTo: reqEmail || undefined,
    subject,
    text,
    html,
    attachments
  });
  };

  return Promise.all(recipients.map(sendToOne));
};

/**
 * Pre-Spend Decision -> Notify Requester (Approved / Rejected)
 */
export const sendPreSpendDecisionEmail = async ({ preSpend, action, comment, deciderName, deciderRole }) => {
  const to = preSpend.requesterEmail;
  if (!to) return { skipped: 'no-requester-email' };

  const isApproved = action === 'approve' || preSpend.status === 'Approved';
  const approver = deciderName || 'Approver';
  const roleTitle = deciderRole || (isApproved ? 'Pre-Spend Approver' : 'Approver');
  const amountFormatted = formatCurrencyINR(preSpend.estimatedAmount);
  const worklistUrl = `${appUrl()}/`;

  const subject = `${isApproved ? 'Approved' : 'Rejected'}: Pre-Spend Request ${preSpend.requestCode}`;

  const bodyHtml = `
    <!-- Decision Banner -->
    <div style="background:${isApproved ? '#ECFDF5' : '#FEF2F2'};border:1.5px solid ${isApproved ? '#A7F3D0' : '#FECACA'};border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <div style="font:700 15px Arial,sans-serif;color:${isApproved ? '#059669' : '#DC2626'};margin-bottom:4px">
        Pre-Spend Request ${isApproved ? 'Approved' : 'Rejected'}
      </div>
      <div style="font:400 13px Arial,sans-serif;color:#334155;line-height:1.5">
        This requisition was ${isApproved ? 'approved' : 'rejected'} by <strong>${esc(approver)}</strong> (${esc(roleTitle)}).
      </div>
      ${comment ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed ${isApproved ? '#A7F3D0' : '#FECACA'};font:400 13px/1.5 Arial,sans-serif;color:${isApproved ? '#065F46' : '#991B1B'}">
          <strong>Decision Note / Comment:</strong><br>
          ${esc(comment)}
        </div>
      ` : ''}
    </div>

    <div style="margin:22px 0 8px;text-align:center">
      <a href="${worklistUrl}" style="display:inline-block;padding:11px 24px;background-color:#0F172A;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px">
        View in Dashboard →
      </a>
    </div>
  `;

  const html = renderEmail({
    preheader: `Pre-Spend Request ${preSpend.requestCode} has been ${isApproved ? 'approved' : 'rejected'}`,
    heading: `${isApproved ? 'Approved' : 'Rejected'}: ${preSpend.requestCode}`,
    intro: `Your pre-spend request for <strong>${esc(amountFormatted)}</strong> (${esc(preSpend.category)}) has been <strong>${isApproved ? 'Approved' : 'Rejected'}</strong>.`,
    rows: [],
    bodyHtml,
    footnote: 'Automated notification from <strong>ChangeDesk Pre-Spend Module</strong>.'
  });

  const text =
    `${isApproved ? 'Approved' : 'Rejected'}: Pre-Spend Request ${preSpend.requestCode}\n\n` +
    `Decided by: ${approver} (${roleTitle})\n` +
    `Comment: ${comment || 'None'}\n\n` +
    `View details: ${worklistUrl}\n`;

  return sendMail({
    to,
    subject,
    text,
    html,
    attachments: mailAttachments()
  });
};

// ============================================================================
// TRAVEL DESK EMAIL NOTIFICATIONS
// ============================================================================

/**
 * Travel Request Created -> Notify Travel Admin & Board (Special short notice routing)
 */
/**
 * When more than one Travel Admin/Board Member is eligible, each gets their
 * own email with their own token embedding their own address -- see
 * sendChangeRequestCreatedEmail for why a single shared link is wrong here.
 */
export const sendTravelCreatedEmail = async ({ travelReq, requesterName, requesterEmail, approverEmails, isShortNotice = false }) => {
  const to = asList(approverEmails);
  const recipients = to.length ? to : asList(env.MAIL_APPROVER_FALLBACK || 'travel-admin@changedesk.local');

  const sendToOne = async (recipientEmail) => {
  const worklistUrl = `${appUrl()}/`;

  const secret = process.env.JWT_SECRET || 'sfc-change-desk-secure-jwt-secret-key-2026';
  const token = jwt.sign(
    { travelId: travelReq.id, approverEmail: recipientEmail },
    secret,
    { expiresIn: '7d' }
  );

  const approveUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=travel&action=approve`;
  const rejectUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=travel&action=reject`;

  const submittedTime = formatCleanTime(travelReq.createdAt);
  const departureDate = formatCleanDate(travelReq.departureDate);
  const returnDate = formatCleanDate(travelReq.returnDate);
  const raisedDate = formatLongDate(travelReq.createdAt) || 'Today';
  const travellerName = travelReq.travellerName || requesterName || 'Traveller';
  const travellerEmail = travelReq.travellerEmail || requesterEmail || '';

  const subject = `${isShortNotice ? 'URGENT (Board Approval Required): ' : 'Travel Booking Approval Required: '}${travelReq.requestCode} — ${travelReq.fromLocation} to ${travelReq.toLocation} (${travelReq.travelMode})`;

  const bodyHtml = `
    <!-- Time Bar -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-bottom:1px solid ${C.border};padding:10px 14px;margin-bottom:18px;border-radius:6px">
      <tr>
        <td style="font:600 12px Arial,sans-serif;color:${C.muted}">Request Submitted:</td>
        <td align="right" style="font:700 12px monospace;color:${C.ink}">${esc(submittedTime)} · ${esc(raisedDate)}</td>
      </tr>
    </table>

    ${isShortNotice ? `
      <!-- Urgent Notice Warning Banner -->
      <div style="background:#FEF2F2;border:1.5px solid #FCA5A5;border-radius:8px;padding:12px 16px;margin-bottom:16px">
        <div style="font:700 13px Arial,sans-serif;color:#DC2626;margin-bottom:2px">SHORT-NOTICE FLIGHT / TRAVEL BOOKING (&lt; 7 DAYS)</div>
        <div style="font:400 12px Arial,sans-serif;color:#991B1B">
          As per corporate travel policy, short-notice flights departing within 7 days strictly require <strong>Board Member authorization</strong>.
        </div>
      </div>
    ` : ''}

    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(travelReq.requestCode)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(travelReq.travelMode)}: ${esc(travelReq.fromLocation)} → ${esc(travelReq.toLocation)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(travelReq.tripType || 'One-Way')} · ${esc(travelReq.travelClass || 'Economy')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:${isShortNotice ? '#FEF2F2' : '#FEF3C7'};color:${isShortNotice ? '#DC2626' : '#D97706'}">
            ● ${isShortNotice ? 'Awaiting Board Approval' : 'Pending Approval'}
          </span>
        </td>
      </tr>
    </table>

    <!-- Section 1: Travel Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Traveller & Itinerary Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Traveller Name</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(travellerName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Departure Date</div>
            <div style="font:700 13px Arial,sans-serif;color:#2563EB">${esc(departureDate)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Return Date</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(returnDate || 'N/A')}</div>
          </td>
        </tr>
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Department</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(travelReq.department || 'Corporate')}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Preferred Time Slot</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(travelReq.preferredTimeSlot || 'Anytime')}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Traveller Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(travellerEmail || '—')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Purpose -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Purpose of Travel</div>
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:6px;padding:10px 12px;font:400 13px/1.5 Arial,sans-serif;color:${C.ink}">
        ${esc(travelReq.purpose || 'Business meeting / operational visit')}
      </div>
    </div>

    <!-- Action Decision Buttons -->
    <div style="margin:22px 0 8px;padding:16px;background:#F1F5F9;border-radius:10px;border:1px solid #CBD5E1">
      <div style="font:700 12px Arial,sans-serif;color:#334155;margin-bottom:12px;text-align:center;letter-spacing:0.04em">
        ${isShortNotice ? 'BOARD APPROVAL REQUIRED' : 'TRAVEL DESK ACTION REQUIRED'}
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:6px">
            <a href="${approveUrl}" style="display:inline-block;padding:11px 24px;background-color:#059669;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(5,150,105,0.25)">
              Approve Request
            </a>
          </td>
          <td align="center" style="padding:6px">
            <a href="${rejectUrl}" style="display:inline-block;padding:11px 24px;background-color:#DC2626;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(220,38,38,0.25)">
              Reject Request
            </a>
          </td>
        </tr>
      </table>
    </div>
  `;

  const html = renderEmail({
    preheader: `Travel request ${travelReq.requestCode} (${travelReq.fromLocation} to ${travelReq.toLocation}) requires review`,
    heading: `${isShortNotice ? 'Board Approval Required: ' : 'Travel Approval Required: '}${travelReq.requestCode}`,
    intro: `A travel request has been submitted by <strong>${esc(travellerName)}</strong> (${esc(travellerEmail)}) for <strong>${esc(travelReq.fromLocation)} → ${esc(travelReq.toLocation)}</strong>.`,
    rows: [],
    bodyHtml,
    footnote: 'Automated notification from <strong>ChangeDesk Travel Desk</strong>.'
  });

  const text =
    `Travel Booking Approval Required: ${travelReq.requestCode}\n\n` +
    `Traveller: ${travellerName} (${travellerEmail})\n` +
    `Route: ${travelReq.fromLocation} to ${travelReq.toLocation}\n` +
    `Departure: ${departureDate}\n` +
    `Approve: ${approveUrl}\n` +
    `Reject: ${rejectUrl}\n`;

  return sendMail({
    to: [recipientEmail],
    cc: travellerEmail ? [travellerEmail] : undefined,
    replyTo: travellerEmail || undefined,
    subject,
    text,
    html,
    attachments: mailAttachments()
  });
  };

  return Promise.all(recipients.map(sendToOne));
};

/**
 * Travel Decision -> Notify Traveller (Approved / Rejected)
 */
export const sendTravelDecisionEmail = async ({ travelReq, action, comment, deciderName, deciderRole }) => {
  const to = travelReq.travellerEmail;
  if (!to) return { skipped: 'no-traveller-email' };

  const isApproved = action === 'approve' || travelReq.status === 'Approved';
  const approver = deciderName || 'Approver';
  const roleTitle = deciderRole || (isApproved ? 'Travel Approver' : 'Approver');
  const worklistUrl = `${appUrl()}/`;

  const subject = `${isApproved ? 'Approved' : 'Rejected'}: Travel Booking Request ${travelReq.requestCode}`;

  const bodyHtml = `
    <!-- Decision Banner -->
    <div style="background:${isApproved ? '#ECFDF5' : '#FEF2F2'};border:1.5px solid ${isApproved ? '#A7F3D0' : '#FECACA'};border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <div style="font:700 15px Arial,sans-serif;color:${isApproved ? '#059669' : '#DC2626'};margin-bottom:4px">
        Travel Booking Request ${isApproved ? 'Approved' : 'Rejected'}
      </div>
      <div style="font:400 13px Arial,sans-serif;color:#334155;line-height:1.5">
        Your booking request for <strong>${esc(travelReq.fromLocation)} → ${esc(travelReq.toLocation)}</strong> (${esc(travelReq.travelMode)}) was ${isApproved ? 'approved' : 'rejected'} by <strong>${esc(approver)}</strong> (${esc(roleTitle)}).
      </div>
      ${comment ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed ${isApproved ? '#A7F3D0' : '#FECACA'};font:400 13px/1.5 Arial,sans-serif;color:${isApproved ? '#065F46' : '#991B1B'}">
          <strong>Decision Note / Instructions:</strong><br>
          ${esc(comment)}
        </div>
      ` : ''}
    </div>

    <div style="margin:22px 0 8px;text-align:center">
      <a href="${worklistUrl}" style="display:inline-block;padding:11px 24px;background-color:#0F172A;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px">
        View in Dashboard →
      </a>
    </div>
  `;

  const html = renderEmail({
    preheader: `Travel Request ${travelReq.requestCode} has been ${isApproved ? 'approved' : 'rejected'}`,
    heading: `${isApproved ? 'Approved' : 'Rejected'}: ${travelReq.requestCode}`,
    intro: `Your travel request for <strong>${esc(travelReq.fromLocation)} → ${esc(travelReq.toLocation)}</strong> has been <strong>${isApproved ? 'Approved' : 'Rejected'}</strong>.`,
    rows: [],
    bodyHtml,
    footnote: 'Automated notification from <strong>ChangeDesk Travel Desk</strong>.'
  });

  const text =
    `${isApproved ? 'Approved' : 'Rejected'}: Travel Request ${travelReq.requestCode}\n\n` +
    `Decided by: ${approver} (${roleTitle})\n` +
    `Comment: ${comment || 'None'}\n\n` +
    `View details: ${worklistUrl}\n`;

  return sendMail({
    to,
    subject,
    text,
    html,
    attachments: mailAttachments()
  });
};

// ============================================================================
// MANAGER REVIEW & 24H REMINDER BUILDERS
// ============================================================================

export const buildChangeRequestManagerInvitationEmail = async (cr) => {
  const secret = process.env.JWT_SECRET || 'sfc-change-desk-secure-jwt-secret-key-2026';
  const token = jwt.sign(
    {
      crId: cr.id,
      stage: 'manager_review',
      approvalCycle: cr.approvalCycle || 1,
      approverEmail: cr.managerEmail
    },
    secret,
    { expiresIn: '7d' }
  );

  const approveUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=cr&action=approve`;
  const rejectUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=cr&action=reject`;
  const reqName = cr.employeeName || cr.requester || 'Requester';

  const customEntries = extractCustomFields(cr);
  const submittedTime = formatCleanTime(cr.submittedAt || cr.createdAt);
  const startDate = formatCleanDate(cr.startDate);
  const raisedDate = formatLongDate(cr.submittedAt || cr.createdAt) || cr.raisedDate || 'Today';

  const subject = `Action Required: Team Member Change Request Review — ${cr.title} (${cr.id})`;
  const bodyHtml = `
    <!-- Manager Banner -->
    <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <div style="font:700 14px Arial,sans-serif;color:${C.ink};margin-bottom:8px">Manager First Review Required</div>
      <div style="font:400 13px/1.5 Arial,sans-serif;color:#334155">
        Your team member <strong>${esc(reqName)}</strong> (${esc(cr.employeeEmail || '')}) has submitted Change Request <strong>${esc(cr.id)}: ${esc(cr.title)}</strong>.
        As their reporting manager, your approval is required to advance this request to Change Desk Admin review.
      </div>
    </div>

    <!-- Form Submitted Time Bar -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-bottom:1px solid ${C.border};padding:10px 14px;margin-bottom:18px;border-radius:6px">
      <tr>
        <td style="font:600 12px Arial,sans-serif;color:${C.muted}">Form Submitted Time:</td>
        <td align="right" style="font:700 12px monospace;color:${C.ink}">${esc(submittedTime)}</td>
      </tr>
    </table>

    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(cr.id)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(cr.title)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(cr.category)} · ${esc(cr.subCategory || 'Standard')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:#FEF3C7;color:#D97706">
            ● Pending Manager Review
          </span>
        </td>
      </tr>
    </table>

    <!-- Section 1: Requester Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Requester Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester / Employee</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(reqName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee ID</div>
            <div style="font:600 13px monospace;color:${C.ink}">${esc(cr.employeeId || cr.empId || 'N/A')}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Location</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.location || 'Not specified')}</div>
          </td>
        </tr>
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Employee Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.employeeEmail || cr.requesterEmail || '—')}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Reporting Manager</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.managerName || '—')}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Manager Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(cr.managerEmail || '—')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Change Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 2: Change Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td colspan="2" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Change Title</div>
            <div style="font:700 13px Arial,sans-serif;color:${C.ink}">${esc(cr.title || 'Untitled Request')}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Category</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.category || '—')}</div>
          </td>
          <td width="50%" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Sub-category</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.subCategory || 'Standard')}</div>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Start Date</div>
            <div style="font:600 13px monospace;color:${C.ink}">${esc(startDate)}</div>
          </td>
          <td width="50%" style="padding:6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Workflow</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(cr.workflow || 'Standard')}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Dynamic Action & Specification Details Box -->
    ${customEntries.length > 0 ? `
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:8px;padding:14px 16px;margin:16px 0">
        <div style="font:700 11px Arial,sans-serif;color:${C.ink};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px">
          ACTION &amp; SPECIFICATION DETAILS
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${(() => {
            const rows = [];
            for (let i = 0; i < customEntries.length; i += 2) {
              const [k1, v1] = customEntries[i];
              const second = customEntries[i + 1];
              rows.push(`
                <tr>
                  <td width="50%" style="padding:6px 10px 6px 0;vertical-align:top">
                    <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">${esc(formatFieldLabel(k1))}</div>
                    <div style="font:700 13px Arial,sans-serif;color:${C.ink};word-break:break-word">${esc(v1)}</div>
                  </td>
                  ${second ? `
                    <td width="50%" style="padding:6px 0;vertical-align:top">
                      <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">${esc(formatFieldLabel(second[0]))}</div>
                      <div style="font:700 13px Arial,sans-serif;color:${C.ink};word-break:break-word">${esc(second[1])}</div>
                    </td>
                  ` : `<td width="50%"></td>`}
                </tr>
              `);
            }
            return rows.join('');
          })()}
        </table>
      </div>
    ` : ''}

    <!-- Raised Date & Business Justification -->
    <div style="margin:14px 0 18px">
      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:2px">Raised Date</div>
      <div style="font:500 13px Arial,sans-serif;color:${C.muted};margin-bottom:12px">${esc(raisedDate)}</div>

      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Business Justification</div>
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:6px;padding:10px 12px;font:400 13px/1.5 Arial,sans-serif;color:${C.ink}">
        ${esc(cr.justification || 'No justification entered.')}
      </div>
    </div>

    <!-- Manager Decision Action Buttons -->
    <div style="margin:22px 0 8px;padding:16px;background:#F1F5F9;border-radius:10px;border:1px solid #CBD5E1">
      <div style="font:700 12px Arial,sans-serif;color:#334155;margin-bottom:12px;text-align:center;letter-spacing:0.04em">
        STAGE 1: REPORTING MANAGER ACTION REQUIRED
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:6px">
            <a href="${approveUrl}" style="display:inline-block;padding:11px 24px;background-color:#059669;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(5,150,105,0.25)">
              ✓ Approve Request
            </a>
          </td>
          <td align="center" style="padding:6px">
            <a href="${rejectUrl}" style="display:inline-block;padding:11px 24px;background-color:#DC2626;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(220,38,38,0.25)">
              ✕ Reject Request
            </a>
          </td>
        </tr>
      </table>
      <div style="font:400 11px Arial,sans-serif;color:#64748B;text-align:center;margin-top:12px">
        Approval and Rejection both require mandatory review comments on the decision page.
      </div>
    </div>
  `;

  const html = renderEmail({
    preheader: `Manager review required for ${cr.id} submitted by ${reqName}`,
    heading: `Manager Review: ${cr.title} (${cr.id})`,
    intro: `Please review and record your decision for the change request submitted by <strong>${esc(reqName)}</strong>.`,
    bodyHtml
  });

  const text =
    `Action Required: Team Member Change Request Review — ${cr.title} (${cr.id})\n\n` +
    `${reqName} submitted ${cr.id} and is awaiting your Stage 1 Manager Approval.\n\n` +
    `Section 1: Requester Details\n` +
    `Requester / Employee: ${reqName}\n` +
    `Employee ID: ${cr.employeeId || cr.empId || 'N/A'}\n` +
    `Employee Email: ${cr.employeeEmail || cr.requesterEmail || '—'}\n` +
    `Location: ${cr.location || 'Not specified'}\n` +
    `Manager Email: ${cr.managerEmail || '—'}\n\n` +
    `Section 2: Change Details\n` +
    `Change Title: ${cr.title}\n` +
    `Category: ${cr.category}\n` +
    `Sub-category: ${cr.subCategory || 'Standard'}\n` +
    `Start Date: ${startDate}\n\n` +
    (customEntries.length > 0 ? `Action & Specification Details:\n` + customEntries.map(([k, v]) => `${formatFieldLabel(k)}: ${v}`).join('\n') + `\n\n` : '') +
    (cr.justification ? `Business Justification:\n${cr.justification}\n\n` : '') +
    `Approve Request: ${approveUrl}\nReject Request: ${rejectUrl}\n`;

  const reportHtml = generateChangeRequestReportHtml({ cr, requesterName: reqName, approveUrl, rejectUrl });

  return {
    subject,
    text,
    html,
    attachments: [
      ...mailAttachments(),
      {
        filename: `${cr.id}_Details.html`,
        content: reportHtml,
        contentType: 'text/html'
      }
    ]
  };
};

export const buildPreSpendManagerInvitationEmail = async (ps) => {
  const secret = process.env.JWT_SECRET || 'sfc-change-desk-secure-jwt-secret-key-2026';
  const token = jwt.sign(
    {
      preSpendId: ps.id,
      stage: 'manager_review',
      approvalCycle: ps.approvalCycle || 1,
      approverEmail: ps.managerEmail
    },
    secret,
    { expiresIn: '7d' }
  );

  const approveUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=prespend&action=approve`;
  const rejectUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=prespend&action=reject`;
  const amountFormatted = formatCurrencyINR(ps.estimatedAmount);
  const submittedTime = formatCleanTime(ps.submittedAt || ps.createdAt);
  const neededByDate = formatCleanDate(ps.neededByDate);
  const raisedDate = formatLongDate(ps.submittedAt || ps.createdAt) || 'Today';
  const reqName = ps.requesterName || ps.employeeName || 'Requester';
  const reqEmail = ps.requesterEmail || ps.employeeEmail || '';

  const vendors = Array.isArray(ps.vendors) ? ps.vendors.filter(v => v && (v.name || v.amount)) : [];

  const subject = `Action Required: Team Member Pre-Spend Requisition Review — ${ps.requestCode} (${amountFormatted})`;
  const bodyHtml = `
    <!-- Manager Banner -->
    <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <div style="font:700 14px Arial,sans-serif;color:${C.ink};margin-bottom:8px">Manager First Review Required</div>
      <div style="font:400 13px/1.5 Arial,sans-serif;color:#334155">
        Your team member <strong>${esc(reqName)}</strong> (${esc(reqEmail)}) has submitted Pre-Spend Requisition <strong>${esc(ps.requestCode)}</strong> for <strong>${esc(amountFormatted)}</strong>.
        As their reporting manager, your approval is required to advance this requisition to Board review.
      </div>
    </div>

    <!-- Time Bar -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-bottom:1px solid ${C.border};padding:10px 14px;margin-bottom:18px;border-radius:6px">
      <tr>
        <td style="font:600 12px Arial,sans-serif;color:${C.muted}">Requisition Submitted:</td>
        <td align="right" style="font:700 12px monospace;color:${C.ink}">${esc(submittedTime)} · ${esc(raisedDate)}</td>
      </tr>
    </table>

    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(ps.requestCode)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(ps.itemDescription || ps.category)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(ps.category)} · ${esc(ps.subcategory || 'General')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:#FEF3C7;color:#D97706">
            ● Pending Manager Review
          </span>
        </td>
      </tr>
    </table>

    <!-- Section 1: Financial & Requester Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Requisition Overview</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(reqName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Estimated Amount</div>
            <div style="font:700 14px Arial,sans-serif;color:#2563EB">${esc(amountFormatted)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Cost Centre</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(ps.costCentre || 'Corporate')}</div>
          </td>
        </tr>
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Requester Email</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(reqEmail || '—')}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Needed By Date</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(neededByDate)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Reporting Manager</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(ps.managerName || '—')} (${esc(ps.managerEmail || '—')})</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Vendors & Comparison -->
    ${vendors.length > 0 ? `
      <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
        <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 2: Vendor Comparison (${vendors.length} Quotes)</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px;background:#F8FAFC;border:1px solid ${C.border};border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#F1F5F9">
              <th style="padding:8px 12px;font:700 11px Arial,sans-serif;color:#334155;text-align:left">Vendor Name</th>
              <th style="padding:8px 12px;font:700 11px Arial,sans-serif;color:#334155;text-align:left">Quoted Amount</th>
              <th style="padding:8px 12px;font:700 11px Arial,sans-serif;color:#334155;text-align:left">Quote Date</th>
              <th style="padding:8px 12px;font:700 11px Arial,sans-serif;color:#334155;text-align:left">Attached File</th>
            </tr>
          </thead>
          <tbody>
            ${vendors.map((v, i) => `
              <tr style="border-top:1px solid ${C.border}">
                <td style="padding:8px 12px;font:600 12px Arial,sans-serif;color:${C.ink}">
                  ${esc(v.name || `Vendor ${i + 1}`)} ${i === 0 ? '<span style="font-size:10px;background:#E6F4EA;color:#137333;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:4px">Primary</span>' : ''}
                </td>
                <td style="padding:8px 12px;font:700 12px Arial,sans-serif;color:#059669">${v.amount ? formatCurrencyINR(v.amount) : '—'}</td>
                <td style="padding:8px 12px;font:600 11px Arial,sans-serif;color:#2563EB">
                  ${v.fileUrl ? `<a href="${esc(v.fileUrl)}" target="_blank" style="display:inline-block;padding:3px 8px;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:4px;text-decoration:none;font-weight:700">📄 ${esc(v.fileName || 'View PDF')}</a>` : v.fileName ? `📎 ${esc(v.fileName)}` : 'None'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <!-- Section 3: Commercial Justification & Reason -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Reason for Vendor Selection</div>
      <div style="font:600 13px Arial,sans-serif;color:${C.ink};margin-bottom:12px">${esc(ps.commercialReason || ps.commercial?.reason || 'Lowest total cost')}</div>

      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Business & Justification Note</div>
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:6px;padding:10px 12px;font:400 13px/1.5 Arial,sans-serif;color:${C.ink}">
        ${esc(ps.businessJustification || ps.commercialJustification || ps.commercial?.justification || 'No justification specified.')}
      </div>
    </div>

    <!-- Manager Decision Action Buttons -->
    <div style="margin:22px 0 8px;padding:16px;background:#F1F5F9;border-radius:10px;border:1px solid #CBD5E1">
      <div style="font:700 12px Arial,sans-serif;color:#334155;margin-bottom:12px;text-align:center;letter-spacing:0.04em">
        STAGE 1: REPORTING MANAGER ACTION REQUIRED
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:6px">
            <a href="${approveUrl}" style="display:inline-block;padding:11px 24px;background-color:#059669;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(5,150,105,0.25)">
              ✓ Approve Requisition
            </a>
          </td>
          <td align="center" style="padding:6px">
            <a href="${rejectUrl}" style="display:inline-block;padding:11px 24px;background-color:#DC2626;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(220,38,38,0.25)">
              ✕ Reject Requisition
            </a>
          </td>
        </tr>
      </table>
      <div style="font:400 11px Arial,sans-serif;color:#64748B;text-align:center;margin-top:12px">
        Vendor quotations and PDFs are attached directly to this email for review.
      </div>
    </div>
  `;

  const html = renderEmail({
    preheader: `Manager action required for Pre-Spend ${ps.requestCode}`,
    heading: `Manager Review: ${ps.requestCode} (${amountFormatted})`,
    intro: `Please review and record your decision for the pre-spend requisition submitted by <strong>${esc(reqName)}</strong>.`,
    bodyHtml
  });

  const vendorAttachments = extractVendorAttachments(ps.vendors);
  return {
    subject,
    text: `Manager Review Required: ${ps.requestCode}\nRequester: ${reqName}\nAmount: ${amountFormatted}\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
    html,
    attachments: [...mailAttachments(), ...vendorAttachments]
  };
};

export const buildTravelManagerInvitationEmail = async (tr) => {
  const secret = process.env.JWT_SECRET || 'sfc-change-desk-secure-jwt-secret-key-2026';
  const token = jwt.sign(
    {
      travelId: tr.id,
      stage: 'manager_review',
      approvalCycle: tr.approvalCycle || 1,
      approverEmail: tr.managerEmail
    },
    secret,
    { expiresIn: '7d' }
  );

  const approveUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=travel&action=approve`;
  const rejectUrl = `${appUrl()}/approval-action?token=${encodeURIComponent(token)}&module=travel&action=reject`;

  const submittedTime = formatCleanTime(tr.createdAt || tr.submittedAt);
  const departureDate = formatCleanDate(tr.departureDate);
  const returnDate = formatCleanDate(tr.returnDate);
  const raisedDate = formatLongDate(tr.createdAt || tr.submittedAt) || 'Today';
  const travellerName = tr.travellerName || tr.employeeName || 'Traveller';
  const travellerEmail = tr.travellerEmail || tr.employeeEmail || '';
  const isShortNotice = Boolean(tr.isShortNotice);

  const subject = `Action Required: Team Member Travel Booking Review — ${tr.requestCode} (${tr.fromLocation} → ${tr.toLocation})`;
  const bodyHtml = `
    <!-- Manager Banner -->
    <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <div style="font:700 14px Arial,sans-serif;color:${C.ink};margin-bottom:8px">Manager First Review Required</div>
      <div style="font:400 13px/1.5 Arial,sans-serif;color:#334155">
        Your team member <strong>${esc(travellerName)}</strong> has submitted Travel Booking Request <strong>${esc(tr.requestCode)}</strong> for <strong>${esc(tr.fromLocation)} → ${esc(tr.toLocation)}</strong>.
        As their reporting manager, your approval is required to advance this request to ${isShortNotice ? 'Board' : 'Travel Desk'} review.
      </div>
    </div>

    <!-- Time Bar -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border-bottom:1px solid ${C.border};padding:10px 14px;margin-bottom:18px;border-radius:6px">
      <tr>
        <td style="font:600 12px Arial,sans-serif;color:${C.muted}">Request Submitted:</td>
        <td align="right" style="font:700 12px monospace;color:${C.ink}">${esc(submittedTime)} · ${esc(raisedDate)}</td>
      </tr>
    </table>

    ${isShortNotice ? `
      <!-- Urgent Notice Warning Banner -->
      <div style="background:#FEF2F2;border:1.5px solid #FCA5A5;border-radius:8px;padding:12px 16px;margin-bottom:16px">
        <div style="font:700 13px Arial,sans-serif;color:#DC2626;margin-bottom:2px">SHORT-NOTICE FLIGHT / TRAVEL BOOKING (&lt; 7 DAYS)</div>
        <div style="font:400 12px Arial,sans-serif;color:#991B1B">
          This itinerary departs within 7 days. After your manager endorsement, it will proceed directly to <strong>Board Member review</strong>.
        </div>
      </div>
    ` : ''}

    <!-- Header & Status -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
      <tr>
        <td>
          <span style="font:700 12px monospace;color:#2563EB">${esc(tr.requestCode)}</span>
          <h2 style="font:700 17px Arial,sans-serif;color:${C.ink};margin:3px 0 2px">${esc(tr.travelMode)}: ${esc(tr.fromLocation)} → ${esc(tr.toLocation)}</h2>
          <span style="font:400 12px Arial,sans-serif;color:${C.muted}">${esc(tr.tripType || 'One-Way')} · ${esc(tr.travelClass || 'Economy')}</span>
        </td>
        <td align="right" valign="top">
          <span style="display:inline-block;padding:4px 12px;border-radius:99px;font:700 11px Arial,sans-serif;background:#FEF3C7;color:#D97706">
            ● Pending Manager Review
          </span>
        </td>
      </tr>
    </table>

    <!-- Section 1: Travel Details -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 13px Arial,sans-serif;color:${C.ink};margin-bottom:10px">Section 1: Traveller & Itinerary Details</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px">
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Traveller Name</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(travellerName)}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Departure Date</div>
            <div style="font:700 13px Arial,sans-serif;color:#2563EB">${esc(departureDate)}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Return Date</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(returnDate || 'N/A')}</div>
          </td>
        </tr>
        <tr>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Department</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(tr.department || 'Corporate')}</div>
          </td>
          <td width="33%" style="padding:6px 10px 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Preferred Time Slot</div>
            <div style="font:600 13px Arial,sans-serif;color:${C.ink}">${esc(tr.preferredTimeSlot || 'Anytime')}</div>
          </td>
          <td width="34%" style="padding:6px 0 6px 0;vertical-align:top">
            <div style="font:500 11px Arial,sans-serif;color:${C.muted};margin-bottom:2px">Reporting Manager</div>
            <div style="font:600 12px Arial,sans-serif;color:${C.ink}">${esc(tr.managerName || '—')} (${esc(tr.managerEmail || '—')})</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Section 2: Purpose -->
    <div style="border-top:1px solid ${C.border};padding-top:14px;margin-top:14px">
      <div style="font:700 11px Arial,sans-serif;color:${C.ink};margin-bottom:4px">Purpose of Travel</div>
      <div style="background:#F8FAFC;border:1px solid ${C.border};border-radius:6px;padding:10px 12px;font:400 13px/1.5 Arial,sans-serif;color:${C.ink}">
        ${esc(tr.purpose || 'Business meeting / operational visit')}
      </div>
    </div>

    <!-- Manager Decision Action Buttons -->
    <div style="margin:22px 0 8px;padding:16px;background:#F1F5F9;border-radius:10px;border:1px solid #CBD5E1">
      <div style="font:700 12px Arial,sans-serif;color:#334155;margin-bottom:12px;text-align:center;letter-spacing:0.04em">
        STAGE 1: REPORTING MANAGER ACTION REQUIRED
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding:6px">
            <a href="${approveUrl}" style="display:inline-block;padding:11px 24px;background-color:#059669;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(5,150,105,0.25)">
              ✓ Approve Booking
            </a>
          </td>
          <td align="center" style="padding:6px">
            <a href="${rejectUrl}" style="display:inline-block;padding:11px 24px;background-color:#DC2626;color:#ffffff;font:700 13px Arial,sans-serif;text-decoration:none;border-radius:7px;box-shadow:0 2px 4px rgba(220,38,38,0.25)">
              ✕ Reject Booking
            </a>
          </td>
        </tr>
      </table>
      <div style="font:400 11px Arial,sans-serif;color:#64748B;text-align:center;margin-top:12px">
        Review notes and reasons are required when recording your approval or rejection decision.
      </div>
    </div>
  `;

  const html = renderEmail({
    preheader: `Manager action required for Travel ${tr.requestCode}`,
    heading: `Manager Review: Travel Booking ${tr.requestCode}`,
    intro: `Please review and record your decision for the travel request submitted by <strong>${esc(travellerName)}</strong>.`,
    bodyHtml
  });

  return {
    subject,
    text: `Manager Review Required: ${tr.requestCode}\nTraveller: ${travellerName}\nRoute: ${tr.fromLocation} to ${tr.toLocation}\nApprove: ${approveUrl}\nReject: ${rejectUrl}`,
    html,
    attachments: mailAttachments()
  };
};

export const sendManagerRejectionEmail = async ({ module, requestCode, title, requesterEmail, requesterName, managerName, managerEmail, comment }) => {
  if (!requesterEmail) return { skipped: 'no-requester-email' };
  const subject = `Rejected by Manager: ${requestCode || title}`;
  const bodyHtml = `
    <div style="background:#FEF2F2;border:1.5px solid #FECACA;border-radius:10px;padding:16px 18px;margin-bottom:18px">
      <div style="font:700 15px Arial,sans-serif;color:#DC2626;margin-bottom:4px">
        Rejected by Manager
      </div>
      <div style="font:400 13px Arial,sans-serif;color:#334155;line-height:1.5">
        Your request was rejected by your reporting manager <strong>${esc(managerName || 'Manager')}</strong> (${esc(managerEmail || '—')}).
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed #FECACA;font:400 13px/1.5 Arial,sans-serif;color:#991B1B">
        <strong>Manager Comments / Reason:</strong><br>
        ${esc(comment || 'No explanation provided.')}
      </div>
    </div>
  `;

  const html = renderEmail({
    preheader: `Your request ${requestCode || title} was rejected by your manager`,
    heading: `Rejected by Manager: ${requestCode || title}`,
    intro: `Your request <strong>${esc(requestCode || title)}</strong> has been terminated following manager review.`,
    bodyHtml
  });

  return sendMail({
    to: requesterEmail,
    cc: managerEmail ? [managerEmail] : undefined,
    subject,
    text: `Your request ${requestCode || title} was rejected by ${managerName} (${managerEmail}). Comment: ${comment}`,
    html,
    attachments: mailAttachments()
  });
};


