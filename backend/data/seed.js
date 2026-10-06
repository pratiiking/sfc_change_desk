// ────────────────────────────────────────────────────────────────
//  Seed data + seeding routine.
//
//  Records are stored raw (no presentation fields); serializers add
//  riskColor / statusBg / etc. Relationship columns use *_id.
//  Tables are filled parent-first so foreign keys resolve.
// ────────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs';
import { models } from '../models/index.js';
import { ROLE } from '../config/constants.js';

// Every seeded user gets the same dev password (overridable via env).
// Swap this out for Microsoft Entra ID SSO later — see KT_Guide.md.
const DEV_PASSWORD = process.env.SEED_USER_PASSWORD || 'changedesk123';
const DEV_PASSWORD_HASH = bcrypt.hashSync(DEV_PASSWORD, 10);

const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * 86_400_000);
const hoursAgo = (n) => new Date(NOW - n * 3_600_000);

// ---------- roles ------------------------------------------
export const roles = [
  { id: ROLE.SUPER_ADMIN, name: 'Super Admin', rank: 1, description: 'Ultimate system control across all modules, role & permission management, system audit, database & user management.', permissions: ['catalog.subcategory.manage', 'dashboard.export', 'dashboard.org.view', 'settings.users.manage', 'settings.users.invite', 'settings.roles.view', 'settings.roles.manage', 'settings.auditLogs.view', 'changeRequest.worklist.view', 'preSpend.worklist.view', 'travel.worklist.view'] },
  { id: ROLE.BOARD, name: 'Board', rank: 2, description: 'Board member governance, expedited approval authority, and executive oversight.', permissions: ['dashboard.export', 'settings.users.manage', 'settings.roles.view', 'preSpend.worklist.view', 'travel.worklist.view'] },
  { id: ROLE.ADMIN_LEGACY, name: 'Admin', rank: 3, description: 'System administration, user onboarding, and system reporting.', permissions: ['dashboard.export', 'dashboard.org.view', 'settings.users.manage', 'settings.roles.view', 'changeRequest.worklist.view', 'preSpend.worklist.view', 'travel.worklist.view'] },
  { id: ROLE.CHANGE_ADMIN, name: 'Change Desk Admin', rank: 4, description: 'Change Desk system administration, category oversight, and change management workflows.', permissions: ['dashboard.export', 'settings.users.manage', 'settings.roles.view', 'changeRequest.worklist.view'] },
  { id: ROLE.PRESPEND_ADMIN, name: 'Pre-Spend Admin', rank: 4, description: 'Pre-Spend system administration, budget approvals, and financial spend policies.', permissions: ['dashboard.export', 'settings.users.manage', 'settings.roles.view', 'preSpend.worklist.view'] },
  { id: ROLE.TRAVEL_ADMIN, name: 'Travel Desk Admin', rank: 4, description: 'Travel Desk system administration, booking rules, vendor policies, and travel reports.', permissions: ['dashboard.export', 'settings.users.manage', 'settings.roles.view', 'travel.worklist.view'] },
  { id: ROLE.CHANGE_MANAGER, name: 'Change Manager', rank: 5, description: 'Full lifecycle oversight: review, approve, reject, or request information on change requests.', permissions: ['changeRequest.worklist.view'] },
  { id: ROLE.CHANGE_IMPLEMENTER, name: 'Change Implementer', rank: 6, description: 'Implementation oversight: mark approved change requests as implemented within assigned categories.', permissions: ['changeRequest.worklist.view'] },
  { id: ROLE.REQUESTER, name: 'Requester', rank: 7, description: 'Standard employee permission to raise change requests, track progress, and update own draft submissions.', permissions: [] }
];

// ---------- users (Empty for production) --------------------
export const users = [];

// ---------- catalog items (Empty for production) ----------
export const catalogItems = [];

// ---------- change requests (Empty for production) -------
export const changeRequests = [];

// ---------- audit logs (Empty for production) ------------
export const auditLogs = [];

// ---------- standalone analytics data ------------------
export const categoryBreakdown = [];
export const statusBreakdown = [];
export const monthlyVolume = [];

/**
 * Populate every table, parent-first. Safe to re-run: with `force` the
 * caller has already dropped + recreated tables; otherwise each table is
 * only filled when empty.
 */
export const catalogCategories = [
  { id: 'cat-srv', name: 'Server & Infra', description: 'Server lifecycle, OS patching, and compute infrastructure changes', sortOrder: 1 },
  { id: 'cat-net', name: 'Network & Connectivity', description: 'Firewall rules, Proxy/URL access, VPN, and network changes', sortOrder: 2 },
  { id: 'cat-acc', name: 'Access & Security', description: 'Application access, physical access, and security entitlements', sortOrder: 3 },
  { id: 'cat-asset', name: 'IT Asset', description: 'Laptops, desktops, hardware accessories, software, and licenses', sortOrder: 4 },
  { id: 'cat-o365', name: 'Office 365 & Collaboration', description: 'Exchange mailboxes, email aliases, and M365 license management', sortOrder: 5 },
  { id: 'cat-sec', name: 'Security Tools & Policies', description: 'Endpoint security agents, policies, and exemption requests', sortOrder: 6 }
];

