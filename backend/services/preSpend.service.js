import { Op, fn, col } from 'sequelize';
import { APPROVAL_STAGE, isManagerReviewStage, isStage2ReviewStage, initialApprovalState } from '../config/approvalWorkflow.js';
import { ROLE } from '../config/constants.js';
import { PreSpendRequest } from '../models/PreSpendRequest.js';
import { Employee } from '../models/Employee.js';
import { sequelize, getNextRequestCode } from '../config/database.js';
import { getBoardMemberEmails, getPreSpendAdminEmails } from './userManagement.service.js';
import {
  sendPreSpendCreatedEmail,
  sendPreSpendDecisionEmail,
  sendManagerRejectionEmail
} from './mail.service.js';
import { enqueueNotification } from './notificationQueue.service.js';
import { buildDateFilterClause } from '../utils/dateFilterUtils.js';
import { uploadBase64ToAzureBlob } from '../utils/blobStorage.util.js';
import { addAuditLog } from './auditLog.service.js';

export const generatePreSpendCode = async (_tx = null) => {
  return await getNextRequestCode('PS', _tx);
};

// The single place that answers "which employees.emp_id is this email?" --
// used everywhere we need to know who the currently acting person is in
// employee-directory terms, since there is no stored requesterId/login-
// identity column on pre_spend_requests anymore.
const resolveEmployeeIdByEmail = async (email) => {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) return null;
  const emp = await Employee.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), trimmed),
    attributes: ['empId']
  });
  return emp?.empId || null;
};

export const createPreSpendService = async (data, user) => {
  const requestCode = await generatePreSpendCode();
  const requesterId = user?.userKey || user?.id || user?.email || 'unknown';

  const requesterEmailInput = (user?.email || '').trim();
  const empRecord = requesterEmailInput
    ? await Employee.findOne({ where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), requesterEmailInput.toLowerCase()) })
    : null;
  if (!empRecord) {
    const err = new Error('Unable to resolve your employee record. A Pre-Spend request cannot be created without a valid employee identity.');
    err.statusCode = 400;
    throw err;
  }
  const employeeId = empRecord.empId;

  let validManagerId = null;
  const managerEmailInput = data.managerEmail || data.Manager ? String(data.managerEmail || data.Manager).trim() : '';

  if (managerEmailInput) {
    const mgrEmp = await Employee.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), managerEmailInput.toLowerCase())
    });
    if (!mgrEmp) {
      const err = new Error(`Selected manager "${managerEmailInput}" is not found in the employee directory.`);
      err.statusCode = 400;
      throw err;
    }
    if (mgrEmp.leftAt || mgrEmp.leftReason || mgrEmp.leftBy) {
      const err = new Error(`Selected manager "${managerEmailInput}" is inactive/exited.`);
      err.statusCode = 400;
      throw err;
    }
    validManagerId = mgrEmp.empId;
  }

  // Process vendor quotes: upload base64/file payloads to Azure Blob storage
  let processedVendors = [];
  if (Array.isArray(data.vendors) && data.vendors.length > 0) {
    processedVendors = await Promise.all(
      data.vendors.map(async (v) => {
        let fileUrl = v.fileUrl || null;

        // If fileData is present (base64 string), upload to Azure Blob
        if (v.fileData && typeof v.fileData === 'string' && (v.fileData.startsWith('data:') || v.fileData.length > 200)) {
          try {
            const uploadRes = await uploadBase64ToAzureBlob(v.fileData, v.fileName || `${v.name || 'vendor'}-quote.pdf`, 'pre-spend/quotes');
            if (uploadRes?.fileUrl) {
              fileUrl = uploadRes.fileUrl;
            }
          } catch (uploadErr) {
            console.error(`[Azure Blob] Failed to upload quote for vendor "${v.name}":`, uploadErr.message);
          }
        }

        return {
          name: v.name || '',
          amount: v.amount || '',
          date: v.date || '',
          fileName: v.fileName || (fileUrl ? 'quote.pdf' : ''),
          fileUrl: fileUrl,
          // Keep fileData only if upload failed and we still need fallback, else drop heavy base64
          ...(fileUrl ? {} : { fileData: v.fileData })
        };
      })
    );
  }

  const created = await PreSpendRequest.create({
    requestCode,
    employeeId,
    managerId: validManagerId,
    category: data.category || 'General',
    subcategory: data.subcategory || '',
    itemDescription: data.buying || data.itemDescription || '',
    estimatedAmount: Number(data.amount || data.estimatedAmount || data.vendors?.[0]?.amount || 0),
    neededByDate: data.neededBy || data.neededByDate || null,
    costCentre: data.costCentre || '',
    budgetLine: data.budgetLine || '',
    businessJustification: data.justification || data.businessJustification || '',
    isUrgent: Boolean(data.urgent || data.isUrgent),
    urgentReason: data.urgentReason || '',
    vendors: processedVendors,
    selectedVendor: data.selectedVendor || (processedVendors[0]?.name || data.vendors?.[0]?.name || ''),
    commercialException: data.commercial?.exception || data.commercialException || '',
    commercialReason: data.commercial?.reason || data.commercialReason || '',
    commercialJustification: data.commercial?.justification || data.commercialJustification || '',
    policyCertified: Boolean(data.certified || data.policyCertified),
    ...initialApprovalState(),
  });

  await addAuditLog({
    actorId: requesterId,
    action: 'Created Pre-Spend Requisition',
    ref: requestCode,
    detail: `Submitted Pre-Spend requisition ${requestCode} for ${created.itemDescription || created.category} (Est. ${created.estimatedAmount || 0}) for Manager review.`
  });

  // Enqueue initial Stage 1 Manager Invitation
  if (validManagerId) {
    const mgrRecord = await Employee.findOne({ where: { empId: validManagerId }, attributes: ['email'] });
    if (mgrRecord?.email) {
      enqueueNotification({
        module: 'prespend',
        requestId: created.id,
        approvalCycle: created.approvalCycle,
        jobType: 'manager_invitation',
        recipientEmail: mgrRecord.email
      }).catch((err) => console.error('[mail] Queue pre-spend manager invite failed:', err.message));
    }
  }

  return created;
};

