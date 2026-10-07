import { Op } from 'sequelize';
import { APPROVAL_STAGE, isManagerReviewStage, isStage2ReviewStage, initialApprovalState } from '../config/approvalWorkflow.js';
import { ROLE } from '../config/constants.js';
import { TravelRequest } from '../models/TravelRequest.js';
import { TravelApproval, Role, ApprovalDecision, ApprovalStage, APPROVAL_DECISION_ID, APPROVAL_STAGE_ID } from '../models/index.js';
import { Employee } from '../models/Employee.js';
import { sequelize, getNextRequestCode } from '../config/database.js';
import { getTravelDeskApproverEmails, getTravelAdminEmails, getBoardMemberEmails } from './userManagement.service.js';
import {
  sendTravelCreatedEmail,
  sendTravelDecisionEmail,
  sendManagerRejectionEmail
} from './mail.service.js';
import { enqueueNotification } from './notificationQueue.service.js';
import { buildDateFilterClause } from '../utils/dateFilterUtils.js';
import { addAuditLog } from './auditLog.service.js';

export const generateTravelCode = async (_tx = null) => {
  return await getNextRequestCode('TR', _tx);
};

// The single place that answers "which employees.emp_id is this email?" --
// used everywhere we need to know who the currently acting person is in
// employee-directory terms, since there is no stored requesterId/login-
// identity column on travel_requests anymore.
const resolveEmployeeIdByEmail = async (email) => {
  const trimmed = (email || '').trim().toLowerCase();
  if (!trimmed) return null;
  const emp = await Employee.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), trimmed),
    attributes: ['empId']
  });
  return emp?.empId || null;
};

export const createTravelService = async (data, user) => {
  const requestCode = await generateTravelCode();
  const requesterId = user?.userKey || user?.id || user?.email || 'unknown';
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

  const travellerEmailInput = (user?.email || '').trim();
  const empRecord = travellerEmailInput
    ? await Employee.findOne({ where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), travellerEmailInput.toLowerCase()) })
    : null;
  if (!empRecord) {
    const err = new Error('Unable to resolve your employee record. A Travel request cannot be created without a valid employee identity.');
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

  const created = await TravelRequest.create({
    requestCode,
    employeeId,
    managerId: validManagerId,
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
    ...initialApprovalState(),
    status: 'Pending Approval'
  });

  await addAuditLog({
    actorId: requesterId,
    action: 'Created Travel Reservation',
    ref: requestCode,
    detail: `Submitted Travel request ${requestCode} for ${empRecord.name} (${created.travelMode}: ${created.fromLocation || 'Origin'} → ${created.toLocation || 'Destination'}) for Manager review.`
  });

  // Enqueue initial Stage 1 Manager Invitation
  if (validManagerId) {
    const mgrRecord = await Employee.findOne({ where: { empId: validManagerId }, attributes: ['email'] });
    if (mgrRecord?.email) {
      enqueueNotification({
        module: 'travel',
        requestId: created.id,
        approvalCycle: created.approvalCycle,
        jobType: 'manager_invitation',
        recipientEmail: mgrRecord.email
      }).catch((err) => console.error('[mail] Queue travel manager invite failed:', err.message));
    }
  }

  return created;
};

