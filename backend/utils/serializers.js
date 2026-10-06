// Turn model rows (with their includes) into the exact JSON the
// frontend renders. All presentation fields are added here.
import { riskStyle, statusStyle, userStatusStyle, formatDate, relativeTime } from '../data/store.js';

const plain = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

// ---------- Change requests -------------------------------
// Needs includes: requester, approver, workflow, approvals
export const serializeChangeRequest = (row) => {
  const cr = plain(row);
  const {
    requester, approver, workflow, approvals,
    requesterId, approverId, workflowId,
    submittedAt, closedAt, createdAt, updatedAt,
    ...rest
  } = cr;

  const rejApproval = Array.isArray(approvals) ? approvals.find(a => a.decision === 'Rejected' || a.action === 'Rejected') : null;
  const rationale = cr.rejectionReason || cr.rejection_reason || rejApproval?.rationale || rejApproval?.comments || cr.customFieldValues?.rejectionReason || (cr.status === 'Rejected' ? 'This change request was rejected during Change Manager review.' : null);

  const decidedApproval = Array.isArray(approvals) ? approvals.find(a => (a.decision === 'Approved' || a.decision === 'Rejected' || a.action === 'Approved' || a.action === 'Rejected')) : null;
  const decidedBy = decidedApproval?.approver?.name || cr.decidedBy || null;
  const decidedAt = decidedApproval?.decidedAt || decidedApproval?.updatedAt || null;

  const allComments = Array.isArray(cr.comments)
    ? cr.comments
    : Array.isArray(cr.customFieldValues?.comments)
      ? cr.customFieldValues.comments
      : [];

  const foundAppComment = [...allComments].reverse().find(c => {
    const act = (c.action || c.type || c.decision || '').toLowerCase();
    return act === 'approved' || act === 'approve';
  })?.text;

  const foundRejCommentObj = [...allComments].reverse().find(c => {
    const act = (c.action || c.type || c.decision || '').toLowerCase();
    return act === 'rejected' || act === 'reject';
  });
  const foundRejComment = foundRejCommentObj?.text;
  const foundRejAuthor = foundRejCommentObj?.authorName;

  const foundImpComment = [...allComments].reverse().find(c => {
    const act = (c.action || c.type || c.decision || '').toLowerCase();
    return act === 'implemented' || act === 'implement';
  })?.text;

  const rejApproverName = rejApproval?.approver?.name || (rejApproval?.approverId ? String(rejApproval.approverId) : null);
  const rejectedBy = cr.rejectedBy || cr.customFieldValues?.rejectedBy || rejApproverName || foundRejAuthor || decidedBy || null;

  const appApproval = Array.isArray(approvals) ? approvals.find(a => a.decision === 'Approved' || a.action === 'Approved') : null;
  const approvedBy = cr.approvedBy || appApproval?.approver?.name || (cr.status === 'Rejected' ? rejectedBy : decidedBy) || null;
  const approvedDate = appApproval ? formatDate(new Date(appApproval.decidedAt || appApproval.updatedAt)) : (cr.status === 'Approved' || cr.status === 'Implemented' ? formatDate(new Date(decidedAt || cr.updatedAt)) : null);
  const approvedComment = cr.approvedComment || cr.approved_comment || cr.approvalRationale || cr.approval_rationale || appApproval?.rationale || appApproval?.comments || appApproval?.comment || foundAppComment || null;

  const rejectedDate = rejApproval ? formatDate(new Date(rejApproval.decidedAt || rejApproval.updatedAt)) : (cr.status === 'Rejected' ? formatDate(new Date(decidedAt || closedAt || cr.updatedAt)) : null);
  const rejectedComment = cr.rejectedComment || cr.rejected_comment || cr.rejectionReason || cr.rejection_reason || rejApproval?.rationale || rejApproval?.comments || rejApproval?.comment || foundRejComment || rationale;

  const implementedDate = cr.status === 'Implemented' ? formatDate(new Date(closedAt || cr.updatedAt)) : null;
  const implementedComment = cr.implementedComment || cr.implemented_comment || foundImpComment || (Array.isArray(cr.comments) ? cr.comments.find(c => c.action === 'Implemented')?.text || null : null);

  const isClosedStatus = cr.status === 'Implemented' || cr.status === 'Rejected';
  const closedDate = isClosedStatus
    ? (closedAt ? formatDate(new Date(closedAt)) : (cr.updatedAt ? formatDate(new Date(cr.updatedAt)) : null))
    : null;

  const foundImpCommentObj = [...allComments].reverse().find(c => {
    const act = (c.action || c.type || c.decision || '').toLowerCase();
    return act === 'implemented' || act === 'implement';
  });
  const foundImpAuthor = foundImpCommentObj?.authorName;

  const implementedBy = cr.implementedBy || cr.customFieldValues?.implementedBy || foundImpAuthor || null;
  const implementedByEmail = cr.implementedByEmail || cr.customFieldValues?.implementedByEmail || null;

  return {
    ...rest,
    requesterId: requesterId || cr.requester_id || cr.requesterId || null,
    approverId: approverId || cr.approver_id || cr.approverId || null,
    workflowId: workflowId || cr.workflow_id || cr.workflowId || null,
    approvals: approvals || [],
    decidedBy,
    decidedAt,
    approvedBy,
    approvedDate,
    approvedComment,
    rejectedBy,
    rejectedDate,
    rejectedComment,
    implementedBy,
    implementedByEmail,
    implementedDate,
    implementedComment,
    closedDate,
    requester: requester?.name ?? cr.employeeName ?? null,
    employeeName: cr.employeeName || cr.customFieldValues?.employeeName || requester?.name || null,
    employeeEmail: cr.employeeEmail || cr.customFieldValues?.employeeEmail || requester?.email || null,
    employeeId: cr.employeeId || cr.customFieldValues?.employeeId || requester?.employeeId || null,
    location: cr.location || cr.customFieldValues?.location || null,
    managerEmail: cr.managerEmail || cr.customFieldValues?.managerEmail || null,
    hostname: cr.customFieldValues?.hostname || cr.customFieldValues?.assetId || null,
    environment: cr.customFieldValues?.environment || 'Production',
    approver: approver?.name ?? null,
    raisedDate: submittedAt ? formatDate(new Date(submittedAt)) : (createdAt ? formatDate(new Date(createdAt)) : ''),
    submittedAt: submittedAt || createdAt || null,
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
    closedAt: closedAt || null,
    subcategoryId: cr.subcategoryId || cr.sub_category_id || null,
    customFieldValues: cr.customFieldValues || cr.custom_field_values || {},
    comments: cr.comments || cr.customFieldValues?.comments || [],
    rejectionReason: rationale,
    ...riskStyle(cr.risk),
    ...statusStyle(cr.status)
  };
};