export const catalogSubcategories = [
  // 1. Server & Infra
  { id: 'subcat-srv-lc', categoryId: 'cat-srv', name: 'Server Lifecycle', sla: '3 business days', risk: 'Medium', workflowId: 'wf-1', status: 'Active' },
  { id: 'subcat-srv-patch', categoryId: 'cat-srv', name: 'OS / Patching', sla: '5 business days', risk: 'High', workflowId: 'wf-2', status: 'Active' },
  { id: 'subcat-srv-oth', categoryId: 'cat-srv', name: 'Other Server Changes', sla: '3 business days', risk: 'Medium', workflowId: 'wf-1', status: 'Active' },

  // 2. Network & Connectivity
  { id: 'subcat-net-fw', categoryId: 'cat-net', name: 'Firewall / Port', sla: '2 business days', risk: 'Medium', workflowId: 'wf-1', status: 'Active' },
  { id: 'subcat-net-proxy', categoryId: 'cat-net', name: 'Proxy / URL Access', sla: '1 business day', risk: 'Low', workflowId: 'wf-3', status: 'Active' },
  { id: 'subcat-net-vpn', categoryId: 'cat-net', name: 'VPN', sla: '2 business days', risk: 'Medium', workflowId: 'wf-1', status: 'Active' },
  { id: 'subcat-net-oth', categoryId: 'cat-net', name: 'Other Network Changes', sla: '3 business days', risk: 'Medium', workflowId: 'wf-1', status: 'Active' },

  // 3. Access & Security
  { id: 'subcat-acc-app', categoryId: 'cat-acc', name: 'Application Access', sla: '1 business day', risk: 'Low', workflowId: 'wf-3', status: 'Active' },
  { id: 'subcat-acc-phys', categoryId: 'cat-acc', name: 'Physical Access', sla: '1 business day', risk: 'Low', workflowId: 'wf-3', status: 'Active' },
  { id: 'subcat-acc-oth', categoryId: 'cat-acc', name: 'Other Access Requests', sla: '2 business days', risk: 'Medium', workflowId: 'wf-1', status: 'Active' },

  // 4. IT Asset
  { id: 'subcat-asset-dev', categoryId: 'cat-asset', name: 'Laptop / Desktop', sla: '5 business days', risk: 'Low', workflowId: 'wf-1', status: 'Active' },
  { id: 'subcat-asset-hw', categoryId: 'cat-asset', name: 'Other IT Hardware', sla: '5 business days', risk: 'Low', workflowId: 'wf-1', status: 'Active' },
  { id: 'subcat-asset-sw', categoryId: 'cat-asset', name: 'Software', sla: '3 business days', risk: 'Medium', workflowId: 'wf-1', status: 'Active' },
  { id: 'subcat-asset-lic', categoryId: 'cat-asset', name: 'License', sla: '2 business days', risk: 'Low', workflowId: 'wf-3', status: 'Active' },
  { id: 'subcat-asset-oth', categoryId: 'cat-asset', name: 'Other IT Asset Requests', sla: '3 business days', risk: 'Low', workflowId: 'wf-1', status: 'Active' },

  // 5. Office 365 & Collaboration
  { id: 'subcat-o365-mb', categoryId: 'cat-o365', name: 'Mailbox', sla: '1 business day', risk: 'Low', workflowId: 'wf-3', status: 'Active' },
  { id: 'subcat-o365-lic', categoryId: 'cat-o365', name: 'M365 License', sla: '1 business day', risk: 'Low', workflowId: 'wf-3', status: 'Active' },
  { id: 'subcat-o365-oth', categoryId: 'cat-o365', name: 'Other Email / M365 Requests', sla: '2 business days', risk: 'Low', workflowId: 'wf-3', status: 'Active' },

  // 6. Security Tools & Policies
  { id: 'subcat-sec-ep', categoryId: 'cat-sec', name: 'Endpoint Agent', sla: '2 business days', risk: 'High', workflowId: 'wf-2', status: 'Active' },
  { id: 'subcat-sec-oth', categoryId: 'cat-sec', name: 'Other Security Changes', sla: '3 business days', risk: 'High', workflowId: 'wf-2', status: 'Active' }
];