export const getTravelRequestsService = async ({ user, userId, isWorklist = false, isOrgWorklist = false, organizationScope = false, status, searchQuery, dateFilter, startDate, endDate, page = 1, limit = 10 }) => {
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
        { '$employeeRecord.name$': { [Op.iLike]: `%${searchQuery}%` } },
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
    include: [
      { model: Employee, as: 'employeeRecord' },
      { model: Employee, as: 'managerRecord' }
    ],
    subQuery: false,
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset
  });

  // approvalRecords is hasMany -- fetched separately for just this page's
  // rows, rather than joined into the paginated query above, since a hasMany
  // join combined with LIMIT/OFFSET (needed for the $employeeRecord.name$
  // search filter above) would corrupt pagination.
  const pageIds = rows.map((r) => r.id);
  const approvalsByRequest = pageIds.length > 0
    ? await TravelApproval.findAll({
        where: { travelRequestId: { [Op.in]: pageIds } },
        include: [
          { model: Employee, as: 'decider' },
          { model: Role, as: 'deciderRoleRecord' },
          { model: ApprovalDecision, as: 'decisionRecord' }
        ],
        order: [['decidedAt', 'ASC']]
      })
    : [];
  const approvalMap = new Map();
  approvalsByRequest.forEach((a) => {
    if (!approvalMap.has(a.travelRequestId)) approvalMap.set(a.travelRequestId, []);
    approvalMap.get(a.travelRequestId).push(a);
  });

  // Calculate high-level summary counts strictly within the scoped where (excluding self requests in personal worklist, respecting dateClause without restricting by status filter)
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

  const formattedItems = rows.map(r => {
    const approvals = approvalMap.get(r.id) || [];
    const lastApproval = approvals[approvals.length - 1] || null;
    const approvedRecord = approvals.find(a => a.decisionRecord?.code === 'Approved');
    const rejectedRecord = approvals.find(a => a.decisionRecord?.code === 'Rejected');
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

    return {
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
      comments: approvals.map((h, idx) => ({
        id: `act-${idx}`,
        authorName: h.decider?.name || 'Reviewer',
        authorRole: h.deciderRoleRecord?.name || 'Reporting Manager',
        text: h.comment || '',
        action: h.decisionRecord?.code,
        createdAt: h.decidedAt
      })),
      decidedBy: lastApproval?.decider?.name || null,
      decidedByEmail: lastApproval?.decider?.email || null,
      approvedComment: approvedRecord?.comment || null,
      approvedDate: fmtDate(approvedRecord?.decidedAt),
      rejectedComment: rejectedRecord?.comment || null,
      rejectionReason: rejectedRecord?.comment || null,
      closedDate: (lastApproval && r.status !== 'Pending Approval') ? fmtDate(lastApproval.decidedAt) : null,
      createdAt: r.createdAt,
      submittedAt: r.createdAt
    };
  });

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
      // Admin (rank 3) sits above the module-specific admins (rank 4) and inherits their authority.
      const isAdmin = user?.roleId === ROLE.ADMIN_LEGACY || (user?.role || '').toLowerCase().trim() === 'admin';

      if (!isBoardUser && !isSuperAdmin && !isTravelAdmin && !isAdmin) {
        if (currentUserEmail) {
          const managerWhere = {
            status: { [Op.iLike]: '%Pending%' },
            '$managerRecord.email$': { [Op.iLike]: currentUserEmail }
          };
          const exclusions = [];
          if (myEmployeeId) exclusions.push({ employeeId: { [Op.ne]: myEmployeeId } });
          if (exclusions.length > 0) managerWhere[Op.and] = exclusions;
          return TravelRequest.count({
            where: managerWhere,
            include: [{ model: Employee, as: 'managerRecord', attributes: [] }]
          });
        }
        return 0;
      }

      const exclusions = [];
      if (myEmployeeId) exclusions.push({ employeeId: { [Op.ne]: myEmployeeId } });

      const actionableWhere = { status: { [Op.iLike]: '%Pending%' } };
      if (exclusions.length > 0) actionableWhere[Op.and] = exclusions;
      // Board members, Super Admins, and Admins can act on short-notice requests too;
      // plain Travel Admins can only act on non-short-notice ones.
      if (!isBoardUser && !isSuperAdmin && !isAdmin) actionableWhere.isShortNotice = false;

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
  const deciderEmployeeId = actor?.employeeBusinessId || await resolveEmployeeIdByEmail(actor?.email);
  if (!deciderEmployeeId) {
    const err = new Error('Unable to resolve your employee record. Cannot record this decision.');
    err.statusCode = 400;
    throw err;
  }

  // Integrity Rule: Users cannot approve/reject their own requests
  if (
    (actor?.employeeBusinessId && req.employeeId && String(actor.employeeBusinessId) === String(req.employeeId)) ||
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
    const managerEmailLower = (reqManagerRecord?.email || '').toLowerCase().trim();
    const isAssignedManager = Boolean(managerEmailLower && actorEmail && managerEmailLower === actorEmail);

    if (!isAssignedManager && !isSuperAdmin && !isAdmin) {
      const err = new Error('Unauthorized: This travel request is awaiting approval from the assigned reporting manager.');
      err.statusCode = 403;
      throw err;
    }

    if (action === 'reject') {
      req.status = 'Rejected';
      req.approvalStage = APPROVAL_STAGE.REJECTED;
      await req.save({ transaction });

      await TravelApproval.create({
        travelRequestId: req.id,
        stageId: APPROVAL_STAGE_ID.MANAGER_REVIEW,
        deciderId: deciderEmployeeId,
        deciderRoleId: actor?.roleId || null,
        decisionId: APPROVAL_DECISION_ID.REJECTED,
        comment: actionComment,
        decidedAt: new Date()
      }, { transaction });

      sendManagerRejectionEmail({
        module: 'travel',
        requestCode: req.requestCode,
        title: `${req.fromLocation} → ${req.toLocation}`,
        requesterEmail: reqEmployeeRecord?.email || null,
        requesterName: reqEmployeeRecord?.name || null,
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
      req.status = 'Pending Approval';
      req.approvalStage = APPROVAL_STAGE.STAGE_2_REVIEW;
      await req.save({ transaction });

      await TravelApproval.create({
        travelRequestId: req.id,
        stageId: APPROVAL_STAGE_ID.MANAGER_REVIEW,
        deciderId: deciderEmployeeId,
        deciderRoleId: actor?.roleId || null,
        decisionId: APPROVAL_DECISION_ID.APPROVED,
        comment: actionComment,
        decidedAt: new Date()
      }, { transaction });

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
          requesterName: reqEmployeeRecord?.name || null,
          requesterEmail: reqEmployeeRecord?.email || null,
          approverEmails,
          isShortNotice: req.isShortNotice
        });
      }).catch((err) => console.error('[mail] travel Stage 2 notify failed:', err.message));

      return req;
    }
  }

  // Stage 2: Travel Admin, Admin, Super Admin, or Board member
  if (req.isShortNotice) {
    if (!isBoardUser && !isSuperAdmin && !isAdmin) {
      const err = new Error('This booking requires Board authorization (Premium/Business class or short-notice booking).');
      err.statusCode = 403;
      throw err;
    }
  } else {
    if (!isTravelAdmin && !isBoardUser && !isSuperAdmin && !isAdmin) {
      const err = new Error('Unauthorized: Only Travel Admins, Admins, or Board Members can decide Stage 2 travel requests.');
      err.statusCode = 403;
      throw err;
    }
  }

  const deciderRoleLabel = isBoardUser ? 'Board Member' : isAdmin ? 'Admin' : isTravelAdmin ? 'Travel Admin' : 'Super Admin';
  const newStatus = action === 'approve' ? 'Approved' : 'Rejected';

  req.status = newStatus;
  req.approvalStage = action === 'approve' ? APPROVAL_STAGE.COMPLETED : APPROVAL_STAGE.REJECTED;
  await req.save({ transaction });

  await TravelApproval.create({
    travelRequestId: req.id,
    stageId: APPROVAL_STAGE_ID.STAGE_2_REVIEW,
    deciderId: deciderEmployeeId,
    deciderRoleId: actor?.roleId || null,
    decisionId: action === 'approve' ? APPROVAL_DECISION_ID.APPROVED : APPROVAL_DECISION_ID.REJECTED,
    comment: actionComment,
    decidedAt: new Date()
  }, { transaction });

  await addAuditLog({
    actorId: actorId || actor?.userKey || actor?.id,
    action: action === 'approve' ? 'Approved Travel' : 'Rejected Travel',
    ref: req.requestCode,
    detail: `${deciderRoleLabel} ${action === 'approve' ? 'approved' : 'rejected'} Travel request ${req.requestCode}: "${actionComment || 'No comment'}"`
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
      travelReq: {
        ...(req.toJSON ? req.toJSON() : req),
        travellerEmail: reqEmployeeRecord?.email || null,
        travellerName: reqEmployeeRecord?.name || null,
        managerEmail: reqManagerRecord?.email || null,
        managerName: reqManagerRecord?.name || null
      },
      action,
      comment: actionComment,
      deciderName: actor?.displayName || actor?.name || actor?.email || 'Approver',
      deciderRole: deciderRoleLabel,
      cc: ccRecipients
    }).catch((err) => console.error('[mail] travel decision email failed:', err.message));
  }).catch((err) => console.error('[mail] Stage 2 travel decision notify error:', err.message));

  return req;
};