export const getPreSpendRequestsService = async ({ user, userId, isWorklist = false, isOrgWorklist = false, organizationScope = false, status, searchQuery, dateFilter, startDate, endDate, page = 1, limit = 10 }) => {
  const where = {};
  const andConditions = [];
  const currentUserId = user?.userKey || user?.id || userId || '';
  const currentUserEmail = (user?.email || '').toLowerCase().trim();
  const isOrgView = isOrgWorklist || organizationScope;

  const myEmployeeId = currentUserEmail ? await resolveEmployeeIdByEmail(currentUserEmail) : null;

  // 1. My Dashboard View (not worklist and not organization scope): Only requests raised by the logged-in user
  if (!isWorklist && !isOrgView && currentUserId) {
    andConditions.push({ employeeId: myEmployeeId || '__no_match__' });
  }

  // 2. My Worklist View (personal approver inbox): Exclude requests raised by the logged-in user
  if (isWorklist && !isOrgWorklist && (currentUserId || currentUserEmail)) {
    if (myEmployeeId) {
      andConditions.push({ employeeId: { [Op.ne]: myEmployeeId } });
    }
  }

  if (status && status !== 'All') {
    if (status.toLowerCase() === 'pending') {
      where.status = { [Op.iLike]: '%Pending%' };
    } else if (status.toLowerCase() === 'approved') {
      where.status = { [Op.iLike]: '%Approved%' };
    } else if (status.toLowerCase() === 'rejected') {
      where.status = { [Op.iLike]: '%Rejected%' };
    } else if (status.toLowerCase() === 'implemented' || status.toLowerCase() === 'processed') {
      where.status = { [Op.iLike]: '%Processed%' };
    } else {
      where.status = { [Op.iLike]: `%${status}%` };
    }
  }

  if (searchQuery) {
    andConditions.push({
      [Op.or]: [
        { requestCode: { [Op.iLike]: `%${searchQuery}%` } },
        { itemDescription: { [Op.iLike]: `%${searchQuery}%` } },
        { category: { [Op.iLike]: `%${searchQuery}%` } },
        { '$employeeRecord.name$': { [Op.iLike]: `%${searchQuery}%` } }
      ]
    });
  }

  const dateClause = buildDateFilterClause(dateFilter, startDate, endDate);
  if (dateClause) {
    andConditions.push(dateClause);
  }

  if (andConditions.length > 0) {
    where[Op.and] = andConditions;
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (safePage - 1) * safeLimit;
  const { rows, count } = await PreSpendRequest.findAndCountAll({
    where,
    include: [
      { model: Employee, as: 'employeeRecord' },
      { model: Employee, as: 'managerRecord' }
    ],
    subQuery: false,
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset
  });

  // Calculate summary metrics & category distributions within the scoped where (excluding self in worklist and respecting dateClause, but without the status filter constraint so metric cards and tabs show overall counts)
  const scopedWhere = {};
  if (isWorklist && !isOrgWorklist && (currentUserId || currentUserEmail)) {
    const andConditions = [];
    if (myEmployeeId) andConditions.push({ employeeId: { [Op.ne]: myEmployeeId } });
    if (dateClause) andConditions.push(dateClause);
    if (andConditions.length > 0) scopedWhere[Op.and] = andConditions;
  } else if (dateClause) {
    scopedWhere[Op.and] = [dateClause];
  }
  if (!isWorklist && !isOrgView && currentUserId) {
    scopedWhere.employeeId = myEmployeeId || '__no_match__';
  }

  const [statusAggregates, categoryAggregates] = await Promise.all([
    PreSpendRequest.findAll({
      where: scopedWhere,
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count'],
        [fn('SUM', col('estimated_amount')), 'totalAmount']
      ],
      group: ['status'],
      raw: true
    }),
    PreSpendRequest.findAll({
      where: scopedWhere,
      attributes: [
        'category',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['category'],
      raw: true
    })
  ]);

  let pending = 0;
  let approved = 0;
  let rejected = 0;
  let totalAmount = 0;

  statusAggregates.forEach((row) => {
    const s = (row.status || '').toLowerCase();
    const cnt = parseInt(row.count, 10) || 0;
    const amt = parseFloat(row.totalAmount) || 0;
    totalAmount += amt;

    if (s.includes('pending')) {
      pending += cnt;
    } else if (s.includes('approved') || s.includes('procured')) {
      approved += cnt;
    } else if (s.includes('rejected')) {
      rejected += cnt;
    }
  });

  const categoryCounts = {};
  categoryAggregates.forEach((row) => {
    const cat = row.category || 'Other';
    categoryCounts[cat] = parseInt(row.count, 10) || 0;
  });

  const formattedItems = rows.map(r => ({
    id: r.id,
    requestCode: r.requestCode,
    category: r.category,
    subcategory: r.subcategory,
    buying: r.itemDescription,
    title: `${r.category} - ${r.itemDescription}`,
    itemDescription: r.itemDescription,
    amount: Number(r.estimatedAmount),
    estimatedAmount: Number(r.estimatedAmount),
    neededBy: r.neededByDate,
    neededByDate: r.neededByDate,
    costCentre: r.costCentre,
    budgetLine: r.budgetLine,
    justification: r.businessJustification,
    isUrgent: r.isUrgent,
    urgentReason: r.urgentReason,
    vendors: r.vendors || [],
    selectedVendor: r.selectedVendor,
    commercial: {
      exception: r.commercialException,
      reason: r.commercialReason,
      justification: r.commercialJustification
    },
    status: r.status,
    approvalStage: r.approvalStage || APPROVAL_STAGE.MANAGER_REVIEW,
    managerName: r.managerName || null,
    managerEmail: r.managerEmail || null,
    policyCertified: r.policyCertified,
    approvalHistory: r.approvalHistory || [],
    comments: Array.isArray(r.approvalHistory) ? r.approvalHistory.map((h, idx) => ({
      id: `act-${idx}`,
      authorName: h.actorName || 'Reviewer',
      authorRole: h.actorRole || 'Approver',
      text: h.comment || '',
      action: h.decision || h.action,
      createdAt: h.timestamp
    })) : [],
    decidedBy: (Array.isArray(r.approvalHistory) && r.approvalHistory.length > 0)
      ? r.approvalHistory[r.approvalHistory.length - 1].actorName
      : null,
    decidedByEmail: (Array.isArray(r.approvalHistory) && r.approvalHistory.length > 0)
      ? r.approvalHistory[r.approvalHistory.length - 1].actorEmail
      : null,
    approvedComment: (Array.isArray(r.approvalHistory) && r.approvalHistory.find(h => h.action === 'approve'))
      ? r.approvalHistory.find(h => h.action === 'approve').comment
      : null,
    approvedDate: (Array.isArray(r.approvalHistory) && r.approvalHistory.find(h => h.action === 'approve'))
      ? new Date(r.approvalHistory.find(h => h.action === 'approve').timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : null,
    rejectedComment: (Array.isArray(r.approvalHistory) && r.approvalHistory.find(h => h.action === 'reject'))
      ? r.approvalHistory.find(h => h.action === 'reject').comment
      : null,
    rejectionReason: (Array.isArray(r.approvalHistory) && r.approvalHistory.find(h => h.action === 'reject'))
      ? r.approvalHistory.find(h => h.action === 'reject').comment
      : null,
    closedDate: (Array.isArray(r.approvalHistory) && r.approvalHistory.length > 0 && r.status !== 'Pending Approval')
      ? new Date(r.approvalHistory[r.approvalHistory.length - 1].timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : null,
    requesterName: r.requesterName,
    requesterEmail: r.requesterEmail,
    raisedDate: r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
    raisedAt: r.createdAt,
    createdAt: r.createdAt,
    submittedAt: r.createdAt
  }));

  const totalCount = count || (pending + approved + rejected);

  // Calculate actionable count for worklist mode — over the FULL matching set, not
  // just the current page, so it doesn't silently undercount past the page size.
  let actionableCount = 0;
  if (isWorklist) {
    const isSuperAdmin = user?.isSuperAdmin || user?.roleId === ROLE.SUPER_ADMIN || (user?.role || '').toLowerCase().includes('super');
    const isBoardUser = user?.isBoardUser || user?.roleId === 'role-board' || (user?.role || '').toLowerCase().includes('board');
    const isPreSpendAdmin = user?.isPreSpendAdmin || user?.roleId === ROLE.PRESPEND_ADMIN || ((user?.role || '').toLowerCase().includes('admin') && (user?.role || '').toLowerCase().includes('spend'));
    // Admin (rank 3) sits above the module-specific admins (rank 4) and inherits their authority.
    const isAdmin = user?.roleId === ROLE.ADMIN_LEGACY || (user?.role || '').toLowerCase().trim() === 'admin';

    const exclusions = [];
    if (myEmployeeId) exclusions.push({ employeeId: { [Op.ne]: myEmployeeId } });

    if (isSuperAdmin || isBoardUser || isPreSpendAdmin || isAdmin) {
      const actionableWhere = { status: { [Op.iLike]: '%Pending%' } };
      if (exclusions.length > 0) actionableWhere[Op.and] = exclusions;
      actionableCount = await PreSpendRequest.count({ where: actionableWhere });
    } else if (currentUserEmail) {
      // Line manager pending stage 1 reviews
      const actionableWhere = {
        status: { [Op.iLike]: '%Pending%' },
        '$managerRecord.email$': { [Op.iLike]: currentUserEmail }
      };
      if (exclusions.length > 0) actionableWhere[Op.and] = exclusions;
      actionableCount = await PreSpendRequest.count({
        where: actionableWhere,
        include: [{ model: Employee, as: 'managerRecord', attributes: [] }]
      });
    }
  }

  return {
    data: formattedItems,
    items: formattedItems,
    total: count,
    totalPages: Math.ceil(count / safeLimit) || 1,
    currentPage: safePage,
    metrics: {
      total: totalCount,
      pending,
      approved,
      rejected,
      totalAmount
    },
    categories: Object.entries(categoryCounts).map(([cat, cnt]) => ({
      category: cat,
      label: cat,
      count: cnt,
      percentage: totalCount > 0 ? Math.round((cnt / totalCount) * 100) : 0
    })),
    statusBreakdown: [
      { status: 'Pending', label: 'Pending Approvals', count: pending },
      { status: 'Approved', label: 'Approved', count: approved },
      { status: 'Rejected', label: 'Rejected', count: rejected }
    ],
    statusCounts: {
      All: totalCount,
      Pending: pending,
      Approved: approved,
      Rejected: rejected
    },
    actionableCount
  };
};

export const handlePreSpendActionService = async ({ id, action, comment, actor }) => {
  const actionComment = (comment || '').trim();
  if (!actionComment) {
    const err = new Error(`A non-empty comment is required to ${action} this Pre-Spend request.`);
    err.statusCode = 400;
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    return handlePreSpendActionWithinTransaction({ id, action, actionComment, actor, transaction });
  });
};

const handlePreSpendActionWithinTransaction = async ({ id, action, actionComment, actor, transaction }) => {
  // Row-locked read: a concurrent decision on the same request blocks here until the
  // first transaction commits, then sees the now-updated status and is rejected below
  // instead of silently overwriting the first reviewer's decision.
  const req = await PreSpendRequest.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!req) {
    const err = new Error(`Pre-spend request ${id} not found`);
    err.statusCode = 404;
    throw err;
  }

  if (['Approved', 'Rejected'].includes(req.status)) {
    const err = new Error(`This pre-spend request has already been ${req.status.toLowerCase()} by another reviewer.`);
    err.statusCode = 409;
    throw err;
  }

  // Authorization Check
  const actorRole = (actor?.role || actor?.roleName || '').toLowerCase();
  const actorRoleId = actor?.roleId || '';
  const actorRolesList = Array.isArray(actor?.roles)
    ? actor.roles.map(r => typeof r === 'string' ? r.toLowerCase() : (r.roleId || r.roleName || '').toLowerCase())
    : Array.isArray(actor?.rolesList)
    ? actor.rolesList.map(r => String(r).toLowerCase())
    : [];

  const isBoardUser =
    actorRoleId === ROLE.BOARD ||
    actorRoleId === 'role-board' ||
    actorRole.includes('board') ||
    actorRolesList.some(r => r === ROLE.BOARD || r === 'role-board' || r.includes('board'));

  const isSuperAdmin =
    actorRoleId === ROLE.SUPER_ADMIN ||
    actorRole.includes('super') ||
    actorRolesList.some(r => r === ROLE.SUPER_ADMIN || r.includes('super'));

  const isPreSpendAdmin =
    actorRoleId === ROLE.PRESPEND_ADMIN ||
    (actorRole.includes('admin') && (actorRole.includes('spend') || actorRole.includes('prespend'))) ||
    actorRolesList.some(r => r === ROLE.PRESPEND_ADMIN || (r.includes('admin') && (r.includes('spend') || r.includes('prespend'))));

  // Admin (rank 3) sits above the module-specific admins (rank 4) and inherits their authority.
  const isAdmin =
    actorRoleId === ROLE.ADMIN_LEGACY ||
    actorRole === 'admin' ||
    actorRolesList.some(r => r === ROLE.ADMIN_LEGACY || r === 'admin');

  // req is row-locked (no include) -- resolve the employee/manager emails we
  // need for comparisons via direct lookups rather than the virtual getters.
  const actorId = actor?.userKey || actor?.id || actor?.email || '';
  const actorEmail = (actor?.email || '').toLowerCase().trim();
  const [reqEmployeeRecord, reqManagerRecord] = await Promise.all([
    req.employeeId ? Employee.findOne({ where: { empId: req.employeeId }, attributes: ['name', 'email'] }) : null,
    req.managerId ? Employee.findOne({ where: { empId: req.managerId }, attributes: ['name', 'email'] }) : null
  ]);
  const reqEmail = (reqEmployeeRecord?.email || '').toLowerCase().trim();

  // Integrity Rule: Users cannot approve/reject their own requests
  if (
    (actor?.employeeBusinessId && req.employeeId && String(actor.employeeBusinessId) === String(req.employeeId)) ||
    (actorEmail && reqEmail && actorEmail === reqEmail)
  ) {
    const err = new Error('Separation of duties violation: You cannot approve or reject your own pre-spend request.');
    err.statusCode = 403;
    throw err;
  }

  const isStage1 = isManagerReviewStage(req.approvalStage);
  const isStage2 = isStage2ReviewStage(req.approvalStage, req.status, 'Pending Approval');

  if (isStage1) {
    // Stage 1: Reporting Manager review
    const managerEmailLower = (reqManagerRecord?.email || '').toLowerCase().trim();
    const isAssignedManager = Boolean(managerEmailLower && actorEmail && managerEmailLower === actorEmail);

    if (!isAssignedManager && !isSuperAdmin && !isAdmin) {
      const err = new Error('Unauthorized: This pre-spend requisition is awaiting approval from the assigned reporting manager.');
      err.statusCode = 403;
      throw err;
    }

    if (action === 'reject') {
      const history = Array.isArray(req.approvalHistory) ? [...req.approvalHistory] : [];
      history.push({
        action: 'reject',
        decision: 'Rejected by Manager',
        comment: actionComment,
        actorName: actor?.displayName || actor?.name || actor?.email || 'Reporting Manager',
        actorEmail: actor?.email || '',
        actorRole: 'Reporting Manager',
        timestamp: new Date().toISOString()
      });

      req.status = 'Rejected';
      req.approvalStage = APPROVAL_STAGE.REJECTED;
      req.approvalHistory = history;
      await req.save({ transaction });

      sendManagerRejectionEmail({
        module: 'prespend',
        requestCode: req.requestCode,
        title: req.itemDescription,
        requesterEmail: reqEmployeeRecord?.email || null,
        requesterName: reqEmployeeRecord?.name || null,
        managerName: actor?.displayName || actor?.name || 'Manager',
        managerEmail: actor?.email,
        comment: actionComment
      }).catch((err) => console.error('[mail] manager rejection notify failed:', err.message));

      await addAuditLog({
        actorId: actorId || actor?.userKey || actor?.id,
        action: 'Rejected Pre-Spend (Manager)',
        ref: req.requestCode,
        detail: `Reporting Manager rejected Pre-Spend requisition ${req.requestCode}: "${actionComment || 'No comment'}"`
      }, transaction);

      return req;
    }

    if (action === 'approve') {
      const history = Array.isArray(req.approvalHistory) ? [...req.approvalHistory] : [];
      history.push({
        action: 'approve',
        decision: 'Manager Approved',
        comment: actionComment,
        actorName: actor?.displayName || actor?.name || actor?.email || 'Reporting Manager',
        actorEmail: actor?.email || '',
        actorRole: 'Reporting Manager',
        timestamp: new Date().toISOString()
      });

      req.status = 'Pending Approval';
      req.approvalStage = APPROVAL_STAGE.STAGE_2_REVIEW;
      req.approvalHistory = history;
      await req.save({ transaction });

      await addAuditLog({
        actorId: actorId || actor?.userKey || actor?.id,
        action: 'Approved Pre-Spend (Manager)',
        ref: req.requestCode,
        detail: `Reporting Manager approved Pre-Spend requisition ${req.requestCode} and forwarded to Board review.`
      }, transaction);

      // Notify Board members (Stage 2 approvers) & send view-only copy to Pre-Spend Admin
      Promise.all([
        getBoardMemberEmails(),
        getPreSpendAdminEmails()
      ]).then(([boardEmails, adminEmails]) => {
        const approverEmails = boardEmails.length ? boardEmails : adminEmails;
        sendPreSpendCreatedEmail({
          preSpend: req.toJSON ? req.toJSON() : req,
          requesterName: reqEmployeeRecord?.name || null,
          requesterEmail: reqEmployeeRecord?.email || null,
          approverEmails
        });
      }).catch((err) => console.error('[mail] pre-spend Stage 2 notify failed:', err.message));

      return req;
    }
  }

  // Stage 2: Board Member, Super Admin, or Admin approval (Pre-spend Admin is view-only at this stage)
  if (!isBoardUser && !isSuperAdmin && !isAdmin) {
    if (isPreSpendAdmin) {
      const err = new Error('View-only access: Pre-Spend Admin cannot decide Stage 2. Pre-Spend requires Board Member approval.');
      err.statusCode = 403;
      throw err;
    }
    const err = new Error('Unauthorized: Only Board Members, Admins, or Super Admins can authorize Stage 2 Pre-Spend requisitions.');
    err.statusCode = 403;
    throw err;
  }

  const deciderRoleLabel = isBoardUser ? 'Board Member' : isAdmin ? 'Admin' : 'Super Admin';
  const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
  const history = Array.isArray(req.approvalHistory) ? [...req.approvalHistory] : [];
  history.push({
    action,
    decision: newStatus,
    comment: actionComment,
    actorName: actor?.displayName || actor?.name || actor?.email || deciderRoleLabel,
    actorEmail: actor?.email || '',
    actorRole: deciderRoleLabel,
    timestamp: new Date().toISOString()
  });

  req.status = newStatus;
  req.approvalStage = action === 'approve' ? APPROVAL_STAGE.COMPLETED : APPROVAL_STAGE.REJECTED;
  req.approvalHistory = history;
  await req.save({ transaction });

  await addAuditLog({
    actorId: actorId || actor?.userKey || actor?.id,
    action: action === 'approve' ? 'Approved Pre-Spend (Board)' : 'Rejected Pre-Spend (Board)',
    ref: req.requestCode,
    detail: `${deciderRoleLabel} ${action === 'approve' ? 'approved' : 'rejected'} Pre-Spend requisition ${req.requestCode}: "${actionComment || 'No comment'}"`
  }, transaction);

  // Notify Requester, Pre-Spend Admin, and Finance (FINANCE_NOTIFICATION_EMAIL if set)
  Promise.all([
    getPreSpendAdminEmails()
  ]).then(([adminEmails]) => {
    const financeEmail = process.env.FINANCE_NOTIFICATION_EMAIL ? [process.env.FINANCE_NOTIFICATION_EMAIL] : [];
    if (!process.env.FINANCE_NOTIFICATION_EMAIL) {
      console.warn('[mail] FINANCE_NOTIFICATION_EMAIL is unset in backend environment. Continuing without finance copy.');
    }
    const ccRecipients = Array.from(new Set([...adminEmails, ...financeEmail])).filter(Boolean);

    sendPreSpendDecisionEmail({
      preSpend: {
        ...(req.toJSON ? req.toJSON() : req),
        requesterEmail: reqEmployeeRecord?.email || null,
        requesterName: reqEmployeeRecord?.name || null,
        managerEmail: reqManagerRecord?.email || null,
        managerName: reqManagerRecord?.name || null
      },
      action,
      comment: actionComment,
      deciderName: actor?.displayName || actor?.name || actor?.email || deciderRoleLabel,
      deciderRole: deciderRoleLabel,
      cc: ccRecipients
    }).catch((err) => console.error('[mail] pre-spend decision email failed:', err.message));
  }).catch((err) => console.error('[mail] Stage 2 decision notify error:', err.message));

  return req;
};

export const getPastVendorBySubcategoryService = async (subcategory = '', category = '') => {
  if (!subcategory && !category) return null;

  const where = {};
  if (subcategory) {
    where.subcategory = { [Op.iLike]: `%${subcategory.trim()}%` };
  }
  if (category) {
    where.category = { [Op.iLike]: `%${category.trim()}%` };
  }

  // Find the most recent approved or submitted pre-spend request with vendor information
  const pastReq = await PreSpendRequest.findOne({
    where,
    order: [['createdAt', 'DESC']]
  });

  if (!pastReq) return null;

  const vendors = Array.isArray(pastReq.vendors) ? pastReq.vendors : [];
  const preferredVendor = vendors[0] || null;

  if (!preferredVendor && !pastReq.selectedVendor) return null;

  const vendorName = preferredVendor?.name || pastReq.selectedVendor;
  const vendorAmount = preferredVendor?.amount || pastReq.estimatedAmount || 0;
  const quoteDate = preferredVendor?.date || (pastReq.createdAt ? new Date(pastReq.createdAt).toISOString().split('T')[0] : '');

  return {
    vendorName,
    vendorAmount: Number(vendorAmount),
    subcategory: pastReq.subcategory || subcategory,
    category: pastReq.category || category,
    quoteDate,
    requestCode: pastReq.requestCode,
    status: pastReq.status
  };
};