export const catalogSubcategoryFields = [
  // ── 1. Server Lifecycle ──
  { id: 'f-srv-act', subcategoryId: 'subcat-srv-lc', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Deploy a Server', 'Change / Modify an Existing Server', 'Migrate a Server', 'Decommission a Server', 'Other'] },
  { id: 'f-srv-name', subcategoryId: 'subcat-srv-lc', fieldKey: 'serverName', fieldLabel: 'Server Name', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Change / Modify an Existing Server', 'Migrate a Server', 'Decommission a Server'], options: null },
  { id: 'f-srv-ip', subcategoryId: 'subcat-srv-lc', fieldKey: 'ipAddress', fieldLabel: 'IP Address', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Change / Modify an Existing Server', 'Migrate a Server', 'Decommission a Server'], options: null },
  { id: 'f-srv-srchosting', subcategoryId: 'subcat-srv-lc', fieldKey: 'sourceHosting', fieldLabel: 'Source Hosting', fieldType: 'dropdown', isRequired: true, sortOrder: 3, appliesToActions: ['Migrate a Server'], options: ['AWS Cloud', 'Azure Cloud', 'GCP', 'Other Private Cloud', 'On Premise'] },
  { id: 'f-srv-desthosting', subcategoryId: 'subcat-srv-lc', fieldKey: 'destination', fieldLabel: 'Destination', fieldType: 'dropdown', isRequired: true, sortOrder: 4, appliesToActions: ['Migrate a Server'], options: ['AWS Cloud', 'Azure Cloud', 'GCP', 'Other Private Cloud', 'On Premise'] },
  { id: 'f-srv-hostingserver', subcategoryId: 'subcat-srv-lc', fieldKey: 'hostingServer', fieldLabel: 'Hosting Server', fieldType: 'dropdown', isRequired: true, sortOrder: 5, appliesToActions: ['Decommission a Server'], options: ['AWS Cloud', 'Azure Cloud', 'GCP', 'Other Private Cloud', 'On Premise'] },
  { id: 'f-srv-purpose', subcategoryId: 'subcat-srv-lc', fieldKey: 'purpose', fieldLabel: 'Purpose', fieldType: 'text', isRequired: true, sortOrder: 6, appliesToActions: ['Deploy a Server'], options: null },
  { id: 'f-srv-hosting', subcategoryId: 'subcat-srv-lc', fieldKey: 'hostingType', fieldLabel: 'Hosting Type', fieldType: 'dropdown', isRequired: true, sortOrder: 7, appliesToActions: ['Deploy a Server', 'Change / Modify an Existing Server'], options: ['AWS Cloud', 'Azure Cloud', 'GCP', 'Other Private Cloud', 'On Premise'] },
  { id: 'f-srv-os', subcategoryId: 'subcat-srv-lc', fieldKey: 'operatingSystem', fieldLabel: 'OS', fieldType: 'text', isRequired: true, sortOrder: 8, appliesToActions: ['Deploy a Server', 'Change / Modify an Existing Server'], options: null },
  { id: 'f-srv-cpu', subcategoryId: 'subcat-srv-lc', fieldKey: 'cpu', fieldLabel: 'CPU', fieldType: 'text', isRequired: true, sortOrder: 9, appliesToActions: ['Deploy a Server', 'Change / Modify an Existing Server'], options: null },
  { id: 'f-srv-ram', subcategoryId: 'subcat-srv-lc', fieldKey: 'ram', fieldLabel: 'RAM', fieldType: 'text', isRequired: true, sortOrder: 10, appliesToActions: ['Deploy a Server', 'Change / Modify an Existing Server'], options: null },
  { id: 'f-srv-storage', subcategoryId: 'subcat-srv-lc', fieldKey: 'storage', fieldLabel: 'Storage', fieldType: 'text', isRequired: true, sortOrder: 11, appliesToActions: ['Deploy a Server', 'Change / Modify an Existing Server'], options: null },
  { id: 'f-srv-vlan', subcategoryId: 'subcat-srv-lc', fieldKey: 'vlanRequirement', fieldLabel: 'IP/VLAN Requirement?', fieldType: 'dropdown', isRequired: true, sortOrder: 12, appliesToActions: ['Deploy a Server', 'Change / Modify an Existing Server'], options: ['Yes', 'No'] },
  { id: 'f-srv-backup', subcategoryId: 'subcat-srv-lc', fieldKey: 'backupRequired', fieldLabel: 'Backup Required?', fieldType: 'dropdown', isRequired: true, sortOrder: 13, appliesToActions: ['Deploy a Server', 'Change / Modify an Existing Server'], options: ['Yes', 'No'] },

  // ── 2. OS / Patching ──
  { id: 'f-patch-act', subcategoryId: 'subcat-srv-patch', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Upgrade / Patch Server OS', 'Other'] },
  { id: 'f-patch-srvname', subcategoryId: 'subcat-srv-patch', fieldKey: 'serverName', fieldLabel: 'Server Name', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Upgrade / Patch Server OS'], options: null },
  { id: 'f-patch-ip', subcategoryId: 'subcat-srv-patch', fieldKey: 'ipAddress', fieldLabel: 'IP Address', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Upgrade / Patch Server OS'], options: null },
  { id: 'f-patch-curos', subcategoryId: 'subcat-srv-patch', fieldKey: 'currentOsVersion', fieldLabel: 'Current OS / Version', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Upgrade / Patch Server OS'], options: null },
  { id: 'f-patch-tgtos', subcategoryId: 'subcat-srv-patch', fieldKey: 'targetVersionPatch', fieldLabel: 'Target Version / Patch', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Upgrade / Patch Server OS'], options: null },
  { id: 'f-patch-cve', subcategoryId: 'subcat-srv-patch', fieldKey: 'kbCve', fieldLabel: 'KB / CVE (If Applicable)', fieldType: 'text', isRequired: false, sortOrder: 5, appliesToActions: ['Upgrade / Patch Server OS'], options: null },
  { id: 'f-patch-reboot', subcategoryId: 'subcat-srv-patch', fieldKey: 'rebootRequired', fieldLabel: 'Reboot Required?', fieldType: 'dropdown', isRequired: true, sortOrder: 6, appliesToActions: ['Upgrade / Patch Server OS'], options: ['Yes', 'No'] },
  { id: 'f-patch-reason', subcategoryId: 'subcat-srv-patch', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 7, appliesToActions: ['Upgrade / Patch Server OS'], options: null },

  // ── 3. Server Other ──
  { id: 'f-srvoth-act', subcategoryId: 'subcat-srv-oth', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Any Other Changes Related to Server', 'Other'] },
  { id: 'f-srvoth-desc', subcategoryId: 'subcat-srv-oth', fieldKey: 'description', fieldLabel: 'Description', fieldType: 'textarea', isRequired: true, sortOrder: 1, appliesToActions: ['Any Other Changes Related to Server'], options: null },

  // ── 4. Firewall / Port ──
  { id: 'f-fw-act', subcategoryId: 'subcat-net-fw', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Open a Firewall Port / Allow Traffic', 'Modify Existing Firewall Rule', 'Close Firewall Port / Remove Rule', 'Other'] },
  { id: 'f-fw-existing', subcategoryId: 'subcat-net-fw', fieldKey: 'existingFirewall', fieldLabel: 'Existing Firewall', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Modify Existing Firewall Rule'], options: null },
  { id: 'f-fw-src', subcategoryId: 'subcat-net-fw', fieldKey: 'sourceIpSubnet', fieldLabel: 'Source IP / Subnet', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Open a Firewall Port / Allow Traffic', 'Modify Existing Firewall Rule', 'Close Firewall Port / Remove Rule'], options: null },
  { id: 'f-fw-dst', subcategoryId: 'subcat-net-fw', fieldKey: 'destinationIpSubnet', fieldLabel: 'Destination IP / Subnet', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Open a Firewall Port / Allow Traffic', 'Modify Existing Firewall Rule', 'Close Firewall Port / Remove Rule'], options: null },
  { id: 'f-fw-proto', subcategoryId: 'subcat-net-fw', fieldKey: 'protocol', fieldLabel: 'Protocol', fieldType: 'dropdown', isRequired: true, sortOrder: 4, appliesToActions: ['Open a Firewall Port / Allow Traffic', 'Modify Existing Firewall Rule'], options: ['TCP', 'UDP', 'ICMP', 'ANY'] },
  { id: 'f-fw-port', subcategoryId: 'subcat-net-fw', fieldKey: 'port', fieldLabel: 'Port', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Open a Firewall Port / Allow Traffic', 'Modify Existing Firewall Rule', 'Close Firewall Port / Remove Rule'], options: null },
  { id: 'f-fw-dir', subcategoryId: 'subcat-net-fw', fieldKey: 'direction', fieldLabel: 'Direction', fieldType: 'dropdown', isRequired: true, sortOrder: 6, appliesToActions: ['Open a Firewall Port / Allow Traffic', 'Modify Existing Firewall Rule'], options: ['Inbound', 'Outbound', 'Bi-directional'] },
  { id: 'f-fw-app', subcategoryId: 'subcat-net-fw', fieldKey: 'applicationService', fieldLabel: 'Application / Service', fieldType: 'text', isRequired: true, sortOrder: 7, appliesToActions: ['Open a Firewall Port / Allow Traffic', 'Modify Existing Firewall Rule'], options: null },
  { id: 'f-fw-internet', subcategoryId: 'subcat-net-fw', fieldKey: 'internetFacing', fieldLabel: 'Internet Facing (Y/N)', fieldType: 'dropdown', isRequired: true, sortOrder: 8, appliesToActions: ['Open a Firewall Port / Allow Traffic', 'Modify Existing Firewall Rule'], options: ['Yes', 'No'] },

  // ── 5. Proxy / URL Access ──
  { id: 'f-proxy-act', subcategoryId: 'subcat-net-proxy', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Allow Website / URL', 'Block Website / URL', 'Other'] },
  { id: 'f-proxy-cat', subcategoryId: 'subcat-net-proxy', fieldKey: 'category', fieldLabel: 'Category', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Allow Website / URL', 'Block Website / URL'], options: null },
  { id: 'f-proxy-url', subcategoryId: 'subcat-net-proxy', fieldKey: 'url', fieldLabel: 'URL', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Allow Website / URL', 'Block Website / URL'], options: null },
  { id: 'f-proxy-reason', subcategoryId: 'subcat-net-proxy', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Allow Website / URL', 'Block Website / URL'], options: null },

  // ── 6. VPN ──
  { id: 'f-vpn-act', subcategoryId: 'subcat-net-vpn', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Request VPN Access', 'Modify / Revoke VPN Access', 'Other'] },
  { id: 'f-vpn-type', subcategoryId: 'subcat-net-vpn', fieldKey: 'vpnType', fieldLabel: 'VPN Type', fieldType: 'dropdown', isRequired: true, sortOrder: 1, appliesToActions: ['Request VPN Access', 'Modify / Revoke VPN Access'], options: ['User VPN (SSL)', 'Site-to-Site IPsec', 'IPsec Client'] },
  { id: 'f-vpn-src', subcategoryId: 'subcat-net-vpn', fieldKey: 'sourceNetwork', fieldLabel: 'Source Network', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Request VPN Access', 'Modify / Revoke VPN Access'], options: null },
  { id: 'f-vpn-dst', subcategoryId: 'subcat-net-vpn', fieldKey: 'destinationNetworkApp', fieldLabel: 'Destination Network / Application', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Request VPN Access', 'Modify / Revoke VPN Access'], options: null },

  // ── 7. Network Other ──
  { id: 'f-netoth-act', subcategoryId: 'subcat-net-oth', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Other Network Related Change', 'Other'] },
  { id: 'f-netoth-desc', subcategoryId: 'subcat-net-oth', fieldKey: 'description', fieldLabel: 'Description', fieldType: 'textarea', isRequired: true, sortOrder: 1, appliesToActions: ['Other Network Related Change'], options: null },

  // ── 8. Application Access ──
  { id: 'f-appacc-act', subcategoryId: 'subcat-acc-app', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Request Application Access', 'Change Existing Access', 'Revoke Application Access', 'Other'] },
  { id: 'f-appacc-app', subcategoryId: 'subcat-acc-app', fieldKey: 'application', fieldLabel: 'Application', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Request Application Access', 'Change Existing Access', 'Revoke Application Access'], options: null },
  { id: 'f-appacc-currole', subcategoryId: 'subcat-acc-app', fieldKey: 'currentRole', fieldLabel: 'Current Role', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Change Existing Access'], options: null },
  { id: 'f-appacc-reqrole', subcategoryId: 'subcat-acc-app', fieldKey: 'requestedRole', fieldLabel: 'Requested Role', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Request Application Access', 'Change Existing Access'], options: null },
  { id: 'f-appacc-userIdentity', subcategoryId: 'subcat-acc-app', fieldKey: 'userIdentity', fieldLabel: 'User Identity', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Revoke Application Access'], options: null },
  { id: 'f-appacc-reason', subcategoryId: 'subcat-acc-app', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Request Application Access', 'Change Existing Access', 'Revoke Application Access'], options: null },

  // ── 9. Physical Access ──
  { id: 'f-physacc-act', subcategoryId: 'subcat-acc-phys', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Request Physical Access', 'Modify Physical Access', 'Revoke Physical Access', 'Other'] },
  { id: 'f-physacc-user', subcategoryId: 'subcat-acc-phys', fieldKey: 'userIdentity', fieldLabel: 'User Identity', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Request Physical Access', 'Modify Physical Access', 'Revoke Physical Access'], options: null },
  { id: 'f-physacc-curacc', subcategoryId: 'subcat-acc-phys', fieldKey: 'currentAccess', fieldLabel: 'Current Access', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Modify Physical Access'], options: null },
  { id: 'f-physacc-reqacc', subcategoryId: 'subcat-acc-phys', fieldKey: 'requestedAccess', fieldLabel: 'Requested Access', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Request Physical Access', 'Modify Physical Access'], options: null },
  { id: 'f-physacc-rvkacc', subcategoryId: 'subcat-acc-phys', fieldKey: 'revokeAccess', fieldLabel: 'Revoke Access', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Revoke Physical Access'], options: null },
  { id: 'f-physacc-reason', subcategoryId: 'subcat-acc-phys', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Request Physical Access', 'Modify Physical Access', 'Revoke Physical Access'], options: null },

  // ── 10. Access Other ──
  { id: 'f-accoth-act', subcategoryId: 'subcat-acc-oth', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Other Access & Security Related Request', 'Other'] },
  { id: 'f-accoth-desc', subcategoryId: 'subcat-acc-oth', fieldKey: 'description', fieldLabel: 'Description', fieldType: 'textarea', isRequired: true, sortOrder: 1, appliesToActions: ['Other Access & Security Related Request'], options: null },

  // ── 11. Laptop / Desktop ──
  { id: 'f-dev-act', subcategoryId: 'subcat-asset-dev', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Request for Procurement of Laptop / Desktop', 'Replace Existing Laptop / Desktop', 'Repair Request', 'Dispose Request', 'Other'] },
  { id: 'f-dev-assettype', subcategoryId: 'subcat-asset-dev', fieldKey: 'assetType', fieldLabel: 'Asset Type', fieldType: 'dropdown', isRequired: true, sortOrder: 1, appliesToActions: ['Request for Procurement of Laptop / Desktop'], options: ['Laptop', 'Desktop', 'Workstation'] },
  { id: 'f-dev-reqcfg', subcategoryId: 'subcat-asset-dev', fieldKey: 'requestedConfiguration', fieldLabel: 'Requested Configuration', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Request for Procurement of Laptop / Desktop', 'Replace Existing Laptop / Desktop'], options: null },
  { id: 'f-dev-qty', subcategoryId: 'subcat-asset-dev', fieldKey: 'qtyRequired', fieldLabel: 'Qty Required', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Request for Procurement of Laptop / Desktop'], options: null },
  { id: 'f-dev-loc', subcategoryId: 'subcat-asset-dev', fieldKey: 'location', fieldLabel: 'Location', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Request for Procurement of Laptop / Desktop'], options: null },
  { id: 'f-dev-stock', subcategoryId: 'subcat-asset-dev', fieldKey: 'currentQtyInStock', fieldLabel: 'Current Qty in Stock', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Request for Procurement of Laptop / Desktop'], options: null },
  { id: 'f-dev-curcfg', subcategoryId: 'subcat-asset-dev', fieldKey: 'currentConfiguration', fieldLabel: 'Current Configuration', fieldType: 'text', isRequired: true, sortOrder: 7, appliesToActions: ['Replace Existing Laptop / Desktop'], options: null },
  { id: 'f-dev-assetid', subcategoryId: 'subcat-asset-dev', fieldKey: 'existingAssetId', fieldLabel: 'Existing Asset ID', fieldType: 'text', isRequired: true, sortOrder: 8, appliesToActions: ['Replace Existing Laptop / Desktop', 'Repair Request', 'Dispose Request'], options: null },
  { id: 'f-dev-repairreason', subcategoryId: 'subcat-asset-dev', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 9, appliesToActions: ['Repair Request'], options: null },
  { id: 'f-dev-purchdate', subcategoryId: 'subcat-asset-dev', fieldKey: 'dateOfPurchase', fieldLabel: 'Date of Purchase', fieldType: 'text', isRequired: true, sortOrder: 10, appliesToActions: ['Dispose Request'], options: null },
  { id: 'f-dev-dispreason', subcategoryId: 'subcat-asset-dev', fieldKey: 'disposalReason', fieldLabel: 'Disposal Reason', fieldType: 'text', isRequired: true, sortOrder: 11, appliesToActions: ['Dispose Request'], options: null },

  // ── 12. Other IT Hardware ──
  { id: 'f-hw-act', subcategoryId: 'subcat-asset-hw', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Request for Procurement of IT Hardware / Accessories', 'Request for Allotment of IT Hardware / Accessories', 'Return IT Asset', 'Repair Request', 'Dispose Request', 'Other'] },
  { id: 'f-hw-assettype', subcategoryId: 'subcat-asset-hw', fieldKey: 'assetType', fieldLabel: 'Asset Type', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Request for Procurement of IT Hardware / Accessories', 'Request for Allotment of IT Hardware / Accessories', 'Return IT Asset'], options: null },
  { id: 'f-hw-reqcfg', subcategoryId: 'subcat-asset-hw', fieldKey: 'requestedConfiguration', fieldLabel: 'Requested Configuration', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Request for Procurement of IT Hardware / Accessories', 'Request for Allotment of IT Hardware / Accessories'], options: null },
  { id: 'f-hw-qty', subcategoryId: 'subcat-asset-hw', fieldKey: 'qtyRequired', fieldLabel: 'Qty Required', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Request for Procurement of IT Hardware / Accessories'], options: null },
  { id: 'f-hw-loc', subcategoryId: 'subcat-asset-hw', fieldKey: 'location', fieldLabel: 'Location', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Request for Procurement of IT Hardware / Accessories'], options: null },
  { id: 'f-hw-stock', subcategoryId: 'subcat-asset-hw', fieldKey: 'currentQtyInStock', fieldLabel: 'Current Qty in Stock', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Request for Procurement of IT Hardware / Accessories'], options: null },
  { id: 'f-hw-reason', subcategoryId: 'subcat-asset-hw', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 6, appliesToActions: ['Request for Allotment of IT Hardware / Accessories', 'Return IT Asset', 'Repair Request'], options: null },
  { id: 'f-hw-returncfg', subcategoryId: 'subcat-asset-hw', fieldKey: 'returnAssetConfiguration', fieldLabel: 'Return Asset Configuration', fieldType: 'text', isRequired: true, sortOrder: 7, appliesToActions: ['Return IT Asset'], options: null },
  { id: 'f-hw-assetid', subcategoryId: 'subcat-asset-hw', fieldKey: 'assetId', fieldLabel: 'Asset ID', fieldType: 'text', isRequired: true, sortOrder: 8, appliesToActions: ['Return IT Asset', 'Repair Request', 'Dispose Request'], options: null },
  { id: 'f-hw-purchdate', subcategoryId: 'subcat-asset-hw', fieldKey: 'dateOfPurchase', fieldLabel: 'Date of Purchase', fieldType: 'text', isRequired: true, sortOrder: 9, appliesToActions: ['Dispose Request'], options: null },
  { id: 'f-hw-dispreason', subcategoryId: 'subcat-asset-hw', fieldKey: 'disposalReason', fieldLabel: 'Disposal Reason', fieldType: 'text', isRequired: true, sortOrder: 10, appliesToActions: ['Dispose Request'], options: null },

  // ── 13. Software ──
  { id: 'f-sw-act', subcategoryId: 'subcat-asset-sw', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Install / Upgrade Software', 'Other'] },
  { id: 'f-sw-devid', subcategoryId: 'subcat-asset-sw', fieldKey: 'deviceId', fieldLabel: 'Device ID', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Install / Upgrade Software'], options: null },
  { id: 'f-sw-host', subcategoryId: 'subcat-asset-sw', fieldKey: 'hostName', fieldLabel: 'Host Name', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Install / Upgrade Software'], options: null },
  { id: 'f-sw-name', subcategoryId: 'subcat-asset-sw', fieldKey: 'softwareName', fieldLabel: 'Software Name', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Install / Upgrade Software'], options: null },
  { id: 'f-sw-reqver', subcategoryId: 'subcat-asset-sw', fieldKey: 'requestedVersion', fieldLabel: 'Requested Version', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Install / Upgrade Software'], options: null },
  { id: 'f-sw-curver', subcategoryId: 'subcat-asset-sw', fieldKey: 'currentVersion', fieldLabel: 'Current Version', fieldType: 'text', isRequired: false, sortOrder: 5, appliesToActions: ['Install / Upgrade Software'], options: null },
  { id: 'f-sw-licensed', subcategoryId: 'subcat-asset-sw', fieldKey: 'licensedYn', fieldLabel: 'Licensed? (Y/N)', fieldType: 'dropdown', isRequired: true, sortOrder: 6, appliesToActions: ['Install / Upgrade Software'], options: ['Yes', 'No'] },
  { id: 'f-sw-reason', subcategoryId: 'subcat-asset-sw', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 7, appliesToActions: ['Install / Upgrade Software'], options: null },

  // ── 14. License ──
  { id: 'f-lic-act', subcategoryId: 'subcat-asset-lic', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Procure / Renew Software License', 'Other'] },
  { id: 'f-lic-vendor', subcategoryId: 'subcat-asset-lic', fieldKey: 'vendor', fieldLabel: 'Vendor', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Procure / Renew Software License'], options: null },
  { id: 'f-lic-type', subcategoryId: 'subcat-asset-lic', fieldKey: 'licenseType', fieldLabel: 'License Type', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Procure / Renew Software License'], options: null },
  { id: 'f-lic-qty', subcategoryId: 'subcat-asset-lic', fieldKey: 'noOfLicense', fieldLabel: 'No. of License', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Procure / Renew Software License'], options: null },
  { id: 'f-lic-reason', subcategoryId: 'subcat-asset-lic', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Procure / Renew Software License'], options: null },

  // ── 15. IT Asset Other ──
  { id: 'f-assetoth-act', subcategoryId: 'subcat-asset-oth', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Other IT Asset Related Request', 'Other'] },
  { id: 'f-assetoth-desc', subcategoryId: 'subcat-asset-oth', fieldKey: 'description', fieldLabel: 'Description', fieldType: 'textarea', isRequired: true, sortOrder: 1, appliesToActions: ['Other IT Asset Related Request'], options: null },

  // ── 16. Mailbox ──
  { id: 'f-mb-act', subcategoryId: 'subcat-o365-mb', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Create an Email ID', 'Add Email Alias', 'Disable / Revoke Mailbox', 'Other'] },
  { id: 'f-mb-name', subcategoryId: 'subcat-o365-mb', fieldKey: 'name', fieldLabel: 'Name', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Create an Email ID', 'Disable / Revoke Mailbox'], options: null },
  { id: 'f-mb-reqemail', subcategoryId: 'subcat-o365-mb', fieldKey: 'emailIdRequired', fieldLabel: 'Email ID Required', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Create an Email ID'], options: null },
  { id: 'f-mb-email', subcategoryId: 'subcat-o365-mb', fieldKey: 'emailId', fieldLabel: 'Email ID', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Add Email Alias', 'Disable / Revoke Mailbox'], options: null },
  { id: 'f-mb-alias', subcategoryId: 'subcat-o365-mb', fieldKey: 'alias', fieldLabel: 'Alias', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Add Email Alias'], options: null },
  { id: 'f-mb-reason', subcategoryId: 'subcat-o365-mb', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Create an Email ID', 'Add Email Alias', 'Disable / Revoke Mailbox'], options: null },

  // ── 17. M365 License ──
  { id: 'f-m365lic-act', subcategoryId: 'subcat-o365-lic', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Request M365 License', 'Upgrade / Downgrade M365 License', 'Remove M365 License', 'Other'] },
  { id: 'f-m365lic-email', subcategoryId: 'subcat-o365-lic', fieldKey: 'emailId', fieldLabel: 'Email ID', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Request M365 License', 'Upgrade / Downgrade M365 License', 'Remove M365 License'], options: null },
  { id: 'f-m365lic-type', subcategoryId: 'subcat-o365-lic', fieldKey: 'licenseType', fieldLabel: 'License Type', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Request M365 License'], options: null },
  { id: 'f-m365lic-curtype', subcategoryId: 'subcat-o365-lic', fieldKey: 'currentLicenseType', fieldLabel: 'Current License Type', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Upgrade / Downgrade M365 License'], options: null },
  { id: 'f-m365lic-reqtype', subcategoryId: 'subcat-o365-lic', fieldKey: 'requestedLicenseType', fieldLabel: 'Requested License Type', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Upgrade / Downgrade M365 License'], options: null },
  { id: 'f-m365lic-name', subcategoryId: 'subcat-o365-lic', fieldKey: 'name', fieldLabel: 'Name', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Remove M365 License'], options: null },
  { id: 'f-m365lic-reason', subcategoryId: 'subcat-o365-lic', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 6, appliesToActions: ['Request M365 License', 'Upgrade / Downgrade M365 License', 'Remove M365 License'], options: null },

  // ── 18. O365 Other ──
  { id: 'f-o365oth-act', subcategoryId: 'subcat-o365-oth', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Other Email/M365 related request', 'Other'] },
  { id: 'f-o365oth-desc', subcategoryId: 'subcat-o365-oth', fieldKey: 'description', fieldLabel: 'Description', fieldType: 'textarea', isRequired: true, sortOrder: 1, appliesToActions: ['Other Email/M365 related request'], options: null },

  // ── 19. Endpoint Agent ──
  { id: 'f-ep-act', subcategoryId: 'subcat-sec-ep', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Remove Security / Endpoint Agent', 'Modify Endpoint Security Policy', 'Request Exception in Security Policy', 'Other'] },
  { id: 'f-ep-tool', subcategoryId: 'subcat-sec-ep', fieldKey: 'toolName', fieldLabel: 'Tool Name', fieldType: 'text', isRequired: true, sortOrder: 1, appliesToActions: ['Remove Security / Endpoint Agent', 'Modify Endpoint Security Policy', 'Request Exception in Security Policy'], options: null },
  { id: 'f-ep-devid', subcategoryId: 'subcat-sec-ep', fieldKey: 'deviceId', fieldLabel: 'Device ID', fieldType: 'text', isRequired: true, sortOrder: 2, appliesToActions: ['Remove Security / Endpoint Agent', 'Modify Endpoint Security Policy', 'Request Exception in Security Policy'], options: null },
  { id: 'f-ep-hostid', subcategoryId: 'subcat-sec-ep', fieldKey: 'hostId', fieldLabel: 'Host ID', fieldType: 'text', isRequired: true, sortOrder: 3, appliesToActions: ['Remove Security / Endpoint Agent', 'Modify Endpoint Security Policy', 'Request Exception in Security Policy'], options: null },
  { id: 'f-ep-curgrp', subcategoryId: 'subcat-sec-ep', fieldKey: 'currentGroup', fieldLabel: 'Current Group', fieldType: 'text', isRequired: true, sortOrder: 4, appliesToActions: ['Modify Endpoint Security Policy'], options: null },
  { id: 'f-ep-reqgrp', subcategoryId: 'subcat-sec-ep', fieldKey: 'requestedGroup', fieldLabel: 'Requested Group', fieldType: 'text', isRequired: true, sortOrder: 5, appliesToActions: ['Modify Endpoint Security Policy'], options: null },
  { id: 'f-ep-hash', subcategoryId: 'subcat-sec-ep', fieldKey: 'fileProcessPathHash', fieldLabel: 'File/Process/Path/Hash', fieldType: 'text', isRequired: true, sortOrder: 6, appliesToActions: ['Request Exception in Security Policy'], options: null },
  { id: 'f-ep-reason', subcategoryId: 'subcat-sec-ep', fieldKey: 'purposeReason', fieldLabel: 'Purpose / Reason', fieldType: 'text', isRequired: true, sortOrder: 7, appliesToActions: ['Remove Security / Endpoint Agent', 'Modify Endpoint Security Policy', 'Request Exception in Security Policy'], options: null },

  // ── 20. Security Other ──
  { id: 'f-secoth-act', subcategoryId: 'subcat-sec-oth', fieldKey: 'actionRequired', fieldLabel: 'Action Required', fieldType: 'dropdown', isRequired: true, sortOrder: 0, appliesToActions: null, options: ['Other Security Change', 'Other'] },
  { id: 'f-secoth-desc', subcategoryId: 'subcat-sec-oth', fieldKey: 'description', fieldLabel: 'Description', fieldType: 'textarea', isRequired: true, sortOrder: 1, appliesToActions: ['Other Security Change'], options: null }
];

export async function seedDatabase({ force = false } = {}) {
  const {
    Role, UserS8, CatalogCategory, CatalogSubcategory, CatalogSubcategoryField,
    ChangeRequest, ChangeRequestApproval, AuditLog, ChangeManagerCategory
  } = models;

  const fill = async (Model, rows) => {
    try {
      const count = await Model.count().catch(() => 0);
      if (!force && count > 0) return { table: Model.tableName, skipped: true };
      
      try {
        if (force) {
          await Model.destroy({ where: {}, force: true }).catch(() => {});
        }
        await Model.bulkCreate(rows, { updateOnDuplicate: Object.keys(rows[0] || {}) });
      } catch (bulkErr) {
        for (const row of rows) {
          await Model.upsert(row).catch(() => {});
        }
      }
      return { table: Model.tableName, inserted: rows.length };
    } catch (err) {
      return { table: Model.tableName, error: err.message };
    }
  };

  const results = [];
  results.push(await fill(Role, roles));
  const s8Users = users.map(({ name, email }) => {
    const [firstName, ...rest] = (name || '').split(' ');
    return {
      firstName: firstName || null,
      lastName: rest.join(' ') || null,
      email
    };
  });
  results.push(await fill(UserS8, s8Users));

  results.push(await fill(CatalogCategory, catalogCategories));
  results.push(await fill(CatalogSubcategory, catalogSubcategories));
  results.push(await fill(CatalogSubcategoryField, catalogSubcategoryFields));
  results.push(await fill(ChangeRequest, changeRequests));

  const sampleApprovals = [];
  results.push(await fill(ChangeRequestApproval, sampleApprovals));

  const sampleCmCategories = [];
  results.push(await fill(ChangeManagerCategory, sampleCmCategories));

  results.push(await fill(AuditLog, auditLogs));
  return results;
}