// A pending change request as it appears in the Change Manager worklist.
// Needs include: requester, approvals
export const serializeWorklistEntry = (row) => {
  const cr = plain(row);
  const rejApproval = Array.isArray(cr.approvals) ? cr.approvals.find(a => (a.decision === 'Rejected' || a.action === 'Rejected') && (a.rationale || a.comments)) : null;
  const rationale = cr.rejectionReason || cr.rejection_reason || rejApproval?.rationale || rejApproval?.comments || cr.customFieldValues?.rejectionReason || (cr.status === 'Rejected' ? 'This change request was rejected during Change Manager review.' : null);

  const decidedApproval = Array.isArray(cr.approvals) ? cr.approvals.find(a => (a.decision === 'Approved' || a.decision === 'Rejected' || a.action === 'Approved' || a.action === 'Rejected')) : null;
  const decidedBy = decidedApproval?.approver?.name || cr.decidedBy || null;
  const decidedByEmail = decidedApproval?.approver?.email || cr.decidedByEmail || null;
  const decidedAt = decidedApproval?.decidedAt || decidedApproval?.updatedAt || null;

  const allComments = Array.isArray(cr.comments)
    ? cr.comments
    : Array.isArray(cr.customFieldValues?.comments)
      ? cr.customFieldValues.comments
      : [];

  const foundAppComment = [...allComments].reverse().find(c => {
    const act = (c.action || c.type || c.decision || '').toLowerCase();
    return act === 'approved' || act === 'approve';
  })?.text;

  const foundRejComment = [...allComments].reverse().find(c => {
    const act = (c.action || c.type || c.decision || '').toLowerCase();
    return act === 'rejected' || act === 'reject';
  })?.text;

  const foundImpComment = [...allComments].reverse().find(c => {
    const act = (c.action || c.type || c.decision || '').toLowerCase();
    return act === 'implemented' || act === 'implement';
  })?.text;

  const appApproval = Array.isArray(cr.approvals) ? cr.approvals.find(a => a.decision === 'Approved' || a.action === 'Approved') : null;
  const approvedBy = cr.approvedBy || appApproval?.approver?.name || decidedBy || null;
  const approvedByEmail = appApproval?.approver?.email || decidedByEmail || cr.approvedByEmail || null;
  const approvedDate = appApproval ? formatDate(new Date(appApproval.decidedAt || appApproval.updatedAt)) : (cr.status === 'Approved' || cr.status === 'Implemented' ? formatDate(new Date(decidedAt || cr.updatedAt)) : null);
  const approvedComment = cr.approvedComment || cr.approved_comment || cr.approvalRationale || cr.approval_rationale || appApproval?.rationale || appApproval?.comments || appApproval?.comment || foundAppComment || null;

  const rejectedBy = cr.rejectedBy || rejApproval?.approver?.name || decidedBy || null;
  const rejectedByEmail = rejApproval?.approver?.email || decidedByEmail || cr.rejectedByEmail || null;
  const rejectedDate = rejApproval ? formatDate(new Date(rejApproval.decidedAt || rejApproval.updatedAt)) : (cr.status === 'Rejected' ? formatDate(new Date(decidedAt || cr.closedAt || cr.updatedAt)) : null);
  const rejectedComment = cr.rejectedComment || cr.rejected_comment || cr.rejectionReason || cr.rejection_reason || rejApproval?.rationale || rejApproval?.comments || rejApproval?.comment || foundRejComment || rationale;

  const implementedDate = cr.status === 'Implemented' ? formatDate(new Date(cr.closedAt || cr.updatedAt)) : null;
  const implementedComment = cr.implementedComment || cr.implemented_comment || foundImpComment || (Array.isArray(cr.comments) ? cr.comments.find(c => c.action === 'Implemented')?.text || null : null);

  const isClosedStatus = cr.status === 'Implemented' || cr.status === 'Rejected';
  const closedDate = isClosedStatus
    ? (cr.closedAt ? formatDate(new Date(cr.closedAt)) : (cr.updatedAt ? formatDate(new Date(cr.updatedAt)) : null))
    : null;

  const foundImpCommentObj = [...allComments].reverse().find(c => {
    const act = (c.action || c.type || c.decision || '').toLowerCase();
    return act === 'implemented' || act === 'implement';
  });
  const foundImpAuthor = foundImpCommentObj?.authorName;

  const implementedBy = cr.implementedBy || cr.customFieldValues?.implementedBy || foundImpAuthor || null;
  const implementedByEmail = cr.implementedByEmail || cr.customFieldValues?.implementedByEmail || null;

  return {
    id: cr.id,
    title: cr.title,
    category: cr.category,
    subCategory: cr.subCategory,
    status: cr.status || 'Pending',
    justification: cr.justification,
    hostname: cr.customFieldValues?.hostname || '',
    location: cr.location || '',
    environment: cr.customFieldValues?.environment || '',
    contactNumber: cr.customFieldValues?.contactNumber || '',
    managerEmail: cr.managerEmail,
    employeeId: cr.employeeId || cr.requester?.employeeId || cr.customFieldValues?.employeeId || '',
    employeeName: cr.employeeName || cr.requester?.name || cr.customFieldValues?.employeeName || cr.requesterName || '',
    employeeEmail: cr.customFieldValues?.employeeEmail || cr.requester?.email || cr.employeeEmail || '',
    raisedDate: cr.submittedAt ? formatDate(new Date(cr.submittedAt)) : '',
    submittedAt: cr.submittedAt || cr.createdAt || null,
    createdAt: cr.createdAt || null,
    updatedAt: cr.updatedAt || null,
    closedAt: cr.closedAt || null,
    closedDate,
    comments: cr.comments || cr.customFieldValues?.comments || [],
    startDate: cr.startDate ? formatDate(new Date(cr.startDate)) : '',
    endDate: cr.endDate ? formatDate(new Date(cr.endDate)) : '',
    customFieldValues: cr.customFieldValues || {},
    rejectionReason: rationale,
    requester: cr.requester?.name || cr.employeeName || 'Requester',
    submittedTime: `submitted ${relativeTime(cr.submittedAt)}`,
    risk: cr.risk,
    approvals: cr.approvals || [],
    decidedBy,
    decidedByEmail,
    decidedAt,
    approvedBy,
    approvedByEmail,
    approvedDate,
    approvedComment,
    rejectedBy,
    rejectedByEmail,
    rejectedDate,
    rejectedComment,
    implementedBy,
    implementedByEmail,
    implementedDate,
    implementedComment,
    ...riskStyle(cr.risk),
    ...statusStyle(cr.status)
  };
};

