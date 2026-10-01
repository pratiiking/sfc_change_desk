import { Op } from 'sequelize';
import { APPROVAL_STAGE, isManagerReviewStage, isStage2ReviewStage, initialApprovalState } from '../config/approvalWorkflow.js';
import { ROLE } from '../config/constants.js';
import { TravelRequest } from '../models/TravelRequest.js';
import { Employee } from '../models/Employee.js';
import { sequelize, getNextRequestCode } from '../config/database.js';
import { getTravelDeskApproverEmails, getTravelAdminEmails, getBoardMemberEmails } from './userManagement.service.js';
import {
  sendTravelCreatedEmail,
  sendTravelDecisionEmail,
  sendManagerRejectionEmail,
  buildTravelManagerInvitationEmail
} from './mail.service.js';
import { enqueueNotification } from './notificationQueue.service.js';
import { buildDateFilterClause } from '../utils/dateFilterUtils.js';
import { addAuditLog } from './auditLog.service.js';

export const generateTravelCode = async (_tx = null) => {
  return await getNextRequestCode('TR', _tx);
};

export const createTravelService = async (data, user) => {
  const requestCode = await generateTravelCode();
  const requesterId = user?.userKey || user?.id || user?.email || 'unknown';
  const travellerName = data.travellerName || data.Traveller || user?.displayName || user?.name || 'Traveller';
  const travellerEmail = data.travellerEmail || user?.email || '';
  const departureDate = data.departureDate || data['Date of travel'] || data['Date of journey'] || data['Check-in date'] || null;
  const travelMode = data.travelMode || data.category || 'Flight';
  const isFlight = travelMode.toLowerCase() === 'flight' || travelMode.toLowerCase() === 'flights';
  const isCab = travelMode.toLowerCase() === 'cab' || travelMode.toLowerCase() === 'cabs';

  // Determine if Board Approval is required:
  let isShortNotice = Boolean(data.isShortNotice);
  if (isFlight) {
    const flightClass = String(data.travelClass || data['Travel class'] || data.bookingDetails?.['Travel class'] || 'Economy').toLowerCase();
    if (flightClass.includes('premium') || flightClass.includes('business')) {
      isShortNotice = true;
    } else if (departureDate && !isShortNotice) {
      const depTime = new Date(departureDate).getTime();
      const nowTime = new Date().getTime();
      const diffDays = (depTime - nowTime) / (1000 * 60 * 60 * 24);
      if (diffDays < 7) {
        isShortNotice = true;
      }
    }
  }

  if (isCab) {
    const bookingDetails = data.bookingDetails || data.drafts || data || {};
    const passengers = parseInt(bookingDetails['Number of passengers'] || data.passengers || data['Number of passengers'] || '1', 10) || 1;
    const cabTypeStr = String(data.travelClass || bookingDetails['Cab type'] || data['Cab type'] || 'Hatchback').toLowerCase();

    if (cabTypeStr.includes('premium') || cabTypeStr.includes('innova')) {
      isShortNotice = true;
    } else if (cabTypeStr.includes('suv') || cabTypeStr.includes('ertiga')) {
      if (passengers < 3) {
        isShortNotice = true;
      }
    } else if (cabTypeStr.includes('sedan') || cabTypeStr.includes('dzire') || cabTypeStr.includes('aura')) {
      if (passengers < 2) {
        isShortNotice = true;
      }
    }
  }

  let validManagerName = null;
  let validManagerEmail = data.managerEmail || data.Manager ? String(data.managerEmail || data.Manager).trim() : '';

  if (validManagerEmail) {
    const mgrEmp = await Employee.findOne({
      where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), validManagerEmail.toLowerCase())
    });
    if (!mgrEmp) {
      const err = new Error(`Selected manager "${validManagerEmail}" is not found in the employee directory.`);
      err.statusCode = 400;
      throw err;
    }
    if (mgrEmp.leftAt || mgrEmp.leftReason || mgrEmp.leftBy) {
      const err = new Error(`Selected manager "${validManagerEmail}" is inactive/exited.`);
      err.statusCode = 400;
      throw err;
    }
    validManagerName = mgrEmp.name || null;
    validManagerEmail = mgrEmp.email || validManagerEmail;
  }

  const created = await TravelRequest.create({
    requestCode,
    requesterId,
    travellerName,
    travellerEmail,
    travelMode,
    purpose: data.purpose || data['Purpose of visit'] || '',
    tripType: data.tripType || data['Trip type'] || data['Journey type'] || '',
    travelClass: data.travelClass || data['Travel class'] || data['Bus type'] || data['Room type'] || '',
    fromLocation: data.fromLocation || data.From || data['From station'] || data['Pickup location'] || '',
    toLocation: data.toLocation || data.To || data['To station'] || data['Final drop location'] || data['City / Location'] || '',
    departureDate,
    returnDate: data.returnDate || data['Return / onward date'] || data['Return date'] || data['Check-out date'] || null,
    preferredTimeSlot: data.preferredTimeSlot || data['Preferred departure time'] || data['Preferred time slot'] || data['Pickup time'] || '',
    isShortNotice,
    bookingDetails: data.bookingDetails || data.drafts || data,
    policyCertified: Boolean(data.certified || data.policyCertified),
    managerName: validManagerName,
    managerEmail: validManagerEmail,
    ...initialApprovalState(),
    status: 'Pending Approval'
  });

  await addAuditLog({
    actorId: requesterId,
    action: 'Created Travel Reservation',
    ref: requestCode,
    detail: `Submitted Travel request ${requestCode} for ${created.travellerName} (${created.travelMode}: ${created.fromLocation || 'Origin'} → ${created.toLocation || 'Destination'}) for Manager review.`
  });

  // Enqueue initial Stage 1 Manager Invitation
  if (validManagerEmail) {
    buildTravelManagerInvitationEmail(created).then((mailPayload) =>
      enqueueNotification({
        module: 'travel',
        requestId: created.id,
        approvalCycle: created.approvalCycle,
        jobType: 'manager_invitation',
        recipientEmail: validManagerEmail,
        payload: mailPayload
      })
    ).catch((err) => console.error('[mail] Queue travel manager invite failed:', err.message));
  }

  return created;
};

export const getTravelRequestsService = async ({ user, userId, isWorklist = false, isOrgWorklist = false, organizationScope = false, status, searchQuery, dateFilter, startDate, endDate, page = 1, limit = 10 }) => {
  const where = {};
  const andConditions = [];
  const currentUserId = user?.userKey || user?.id || userId || '';
  const currentUserEmail = (user?.email || '').toLowerCase().trim();
  const isOrgView = isOrgWorklist || organizationScope;

  // 1. My Dashboard View (not worklist and not organization scope): Only requests raised by the logged-in user
  if (!isWorklist && !isOrgView && currentUserId) {
    if (currentUserEmail) {
      andConditions.push({
        [Op.or]: [
          { requesterId: currentUserId },
          { travellerEmail: { [Op.iLike]: currentUserEmail } }
        ]
      });
    } else {
      andConditions.push({ requesterId: currentUserId });
    }
  }

  // 2. My Worklist View (personal approver inbox): Exclude requests raised by the logged-in user
  if (isWorklist && !isOrgWorklist && (currentUserId || currentUserEmail)) {
    if (currentUserId) {
      andConditions.push({ requesterId: { [Op.ne]: currentUserId } });
    }
    if (currentUserEmail) {
      andConditions.push({ travellerEmail: { [Op.notILike]: currentUserEmail } });
    }
  }

  if (status && status !== 'All') {
    if (status.toLowerCase() === 'pending') {
      where.status = { [Op.iLike]: '%Pending%' };
    } else if (status.toLowerCase() === 'approved') {
      where.status = { [Op.or]: [{ [Op.iLike]: '%Approved%' }, { [Op.iLike]: '%Booked%' }, { [Op.iLike]: '%Ticketed%' }] };
    } else if (status.toLowerCase() === 'rejected') {
      where.status = { [Op.iLike]: '%Rejected%' };
    } else if (status.toLowerCase() === 'implemented' || status.toLowerCase() === 'completed') {
      where.status = { [Op.or]: [{ [Op.iLike]: '%Completed%' }, { [Op.iLike]: '%Booked%' }, { [Op.iLike]: '%Ticketed%' }] };
    } else {
      where.status = { [Op.iLike]: `%${status}%` };
    }
  }

  if (searchQuery) {
    andConditions.push({
      [Op.or]: [
        { requestCode: { [Op.iLike]: `%${searchQuery}%` } },
        { travellerName: { [Op.iLike]: `%${searchQuery}%` } },
        { travelMode: { [Op.iLike]: `%${searchQuery}%` } },
        { purpose: { [Op.iLike]: `%${searchQuery}%` } },
        { fromLocation: { [Op.iLike]: `%${searchQuery}%` } },
        { toLocation: { [Op.iLike]: `%${searchQuery}%` } }
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
  const { rows, count } = await TravelRequest.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset
  });

  // Calculate high-level summary counts strictly within the scoped where (excluding self requests in personal worklist, respecting dateClause without restricting by status filter)
  const scopedWhere = {};
  if (isWorklist && !isOrgWorklist && (currentUserId || currentUserEmail)) {
    const andConditions = [];
    if (currentUserId) andConditions.push({ requesterId: { [Op.ne]: currentUserId } });
    if (currentUserEmail) andConditions.push({ travellerEmail: { [Op.notILike]: currentUserEmail } });
    if (dateClause) andConditions.push(dateClause);
    if (andConditions.length > 0) scopedWhere[Op.and] = andConditions;
  } else if (dateClause) {
    scopedWhere[Op.and] = [dateClause];
  }
  if (!isWorklist && !isOrgView && currentUserId) {
    if (currentUserEmail) {
      scopedWhere[Op.or] = [
        { requesterId: currentUserId },
        { travellerEmail: { [Op.iLike]: currentUserEmail } }
      ];
    } else {
      scopedWhere.requesterId = currentUserId;
    }
  }

  const allItems = await TravelRequest.findAll({ where: scopedWhere, attributes: ['status', 'travelMode'] });

  let pending = 0;
  let approved = 0;
  let rejected = 0;

  const modeCounts = {};
  allItems.forEach(item => {
    const s = (item.status || '').toLowerCase();
    if (s.includes('pending')) pending++;
    else if (s.includes('approved') || s.includes('booked') || s.includes('ticketed')) approved++;
    else if (s.includes('rejected')) rejected++;

    const m = item.travelMode || 'Flight';
    modeCounts[m] = (modeCounts[m] || 0) + 1;
  });

  const formattedItems = rows.map(r => ({
    id: r.id,
    requestCode: r.requestCode,
    travellerName: r.travellerName,
    travellerEmail: r.travellerEmail,
    department: r.department,
    travelMode: r.travelMode,
    category: r.travelMode,
    title: `${r.travelMode}: ${r.fromLocation || ''} → ${r.toLocation || ''}`,
    purpose: r.purpose,
    tripType: r.tripType,
    travelClass: r.travelClass,
    fromLocation: r.fromLocation,
    toLocation: r.toLocation,
    departureDate: r.departureDate,
    returnDate: r.returnDate,
    preferredTimeSlot: r.preferredTimeSlot,
    isShortNotice: r.isShortNotice,
    bookingDetails: r.bookingDetails || {},
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
    createdAt: r.createdAt,
    submittedAt: r.createdAt
  }));

  return {
    data: formattedItems,
    items: formattedItems,
    total: count,
    totalPages: Math.ceil(count / safeLimit) || 1,
    currentPage: safePage,
    metrics: {
      total: allItems.length,
      pending,
      approved,
      rejected
    },
    categories: Object.entries(modeCounts).map(([mode, cnt]) => ({
      category: mode,
      label: mode,
      count: cnt,
      percentage: allItems.length > 0 ? Math.round((cnt / allItems.length) * 100) : 0
    })),
    statusBreakdown: [
      { status: 'Pending', label: 'Pending Approvals', count: pending },
      { status: 'Approved', label: 'Approved / Booked', count: approved },
      { status: 'Rejected', label: 'Rejected', count: rejected }
    ],
    statusCounts: {
      All: allItems.length,
      Pending: pending,
      Approved: approved,
      Rejected: rejected
    },
    actionableCount: await (async () => {
      // Over the FULL matching set, not just the current page, so it doesn't
      // silently undercount past the page size.
      if (!isWorklist) return 0;

      const isSuperAdmin = user?.isSuperAdmin || user?.roleId === ROLE.SUPER_ADMIN || (user?.role || '').toLowerCase().includes('super');
      const isBoardUser = user?.isBoardUser || user?.roleId === 'role-board' || (user?.role || '').toLowerCase().includes('board');
      const isTravelAdmin = user?.isTravelAdmin || user?.roleId === ROLE.TRAVEL_ADMIN || ((user?.role || '').toLowerCase().includes('admin') && (user?.role || '').toLowerCase().includes('travel'));

      if (!isBoardUser && !isSuperAdmin && !isTravelAdmin) {
        if (currentUserEmail) {
          const managerWhere = {
            status: { [Op.iLike]: '%Pending%' },
            managerEmail: { [Op.iLike]: currentUserEmail }
          };
          const exclusions = [];
          if (currentUserId) exclusions.push({ requesterId: { [Op.ne]: currentUserId } });
          if (currentUserEmail) exclusions.push({ travellerEmail: { [Op.notILike]: currentUserEmail } });
          if (exclusions.length > 0) managerWhere[Op.and] = exclusions;
          return TravelRequest.count({ where: managerWhere });
        }
        return 0;
      }

      const exclusions = [];
      if (currentUserId) exclusions.push({ requesterId: { [Op.ne]: currentUserId } });
      if (currentUserEmail) exclusions.push({ travellerEmail: { [Op.notILike]: currentUserEmail } });

      const actionableWhere = { status: { [Op.iLike]: '%Pending%' } };
      if (exclusions.length > 0) actionableWhere[Op.and] = exclusions;
      // Board members can act on short-notice requests too; Super/Travel Admins
      // can only act on non-short-notice ones.
      if (!isBoardUser) actionableWhere.isShortNotice = false;

      return TravelRequest.count({ where: actionableWhere });
    })()
  };
};

export const handleTravelActionService = async ({ id, action, comment, actor }) => {
  const actionComment = (comment || '').trim();
  if (!actionComment) {
    const err = new Error(`A non-empty comment is required to ${action} this Travel request.`);
    err.statusCode = 400;
    throw err;
  }

  return sequelize.transaction(async (transaction) => {
    return handleTravelActionWithinTransaction({ id, action, actionComment, actor, transaction });
  });
};

const handleTravelActionWithinTransaction = async ({ id, action, actionComment, actor, transaction }) => {
  // Row-locked read: a concurrent decision on the same request blocks here until the
  // first transaction commits, then sees the now-updated status and is rejected below
  // instead of silently overwriting the first reviewer's decision.
  const req = await TravelRequest.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!req) {
    const err = new Error(`Travel request ${id} not found`);
    err.statusCode = 404;
    throw err;
  }

  if (['Approved', 'Rejected'].includes(req.status)) {
    const err = new Error(`This travel request has already been ${req.status.toLowerCase()} by another reviewer.`);
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

  const isTravelAdmin =
    actorRoleId === ROLE.TRAVEL_ADMIN ||
    (actorRole.includes('admin') && actorRole.includes('travel')) ||
    actorRolesList.some(r => r === ROLE.TRAVEL_ADMIN || (r.includes('admin') && r.includes('travel')));

  // Integrity Rule: Users cannot approve/reject their own requests across all aliases
  const actorId = actor?.userKey || actor?.id || actor?.email || '';
  const actorEmail = (actor?.email || '').toLowerCase().trim();
  const reqEmail = (req.travellerEmail || '').toLowerCase().trim();
  const reqId = String(req.requesterId || '');

  const actorAliases = new Set([actorId, actor?.userKey, actor?.id, actor?.employeeBusinessId, actorEmail].filter(Boolean));
  if (Array.isArray(actor?.aliases)) {
    actor.aliases.forEach(a => actorAliases.add(String(a)));
  }

  if (
    actorAliases.has(reqId) ||
    (actorEmail && reqEmail && actorEmail === reqEmail)
  ) {
    const err = new Error('Separation of duties violation: You cannot approve or reject your own travel request.');
    err.statusCode = 403;
    throw err;
  }

  const isStage1 = isManagerReviewStage(req.approvalStage);
  const isStage2 = isStage2ReviewStage(req.approvalStage, req.status, 'Pending Approval');

  if (isStage1) {
    // Stage 1: Reporting Manager Review
    const managerEmailLower = (req.managerEmail || '').toLowerCase().trim();
    const isAssignedManager = Boolean(managerEmailLower && actorEmail && managerEmailLower === actorEmail);

    if (!isAssignedManager && !isSuperAdmin) {
      const err = new Error('Unauthorized: This travel request is awaiting approval from the assigned reporting manager.');
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
        module: 'travel',
        requestCode: req.requestCode,
        title: `${req.fromLocation} → ${req.toLocation}`,
        requesterEmail: req.travellerEmail,
        requesterName: req.travellerName,
        managerName: actor?.displayName || actor?.name || 'Manager',
        managerEmail: actor?.email,
        comment: actionComment
      }).catch((err) => console.error('[mail] travel manager rejection notify failed:', err.message));

      await addAuditLog({
        actorId: actorId || actor?.userKey || actor?.id,
        action: 'Rejected Travel (Manager)',
        ref: req.requestCode,
        detail: `Reporting Manager rejected Travel request ${req.requestCode}: "${actionComment || 'No comment'}"`
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
        action: 'Approved Travel (Manager)',
        ref: req.requestCode,
        detail: `Reporting Manager approved Travel request ${req.requestCode} and forwarded to Travel Desk.`
      }, transaction);

      // Notify Travel Admin / Board Members for Stage 2
      getTravelDeskApproverEmails(req.isShortNotice).then((approverEmails) => {
        sendTravelCreatedEmail({
          travelReq: req.toJSON ? req.toJSON() : req,
          requesterName: req.travellerName,
          requesterEmail: req.travellerEmail,
          approverEmails,
          isShortNotice: req.isShortNotice
        });
      }).catch((err) => console.error('[mail] travel Stage 2 notify failed:', err.message));

      return req;
    }
  }

  // Stage 2: Travel Admin OR Board member
  if (req.isShortNotice) {
    if (!isBoardUser && !isSuperAdmin) {
      const err = new Error('This booking requires Board authorization (Premium/Business class or short-notice booking).');
      err.statusCode = 403;
      throw err;
    }
  } else {
    if (!isTravelAdmin && !isBoardUser && !isSuperAdmin) {
      const err = new Error('Unauthorized: Only Travel Admins or Board Members can decide Stage 2 travel requests.');
      err.statusCode = 403;
      throw err;
    }
  }

  const newStatus = action === 'approve' ? 'Approved' : 'Rejected';
  const history = Array.isArray(req.approvalHistory) ? [...req.approvalHistory] : [];
  history.push({
    action,
    decision: newStatus,
    comment: actionComment,
    actorName: actor?.displayName || actor?.name || actor?.email || 'Approver',
    actorEmail: actor?.email || '',
    actorRole: isBoardUser ? 'Board Member' : isTravelAdmin ? 'Travel Admin' : 'Super Admin',
    timestamp: new Date().toISOString()
  });

  req.status = newStatus;
  req.approvalStage = action === 'approve' ? APPROVAL_STAGE.COMPLETED : APPROVAL_STAGE.REJECTED;
  req.approvalHistory = history;
  await req.save({ transaction });

  await addAuditLog({
    actorId: actorId || actor?.userKey || actor?.id,
    action: action === 'approve' ? 'Approved Travel' : 'Rejected Travel',
    ref: req.requestCode,
    detail: `${isBoardUser ? 'Board Member' : isTravelAdmin ? 'Travel Admin' : 'Super Admin'} ${action === 'approve' ? 'approved' : 'rejected'} Travel request ${req.requestCode}: "${actionComment || 'No comment'}"`
  }, transaction);

  // Notify Traveller, Travel Admin, and Finance (FINANCE_NOTIFICATION_EMAIL if set)
  Promise.all([
    getTravelAdminEmails()
  ]).then(([adminEmails]) => {
    const financeEmail = process.env.FINANCE_NOTIFICATION_EMAIL ? [process.env.FINANCE_NOTIFICATION_EMAIL] : [];
    if (!process.env.FINANCE_NOTIFICATION_EMAIL) {
      console.warn('[mail] FINANCE_NOTIFICATION_EMAIL is unset in backend environment. Continuing without finance copy.');
    }
    const ccRecipients = Array.from(new Set([...adminEmails, ...financeEmail])).filter(Boolean);

    sendTravelDecisionEmail({
      travelReq: req.toJSON ? req.toJSON() : req,
      action,
      comment: actionComment,
      deciderName: actor?.displayName || actor?.name || actor?.email || 'Approver',
      deciderRole: isBoardUser ? 'Board Member' : isTravelAdmin ? 'Travel Admin' : 'Super Admin',
      cc: ccRecipients
    }).catch((err) => console.error('[mail] travel decision email failed:', err.message));
  }).catch((err) => console.error('[mail] Stage 2 travel decision notify error:', err.message));

  return req;
};