// ---------- Catalog ---------------------------------------

// A workflow with its derived "used by" list. Needs include: catalogItems
export const serializeWorkflow = (row) => {
  const w = plain(row);
  const usedBy =
    Array.isArray(w.subcategories) && w.subcategories.length
      ? w.subcategories.map((s) => s.name).join(', ')
      : 'Standard';
  return { id: w.id, name: w.name, steps: w.steps, usedBy };
};

// ---------- Settings -------------------------------------
// Needs include: role
export const serializeUser = (row) => {
  const u = plain(row);
  return {
    id: u.id,
    name: u.name,
    employeeId: u.employeeId,
    role: u.role?.name ?? null,
    email: u.email,
    status: u.status,
    ...userStatusStyle(u.status)
  };
};

export const serializeAuditLog = (row, actorIdentity = null) => {
  const l = plain(row);
  const act = l.action || '';
  let category = 'User & role changes';
  if (/Rejected/i.test(act)) {
    category = 'Rejected';
  } else if (/Approved|Implemented/i.test(act)) {
    category = 'Approvals';
  } else if (/CR|Created|Draft|Submitted|Sent Back/i.test(act)) {
    category = 'Change requests';
  }

  let actorName = null;
  if (actorIdentity?.displayName || actorIdentity?.name) {
    actorName = actorIdentity.displayName || actorIdentity.name;
  } else if (l.actor?.name) {
    actorName = l.actor.name;
  } else if (l.actorId) {
    // Honest representation if an actor key exists but has no directory name
    actorName = l.actorId;
  } else {
    // Genuinely unrecorded / null actor ID
    const isHumanAction = /CR|Approved|Rejected|Created|Updated|Submitted|Sent Back|Draft/i.test(act);
    actorName = isHumanAction ? 'Unknown' : 'System';
  }

  const employeeEmail = actorIdentity?.email || l.actor?.email || null;
  const employeeId = actorIdentity?.employeeBusinessId || null;
  let cleanTimestamp = '—';
  if (l.timestamp || l.createdAt) {
    try {
      const dt = new Date(l.timestamp || l.createdAt);
      if (!isNaN(dt.getTime())) {
        const dStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const tStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        cleanTimestamp = `${dStr}, ${tStr}`;
      } else {
        cleanTimestamp = String(l.timestamp || l.createdAt).replace(/\.\d{3}\s*\+00:00/i, '');
      }
    } catch {
      cleanTimestamp = String(l.timestamp || l.createdAt);
    }
  }

  return {
    id: l.id,
    timestamp: cleanTimestamp,
    actor: actorName,
    actorId: l.actorId || null,
    employeeId,
    action: l.action,
    reference: l.ref || '—',
    employeeEmail,
    category
  };
};

// ---------- Dashboard metric cards ----------------------
const METRIC_CARD_META = {
  total: { title: 'Total Change Requests', subtext: '▲ 12 This Month', subtextColor: '#10B981', iconBg: '#EBF5FF', iconColor: '#00A4EF' },
  pending: { title: 'Pending Approval', subtext: 'Change Manager Review Pending', subtextColor: 'var(--text-secondary)', iconBg: '#FEF3C7', iconColor: '#D97706' },
  approved: { title: 'Approved', subtext: '▲ 59% Of Total', subtextColor: '#10B981', iconBg: '#D1FAE5', iconColor: '#059669' },
  'in-progress': { title: 'Implemented', subtext: 'Scheduled This Week: 6', subtextColor: 'var(--text-secondary)', iconBg: '#F3E8FF', iconColor: '#7C3AED' },
  rejected: { title: 'Rejected', subtext: '▼ 3 This Month', subtextColor: '#DC2626', iconBg: '#FEE2E2', iconColor: '#DC2626' }
};

export const serializeMetricCards = (stats = {}) => {
  const counts = {
    total: stats.total,
    pending: stats.pending,
    approved: stats.approved,
    'in-progress': stats.inProgress,
    rejected: stats.rejected
  };
  return Object.entries(METRIC_CARD_META).map(([id, meta]) => ({
    id,
    count: String(counts[id] ?? 0),
    ...meta
  }));
};
