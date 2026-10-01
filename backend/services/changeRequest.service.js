import { Op, fn, col } from 'sequelize';
import { getNextRequestCode } from '../config/database.js';
import {
  sequelize,
  CatalogCategory,
  CatalogSubcategory,
  CatalogSubcategoryField,
  ChangeRequest,
  ChangeRequestApproval,
  AppConfig,
  ChangeManagerCategory,
  ChangeImplementerCategory
} from '../models/index.js';
import { Employee } from '../models/Employee.js';
import { UserAppRole } from '../models/UserAppRole.js';
import { IdentityResolver } from './identityResolver.service.js';
import { checkUserInUserTable } from './auth.service.js';
import { isRestrictedAction } from '../config/constants.js';
import { APPROVAL_STAGE, isManagerReviewStage, isStage2ReviewStage, initialApprovalState } from '../config/approvalWorkflow.js';
import { addAuditLog } from './auditLog.service.js';
import { buildDateFilterClause } from '../utils/dateFilterUtils.js';
import { getApproverEmails, getImplementerEmails } from './userManagement.service.js';
import {
  sendChangeRequestCreatedEmail,
  sendChangeRequestApprovedEmail,
  sendChangeRequestImplementedEmail,
  sendChangeRequestRejectedEmail,
  sendManagerRejectionEmail,
  buildChangeRequestManagerInvitationEmail
} from './mail.service.js';
import { enqueueNotification } from './notificationQueue.service.js';
import {
  serializeChangeRequest,
  serializeWorklistEntry
} from '../utils/serializers.js';

// Includes reused across change-request queries.
const CR_INCLUDE = [
  { model: ChangeRequestApproval, as: 'approvals' }
];

// ---------- AppConfig singletons --------------------------

const getConfig = async (key, fallback = {}) => {
  const row = await AppConfig.findByPk(key);
  return row ? row.value : fallback;
};

const updateConfig = async (key, mutate, tx) => {
  const row = await AppConfig.findByPk(key, { transaction: tx });
  const current = row ? row.value : {};
  const next = { ...current, ...mutate(current) };
  if (row) {
    row.value = next;
    row.changed('value', true);
    await row.save({ transaction: tx });
  } else {
    await AppConfig.create({ key, value: next }, { transaction: tx });
  }
  return next;
};

export const getChangeRequestsService = async () => {
  const rows = await ChangeRequest.findAll({
    include: CR_INCLUDE,
    order: [['id', 'DESC'], ['submittedAt', 'DESC'], ['createdAt', 'DESC']]
  });
  return rows.map(serializeChangeRequest);
};

export const getFilteredChangeRequests = async ({
  userId = null,
  currentUser = null,
  isWorklist = false,
  actingUserId = null,
  status = null,
  dateFilter = null,
  startDate = null,
  endDate = null,
  searchQuery = null,
  organizationScope = false,
  page = 1,
  limit = 10
}) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
  const offset = (p - 1) * l;

  const andClauses = [];

  if (userId && !isWorklist && !organizationScope) {
    const userEmail = (currentUser?.email || '').trim().toLowerCase();
    if (userEmail) {
      andClauses.push({
        [Op.or]: [
          { requesterId: userId },
          sequelize.where(sequelize.fn('LOWER', sequelize.col('employee_email')), userEmail)
        ]
      });
    } else {
      andClauses.push({ requesterId: userId });
    }
  }

  if (isWorklist) {
    andClauses.push({ status: { [Op.ne]: 'Draft' } });
    if (actingUserId) {
      const identityRes = await IdentityResolver.resolveByKey(actingUserId);
      const identity = identityRes.status === 'SUCCESS' ? identityRes.identity : null;
      const rolesList = identity?.rolesList || (identity?.roleId ? [identity.roleId] : []);
      const isSuperOrAdmin = rolesList.includes('role-1') || rolesList.includes('role-2') || rolesList.includes('role-2-change') || identity?.isSuperAdmin || identity?.isChangeAdmin;
      const isChangeManager = rolesList.includes('role-3') || Boolean(identity?.isChangeManager) || (identity?.cmCategories && identity.cmCategories.length > 0);
      const isChangeImplementer = rolesList.includes('role-5') || Boolean(identity?.isChangeImplementer) || (identity?.ciCategories && identity.ciCategories.length > 0);

      // Rule: No user sees their own requests in My Worklist
      if (!organizationScope) {
        const ownIds = new Set([actingUserId]);
        if (identity) {
          if (identity.userKey) ownIds.add(identity.userKey);
          if (identity.employeeBusinessId) ownIds.add(identity.employeeBusinessId);
          if (identity.sourceId) ownIds.add(String(identity.sourceId));
          if (identity.id) ownIds.add(String(identity.id));
        }
        const excludeIdsList = Array.from(ownIds).filter(Boolean);
        andClauses.push({ requesterId: { [Op.notIn]: excludeIdsList } });

        if (identity?.employeeBusinessId) {
          andClauses.push({ employeeId: { [Op.ne]: identity.employeeBusinessId } });
        }
      }

      // Rule: In My Worklist, users with assigned categories see requests belonging to their categories
      // Super Admin and Change Admin have organization-wide visibility across all categories
      if (!organizationScope && !isSuperOrAdmin) {
        const userAliases = Array.from(new Set([
          actingUserId,
          ...(identity?.userKey ? [identity.userKey] : []),
          ...(identity?.id ? [String(identity.id)] : []),
          ...(identity?.email ? [identity.email.trim().toLowerCase()] : []),
          ...(identity?.employeeBusinessId ? [identity.employeeBusinessId] : []),
          ...(identity?.sourceId ? [`EMP-${identity.sourceId}`, `S8-${identity.sourceId}`, `usr-${identity.sourceId}`, String(identity.sourceId)] : []),
          ...(Array.isArray(identity?.aliases) ? identity.aliases : []),
          ...(typeof actingUserId === 'string' && actingUserId.includes('-') ? [actingUserId.split('-')[1]] : [])
        ])).filter(Boolean);

        const [cmAssignments, ciAssignments] = await Promise.all([
          ChangeManagerCategory.findAll({
            where: { userId: { [Op.in]: userAliases } },
            raw: true
          }),
          ChangeImplementerCategory.findAll({
            where: { userId: { [Op.in]: userAliases } },
            raw: true
          })
        ]);

        const cmCatIds = cmAssignments.map(a => a.categoryId);
        const ciCatIds = ciAssignments.map(a => a.categoryId);
        const assignedCategoryIds = Array.from(new Set([...cmCatIds, ...ciCatIds])).filter(Boolean);

        if (assignedCategoryIds.length > 0) {
          const assignedCategories = await CatalogCategory.findAll({
            where: {
              [Op.or]: [
                { id: { [Op.in]: assignedCategoryIds } },
                { name: { [Op.in]: assignedCategoryIds } }
              ]
            },
            raw: true
          });

          const categoryConditions = [];
          for (const c of assignedCategories) {
            categoryConditions.push({ category: c.name });
            categoryConditions.push({ category: { [Op.iLike]: `%${c.name}%` } });
            categoryConditions.push({ category: c.id });
          }
          for (const idOrName of assignedCategoryIds) {
            categoryConditions.push({ category: idOrName });
            categoryConditions.push({ category: { [Op.iLike]: `%${idOrName}%` } });
          }

          if (categoryConditions.length > 0) {
            andClauses.push({ [Op.or]: categoryConditions });
          } else {
            andClauses.push({ id: 'NONE' });
          }
        } else {
          andClauses.push({ id: 'NONE' });
        }
      }
    }
  }

  if (dateFilter && dateFilter !== 'overall') {
    const dateClause = buildDateFilterClause(dateFilter, startDate, endDate);
    if (dateClause) andClauses.push(dateClause);
  }

  if (searchQuery && String(searchQuery).trim()) {
    const query = String(searchQuery).trim();
    andClauses.push({
      [Op.or]: [
        { id: { [Op.iLike]: `%${query}%` } },
        { title: { [Op.iLike]: `%${query}%` } },
        { category: { [Op.iLike]: `%${query}%` } },
        { subCategory: { [Op.iLike]: `%${query}%` } }
      ]
    });
  }

  const baseWhere = andClauses.length > 0 ? { [Op.and]: andClauses } : {};

  // Compute status counts
  const statusCounts = {
    All: 0,
    Pending: 0,
    Approved: 0,
    InProcess: 0,
    Implemented: 0,
    'In progress': 0,
    Rejected: 0,
    Draft: 0
  };

  const countRows = await ChangeRequest.findAll({
    where: baseWhere,
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    group: ['status'],
    raw: true
  });

  for (const row of countRows) {
    const st = (row.status || '').toLowerCase();
    const count = Number(row.count) || 0;

    statusCounts.All += count;

    if (st === 'pending' || st === 'submitted') statusCounts.Pending += count;
    else if (st === 'approved') {
      statusCounts.Approved += count;
      statusCounts.InProcess += count;
    }
    else if (st === 'implemented') {
      statusCounts.Implemented += count;
    }
    else if (st === 'in progress' || st === 'scheduled') {
      statusCounts['In progress'] += count;
      statusCounts.Implemented += count;
    }
    else if (st === 'rejected') statusCounts.Rejected += count;
    else if (st === 'draft') statusCounts.Draft += count;
  }

  let queryWhere = baseWhere;
  if (status && status.toLowerCase() !== 'all') {
    const stLower = status.toLowerCase();
    let statusClause;
    if (stLower === 'pending') {
      statusClause = { status: { [Op.iLike]: '%pending%' } };
    } else if (stLower === 'approved' || stLower === 'in process' || stLower === 'inprocess') {
      statusClause = { status: 'Approved' };
    } else if (stLower === 'in progress' || stLower === 'implemented') {
      statusClause = { status: { [Op.or]: ['In progress', 'Scheduled', 'Implemented'] } };
    } else if (stLower === 'rejected') {
      statusClause = { status: 'Rejected' };
    } else if (stLower === 'draft') {
      statusClause = { status: { [Op.iLike]: '%draft%' } };
    }

    if (statusClause) {
      queryWhere = andClauses.length > 0
        ? { [Op.and]: [...andClauses, statusClause] }
        : statusClause;
    }
  }

  const { count: total, rows } = await ChangeRequest.findAndCountAll({
    where: queryWhere,
    include: CR_INCLUDE,
    order: [['submittedAt', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
    distinct: true,
    limit: l,
    offset
  });

  let userApprovalMap = new Map();
  let decidedByMap = new Map();
  let isSuperOrAdmin = true;
  let isChangeManager = false;
  let isChangeImplementer = false;
  let assignedCategoryIds = new Set();
  let actingUserEmail = '';
  let categoryNameToIdMap = new Map();
  let actingUserKeys = new Set();
  let identityRes = null;

  const pageRequestIds = rows.map((row) => row.id);
  const allDecidedApprovals = await ChangeRequestApproval.findAll({
    where: { changeRequestId: { [Op.in]: pageRequestIds }, decision: { [Op.ne]: 'Pending' } }
  });
  const uniqueApproverIds = [...new Set(allDecidedApprovals.map((a) => a.approverId).filter(Boolean))];
  const approverResults = await Promise.all(uniqueApproverIds.map(async (approverId) => [
    approverId,
    await IdentityResolver.resolveByKey(approverId)
  ]));
  const approverIdentities = new Map(approverResults.map(([approverId, res]) => [
    approverId,
    res.status === 'SUCCESS' ? res.identity : null
  ]));

  let deciderInfoMap = new Map();
  for (const approval of allDecidedApprovals) {
    const iden = approverIdentities.get(approval.approverId);
    if (iden) {
      deciderInfoMap.set(approval.changeRequestId, {
        name: iden.displayName || iden.name,
        email: iden.email || null
      });
      decidedByMap.set(approval.changeRequestId, iden.displayName || iden.name);
    }
  }

  let cmCatIds = new Set();
  let ciCatIds = new Set();

  if (isWorklist && actingUserId) {
    const userApprovals = await ChangeRequestApproval.findAll({
      where: { approverId: actingUserId, changeRequestId: { [Op.in]: pageRequestIds } }
    });
    userApprovalMap = new Map(userApprovals.map((a) => [a.changeRequestId, a.decision]));

    actingUserKeys = new Set([actingUserId]);
    identityRes = await IdentityResolver.resolveByKey(actingUserId);
    if (identityRes.status === 'SUCCESS' && identityRes.identity) {
      const iden = identityRes.identity;
      if (iden.userKey) actingUserKeys.add(iden.userKey);
      if (iden.id) actingUserKeys.add(String(iden.id));
      if (iden.sourceId) actingUserKeys.add(String(iden.sourceId));
      if (iden.employeeBusinessId) actingUserKeys.add(iden.employeeBusinessId);
      if (Array.isArray(iden.aliases)) iden.aliases.forEach(a => actingUserKeys.add(a));
    }

    const roleId = identityRes.status === 'SUCCESS' ? identityRes.identity.roleId : null;
    const roleName = String(identityRes.identity?.role || '').toLowerCase();
    isSuperOrAdmin = roleId === 'role-1' || roleId === 'role-2' || roleId === 'role-2-change' || roleName.includes('super') || roleName.includes('change desk admin') || roleName.includes('change admin') || (roleName.includes('admin') && !roleName.includes('travel') && !roleName.includes('spend'));
    isChangeManager = roleId === 'role-3' || roleName.includes('manager') || (identityRes.identity?.cmCategories && identityRes.identity.cmCategories.length > 0);
    isChangeImplementer = roleId === 'role-5' || roleName.includes('implementer') || (identityRes.identity?.ciCategories && identityRes.identity.ciCategories.length > 0);

    const identity = identityRes.status === 'SUCCESS' ? identityRes.identity : null;
    cmCatIds = new Set(identity?.cmCategories ?? []);
    ciCatIds = new Set(identity?.ciCategories ?? []);
    assignedCategoryIds = new Set([...(identity?.cmCategories ?? []), ...(identity?.ciCategories ?? [])]);
    actingUserEmail = ((identityRes.status === 'SUCCESS' ? identityRes.identity?.email : '') || '').toLowerCase().trim();

    const allCategories = await CatalogCategory.findAll({ attributes: ['id', 'name'] });
    for (const c of allCategories) {
      categoryNameToIdMap.set(c.id, c.id);
      if (c.name) categoryNameToIdMap.set(c.name.toLowerCase().trim(), c.id);
    }
  }

  const approvalCommentsMap = await getConfig('cr_approval_comments', {});

  const requesterIds = [...new Set(rows.map((cr) => cr.requesterId).filter(Boolean).map(String))];
  const requesterResults = await Promise.all(requesterIds.map(async (requesterId) => [
    requesterId,
    await IdentityResolver.resolveByKey(requesterId)
  ]));
  const requesters = new Map(requesterResults);

  const data = rows.map((cr) => {
    const persisted = approvalCommentsMap[cr.id] || {};
    const deciderInfo = deciderInfoMap.get(cr.id) || {};
    const crPlain = typeof cr.get === 'function' ? cr.get({ plain: true }) : { ...cr };
    if (crPlain.requesterId) {
      const requesterRes = requesters.get(String(crPlain.requesterId));
      if (requesterRes.status === 'SUCCESS' && requesterRes.identity) {
        crPlain.employeeName = crPlain.employeeName || requesterRes.identity.displayName || requesterRes.identity.name;
        crPlain.employeeEmail = crPlain.employeeEmail || requesterRes.identity.email;
        crPlain.employeeId = crPlain.employeeId || requesterRes.identity.employeeBusinessId;
      }
    }
    const enrichedCr = {
      ...crPlain,
      approvedComment: persisted.approvedComment || crPlain.approvedComment,
      approvedBy: persisted.approvedBy || deciderInfo.name || crPlain.approvedBy,
      approvedByEmail: persisted.approvedByEmail || deciderInfo.email || crPlain.approvedByEmail || null,
      decidedBy: persisted.approvedBy || persisted.rejectedBy || deciderInfo.name || crPlain.decidedBy,
      decidedByEmail: deciderInfo.email || crPlain.decidedByEmail || null,
      rejectedComment: persisted.rejectedComment || crPlain.rejectedComment,
      rejectionReason: persisted.rejectionReason || persisted.rejectedComment || crPlain.rejectionReason,
      implementedComment: persisted.implementedComment || crPlain.implementedComment,
      implementedBy: persisted.implementedBy || crPlain.customFieldValues?.implementedBy || crPlain.implementedBy || null,
      implementedByEmail: persisted.implementedByEmail || crPlain.customFieldValues?.implementedByEmail || crPlain.implementedByEmail || null
    };
    const serialized = isWorklist ? serializeWorklistEntry(enrichedCr) : serializeChangeRequest(enrichedCr);

    if (isWorklist) {
      const myDecision = userApprovalMap.get(cr.id) || 'Pending';

      const resolvedCategoryId = cr.categoryId || categoryNameToIdMap.get((cr.category || '').toLowerCase().trim());
      const isCmCategoryAssigned = isSuperOrAdmin || (resolvedCategoryId ? cmCatIds.has(resolvedCategoryId) : false);
      const isCiCategoryAssigned = isSuperOrAdmin || (resolvedCategoryId ? ciCatIds.has(resolvedCategoryId) : false);

      const isSelfRequest = actingUserId ? (
        (cr.requesterId && (cr.requesterId === actingUserId || (typeof actingUserKeys !== 'undefined' && actingUserKeys.has(cr.requesterId)))) ||
        (cr.employeeId && (typeof actingUserKeys !== 'undefined' && actingUserKeys.has(cr.employeeId)))
      ) : false;

      const isStage1 = isManagerReviewStage(cr.approvalStage);
      const isStage2 = isStage2ReviewStage(cr.approvalStage, cr.status, 'Pending');

      const crManagerEmail = (cr.managerEmail || '').toLowerCase().trim();
      const isAssignedReportingManager = Boolean(actingUserEmail && crManagerEmail && actingUserEmail === crManagerEmail);

      const canAct = !isSelfRequest && (
        isSuperOrAdmin
          ? (cr.status === 'Pending' || cr.status === 'Approved')
          : isStage1
            ? (isAssignedReportingManager && cr.status === 'Pending')
            : isStage2
              ? (isChangeManager && isCmCategoryAssigned && cr.status === 'Pending' && myDecision === 'Pending')
              : (isChangeImplementer && isCiCategoryAssigned && cr.status === 'Approved')
      );

      const decidedBy = persisted.approvedBy || persisted.rejectedBy || deciderInfo.name || decidedByMap.get(cr.id) || serialized.decidedBy || '—';
      const decidedByEmail = deciderInfo.email || serialized.approvedByEmail || serialized.decidedByEmail || null;
      return {
        ...serialized,
        approvedComment: persisted.approvedComment || serialized.approvedComment,
        approvedBy: persisted.approvedBy || deciderInfo.name || serialized.approvedBy,
        approvedByEmail: deciderInfo.email || serialized.approvedByEmail || null,
        rejectedComment: persisted.rejectedComment || serialized.rejectedComment,
        implementedComment: persisted.implementedComment || serialized.implementedComment,
        status: cr.status,
        myDecision,
        decidedBy,
        decidedByEmail,
        canAct
      };
    }

    return {
      ...serialized,
      approvedComment: persisted.approvedComment || serialized.approvedComment,
      approvedBy: persisted.approvedBy || deciderInfo.name || serialized.approvedBy,
      approvedByEmail: deciderInfo.email || serialized.approvedByEmail || null,
      decidedBy: persisted.approvedBy || persisted.rejectedBy || deciderInfo.name || serialized.decidedBy,
      decidedByEmail: deciderInfo.email || serialized.decidedByEmail || null,
      rejectedComment: persisted.rejectedComment || serialized.rejectedComment,
      implementedComment: persisted.implementedComment || serialized.implementedComment
    };
  });

  const inProcessCount = statusCounts.InProcess || statusCounts.Approved || 0;

  const metrics = {
    pending: statusCounts.Pending || 0,
    approved: statusCounts.Approved || 0,
    inProcess: inProcessCount,
    rejected: statusCounts.Rejected || 0,
    implemented: statusCounts.Implemented || statusCounts['In progress'] || statusCounts['In Progress'] || 0
  };

  let actionableCount = 0;
  if (isWorklist && actingUserId) {
    const allWorklistRows = await ChangeRequest.findAll({
      where: baseWhere,
      attributes: ['id', 'status', 'approvalStage', 'category', 'requesterId', 'employeeId', 'managerEmail'],
      raw: true
    });

    const allRowIds = allWorklistRows.map(r => r.id);
    const userAllApprovals = await ChangeRequestApproval.findAll({
      where: { approverId: actingUserId, changeRequestId: { [Op.in]: allRowIds } },
      raw: true
    });
    const allUserApprovalMap = new Map(userAllApprovals.map(a => [a.changeRequestId, a.decision]));

    for (const cr of allWorklistRows) {
      const myDecision = allUserApprovalMap.get(cr.id) || 'Pending';
      const resolvedCategoryId = cr.categoryId || categoryNameToIdMap.get((cr.category || '').toLowerCase().trim());
      const isCmCategoryAssigned = isSuperOrAdmin || (resolvedCategoryId ? cmCatIds.has(resolvedCategoryId) : false);
      const isCiCategoryAssigned = isSuperOrAdmin || (resolvedCategoryId ? ciCatIds.has(resolvedCategoryId) : false);

      const isSelfRequest = actingUserId ? (
        (cr.requesterId && (cr.requesterId === actingUserId || (typeof actingUserKeys !== 'undefined' && actingUserKeys.has(cr.requesterId)))) ||
        (cr.employeeId && (typeof actingUserKeys !== 'undefined' && actingUserKeys.has(cr.employeeId)))
      ) : false;

      const isStage1 = isManagerReviewStage(cr.approvalStage);
      const isStage2 = isStage2ReviewStage(cr.approvalStage, cr.status, 'Pending');
      const crManagerEmail = (cr.managerEmail || '').toLowerCase().trim();
      const isAssignedReportingManager = Boolean(actingUserEmail && crManagerEmail && actingUserEmail === crManagerEmail);

      const canAct = !isSelfRequest && (
        isSuperOrAdmin
          ? (cr.status === 'Pending' || cr.status === 'Approved')
          : isStage1
            ? (isAssignedReportingManager && cr.status === 'Pending')
            : isStage2
              ? (isChangeManager && isCmCategoryAssigned && cr.status === 'Pending' && myDecision === 'Pending')
              : (isChangeImplementer && isCiCategoryAssigned && cr.status === 'Approved')
      );

      if (canAct) actionableCount++;
    }
  }

  return {
    data,
    total,
    page: p,
    limit: l,
    totalPages: Math.max(1, Math.ceil(total / l)),
    statusCounts,
    metrics,
    actionableCount
  };
};

export const filterChangeRequestsByCategoryService = async (category, requesterId, page = 1, limit = 10, status = null) => {
  return getFilteredChangeRequests({
    userId: requesterId,
    status: status || (category !== 'all' ? category : null),
    page,
    limit
  });
};

const nextChangeRequestId = async (tx) => {
  return await getNextRequestCode('CR', tx);
};

export async function getVotersForCategory(categoryId, tx) {
  const adminRoles = await UserAppRole.findAll({
    where: { roleId: { [Op.in]: ['role-1', 'role-2', 'role-2-change'] } },
    transaction: tx
  });
  const adminKeys = adminRoles.map((r) => r.userKey);

  let cmKeys = [];
  if (categoryId) {
    const cmAssignments = await ChangeManagerCategory.findAll({
      where: { categoryId },
      transaction: tx
    });
    const cmUserIds = cmAssignments.map((a) => a.userId);
    if (cmUserIds.length > 0) {
      const cmRoles = await UserAppRole.findAll({
        where: {
          userKey: { [Op.in]: cmUserIds },
          roleId: 'role-3'
        },
        transaction: tx
      });
      cmKeys = cmRoles.map((r) => r.userKey);
    }
  }

  const voterKeys = Array.from(new Set([...adminKeys, ...cmKeys]));
  return voterKeys.map((key) => ({ id: key, userKey: key }));
}

const createApprovalSnapshot = async (changeRequest, tx) => {
  const voters = await getVotersForCategory(changeRequest.categoryId, tx);
  if (voters.length > 0) {
    await ChangeRequestApproval.bulkCreate(
      voters.map((v) => ({
        changeRequestId: changeRequest.id,
        approverId: v.id,
        decision: 'Pending'
      })),
      { transaction: tx }
    );
  }
};

const identityOwnsRequest = async (actorId, requesterId) => {
  if (!actorId || !requesterId) return false;
  const identityRes = await IdentityResolver.resolveByKey(String(actorId));
  if (identityRes.status !== 'SUCCESS') return actorId === requesterId;
  const identity = identityRes.identity;
  const keys = new Set([actorId, identity.userKey, identity.id, identity.sourceId, identity.employeeBusinessId]);
  (identity.aliases || []).forEach((alias) => keys.add(alias));
  return keys.has(requesterId) || String(requesterId) === String(identity.employeeBusinessId);
};

export const updateDraftChangeRequestService = async (id, actorId, payload = {}) => {
  const cr = await ChangeRequest.findByPk(id);
  if (!cr) {
    const err = new Error(`Change Request ${id} not found`);
    err.statusCode = 404;
    throw err;
  }

  if (actorId && cr.requesterId && !(await identityOwnsRequest(actorId, cr.requesterId))) {
    const err = new Error('Unauthorized: You can only edit your own draft requests');
    err.statusCode = 403;
    throw err;
  }

  if (cr.status !== 'Draft') {
    const err = new Error('Integrity constraint: Only draft change requests can be edited');
    err.statusCode = 400;
    throw err;
  }

  let workflowId = cr.workflowId;
  let categoryName = payload.category || cr.category;
  let subCategoryName = payload.subCategory || cr.subCategory;

  if (payload.subcategoryId) {
    const subcat = await CatalogSubcategory.findByPk(payload.subcategoryId, {
      include: [
        { model: CatalogCategory, as: 'category' },
        { model: CatalogSubcategoryField, as: 'fields' }
      ]
    });
    if (subcat) {
      workflowId = subcat.workflowId || workflowId;
      categoryName = subcat.category?.name || categoryName;
      subCategoryName = subcat.name;
    }
  }

  if (payload.title) cr.title = payload.title;
  cr.category = categoryName;
  cr.subCategory = subCategoryName;
  if (payload.justification !== undefined) cr.justification = payload.justification;
  if (payload.startDate) cr.startDate = payload.startDate;
  if (payload.endDate) cr.endDate = payload.endDate;
  if (payload.risk) cr.risk = payload.risk;
  const empKey = actorId || payload.userKey || cr.requesterId;
  let empRecord = null;
  if (typeof empKey === 'string' && empKey.startsWith('EMP-')) {
    const empNumericId = parseInt(empKey.replace('EMP-', ''), 10);
    if (!isNaN(empNumericId)) empRecord = await Employee.findByPk(empNumericId);
  }
  if (!empRecord && (payload.currentUser?.email || cr.employeeEmail)) {
    const emailToLookup = (payload.currentUser?.email || cr.employeeEmail).trim().toLowerCase();
    if (emailToLookup) {
      empRecord = await Employee.findOne({
        where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), emailToLookup)
      });
    }
  }
  if (empRecord) {
    if (empRecord.location && String(empRecord.location).trim()) {
      cr.location = String(empRecord.location).trim();
    }
    if (empRecord.empId && String(empRecord.empId).trim()) {
      cr.employeeId = String(empRecord.empId).trim();
    }
  } else if (payload.location && !payload.location.includes('Auto-fetched')) {
    cr.location = payload.location;
  }
  if (payload.managerEmail !== undefined) cr.managerEmail = payload.managerEmail;
  if (payload.customFieldValues) cr.customFieldValues = payload.customFieldValues;
  if (workflowId) cr.workflowId = workflowId;

  await cr.save();

  await addAuditLog({
    actorId,
    action: 'CR Draft Updated',
    ref: id,
    detail: `Updated draft ${id}.`
  });

  const updated = await ChangeRequest.findByPk(id, { include: CR_INCLUDE });
  return serializeChangeRequest(updated);
};

export const submitDraftChangeRequestService = async (id, actorId = null) => {
  await sequelize.transaction(async (tx) => {
    const cr = await ChangeRequest.findByPk(id, { transaction: tx });
    if (!cr) {
      const err = new Error(`Change Request ${id} not found`);
      err.statusCode = 404;
      throw err;
    }

    if (actorId && !(await identityOwnsRequest(actorId, cr.requesterId))) {
      const err = new Error('Unauthorized: You can only submit your own draft requests');
      err.statusCode = 403;
      throw err;
    }
    if (cr.status !== 'Draft') {
      const err = new Error('Integrity constraint: Only draft requests can be submitted');
      err.statusCode = 400;
      throw err;
    }

    cr.status = 'Pending';
    cr.activeStep = 1;
    Object.assign(cr, initialApprovalState((cr.approvalCycle || 0) + 1));
    cr.submittedAt = new Date();
    await cr.save({ transaction: tx });

    await createApprovalSnapshot(cr, tx);

    await updateConfig(
      'dashboard_stats',
      (s) => ({
        pending: (s.pending || 0) + 1
      }),
      tx
    );

    await updateConfig(
      'worklist_metrics',
      (m) => ({
        ...m,
        pending: (m.pending || 0) + 1
      }),
      tx
    );

    await addAuditLog(
      {
        actorId,
        action: 'Submitted Draft CR',
        ref: id,
        detail: `Submitted draft Change Request ${id} ${cr.title} for Manager review.`
      },
      tx
    );
  });

  const updated = await ChangeRequest.findByPk(id, { include: CR_INCLUDE });
  if (updated && updated.managerEmail) {
    buildChangeRequestManagerInvitationEmail(updated).then((mailPayload) =>
      enqueueNotification({
        module: 'cr',
        requestId: updated.id,
        approvalCycle: updated.approvalCycle,
        jobType: 'manager_invitation',
        recipientEmail: updated.managerEmail,
        payload: mailPayload
      })
    ).catch((err) => console.error('[mail] Queue manager invite failed:', err.message));
  }
  return serializeChangeRequest(updated);
};

const resolveUserId = async (idOrName, fallback = null) => {
  if (!idOrName) return fallback;
  if (typeof idOrName === 'string' && (idOrName.startsWith('S8-') || idOrName.startsWith('EMP-'))) {
    return idOrName;
  }
  const identity = await IdentityResolver.resolveByEmail(idOrName);
  if (identity.status === 'SUCCESS') {
    return identity.identity.userKey;
  }
  return idOrName || fallback;
};

export const createChangeRequestService = async (payload = {}) => {
  const id = await nextChangeRequestId();
  const risk = payload.risk || 'Medium';
  const status = 'Pending';
  const requesterId = await resolveUserId(payload.requesterId || payload.requester);
  const requesterRes = requesterId ? await IdentityResolver.resolveByKey(requesterId) : null;
  const requesterUser = requesterRes?.status === 'SUCCESS' ? requesterRes.identity : null;
  const requesterEmail = requesterUser?.email || payload.customFieldValues?.employeeEmail || payload.employeeEmail || '';

  const actionValue = payload.customFieldValues?.actionRequired || payload.actionRequired || '';
  if (isRestrictedAction(actionValue, payload.subcategoryId)) {
    const isSuperAdmin = Boolean(
      requesterUser?.isSuperAdmin ||
      requesterUser?.roleId === 'role-1' ||
      requesterUser?.role === 'Super Admin' ||
      requesterUser?.role === 'ChangeDesk Super Admin'
    );
    const inTable = isSuperAdmin || (await checkUserInUserTable(requesterEmail, payload.employeeId || requesterUser?.employeeId));
    if (!inTable) {
      const err = new Error(`Action "${actionValue}" is restricted to accounts present in the user table or Super Admin.`);
      err.statusCode = 403;
      throw err;
    }
  }

  let workflowId = payload.workflowId;
  let categoryName = payload.category || 'Software Deployment';
  let subCategoryName = payload.subCategory || '';
  let targetCategoryId = payload.categoryId || null;

  if (payload.subcategoryId) {
    const subcat = await CatalogSubcategory.findByPk(payload.subcategoryId, {
      include: [
        { model: CatalogCategory, as: 'category' },
        { model: CatalogSubcategoryField, as: 'fields' }
      ]
    });
    if (subcat) {
      workflowId = subcat.workflowId || workflowId;
      categoryName = subcat.category?.name || categoryName;
      targetCategoryId = subcat.categoryId || subcat.category?.id || targetCategoryId;
      subCategoryName = subcat.name;

      const customValues = payload.customFieldValues || {};
      const actionVal = customValues.actionRequired || '';

      if (subcat.fields && Array.isArray(subcat.fields)) {
        for (const f of subcat.fields) {
          const applies = !f.appliesToActions || (Array.isArray(f.appliesToActions) && f.appliesToActions.includes(actionVal));
          if (f.isRequired && applies) {
            const val = customValues[f.fieldKey];
            if (val === undefined || val === null || String(val).trim() === '') {
              const err = new Error(`Field "${f.fieldLabel}" is required for action "${actionVal || 'selected action'}"`);
              err.statusCode = 400;
              throw err;
            }
          }
        }
      }
    }
  }

  if (!workflowId && categoryName) {
    const catHit = await CatalogCategory.findOne({
      where: {
        [Op.or]: [
          { name: categoryName },
          { id: categoryName },
          { name: { [Op.iLike]: categoryName } }
        ]
      },
      include: [{ model: CatalogSubcategory, as: 'subcategories' }]
    });
    if (catHit?.subcategories && catHit.subcategories.length > 0) {
      workflowId = catHit.subcategories[0].workflowId || workflowId;
    }
  }

  const mergedCustomFields = {
    ...(payload.customFieldValues || {}),
    employeeName: payload.customFieldValues?.employeeName || requesterUser?.displayName || payload.employeeName || '',
    employeeEmail: payload.customFieldValues?.employeeEmail || requesterEmail
  };

  let authoritativeLocation = '';
  let authoritativeEmpBusinessId = '';

  let empRecord = null;
  const empKey = payload.userKey || payload.requesterId || payload.currentUser?.userKey;

  if (typeof empKey === 'string' && empKey.startsWith('EMP-')) {
    const empNumericId = parseInt(empKey.replace('EMP-', ''), 10);
    if (!isNaN(empNumericId)) empRecord = await Employee.findByPk(empNumericId);
  } else if (payload.currentUser?.sourceId && payload.currentUser.identityType === 'EMPLOYEE') {
    empRecord = await Employee.findByPk(payload.currentUser.sourceId);
  }

  if (!empRecord && (payload.currentUser?.email || requesterEmail)) {
    const emailToLookup = (payload.currentUser?.email || requesterEmail).trim().toLowerCase();
    if (emailToLookup) {
      empRecord = await Employee.findOne({
        where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), emailToLookup)
      });
    }
  }

  if (empRecord) {
    if (empRecord.location && String(empRecord.location).trim()) {
      authoritativeLocation = String(empRecord.location).trim();
    }
    if (empRecord.empId && String(empRecord.empId).trim()) {
      authoritativeEmpBusinessId = String(empRecord.empId).trim();
    }
  }

  const empIdToStore = authoritativeEmpBusinessId || (
    payload.employeeId && !payload.employeeId.startsWith('S8-') && !payload.employeeId.startsWith('EMP-')
      ? payload.employeeId
      : ''
  );

  let validManagerName = null;
  let validManagerEmail = payload.managerEmail ? String(payload.managerEmail).trim() : '';

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

  const createdCR = await ChangeRequest.create({
    id,
    title: payload.title || 'Untitled change request',
    category: categoryName,
    subCategory: subCategoryName,
    subcategoryId: payload.subcategoryId || null,
    employeeId: empIdToStore,
    employeeName: mergedCustomFields.employeeName || null,
    employeeEmail: mergedCustomFields.employeeEmail || requesterEmail || null,
    managerName: validManagerName,
    managerEmail: validManagerEmail,
    location: authoritativeLocation || (payload.location && !payload.location.includes('Auto-fetched') && !payload.location.includes('Not specified') ? payload.location : null),
    justification: payload.justification || '',
    startDate: payload.startDate || null,
    endDate: payload.endDate || null,
    activeStep: 1,
    status,
    ...initialApprovalState(),
    submittedAt: new Date(),
    closedAt: null,
    requesterId,
    approverId: null,
    customFieldValues: mergedCustomFields
  });

  await createApprovalSnapshot(createdCR);
  await updateConfig('dashboard_stats', (s) => ({
    total: (s.total || 0) + 1,
    pending: (s.pending || 0) + 1
  }));
  await updateConfig('worklist_metrics', (m) => ({
    ...m,
    pending: (m.pending || 0) + 1
  }));

  await addAuditLog({
    actorId: requesterId,
    action: 'Created Change Request',
    ref: id,
    detail: `Submitted ${id} ${payload.title || 'Untitled change request'} for Manager review.`
  });

  const created = await ChangeRequest.findByPk(id, { include: CR_INCLUDE });
  const serialized = serializeChangeRequest(created);

  // Enqueue initial Stage 1 Manager Invitation
  if (validManagerEmail) {
    buildChangeRequestManagerInvitationEmail(created).then((mailPayload) =>
      enqueueNotification({
        module: 'cr',
        requestId: created.id,
        approvalCycle: created.approvalCycle,
        jobType: 'manager_invitation',
        recipientEmail: validManagerEmail,
        payload: mailPayload
      })
    ).catch((err) => console.error('[mail] Queue manager invite failed:', err.message));
  }

  return serialized;
};

export const getWorklistService = async (actingUserId = null, page = 1, limit = 10, status = null, dateFilter = null, searchQuery = null) => {
  return getFilteredChangeRequests({
    userId: null,
    isWorklist: true,
    actingUserId,
    status,
    dateFilter,
    searchQuery,
    page,
    limit
  });
};

export const applyWorklistActionService = async ({ id, action, rejectionReason = '', comment = '', actorId = null } = {}) => {
  const actionComment = comment || rejectionReason || '';
  const targetCR = await ChangeRequest.findByPk(id);
  if (!targetCR) {
    const err = new Error(`Change Request ${id} not found.`);
    err.statusCode = 404;
    throw err;
  }
  const identityRes = await IdentityResolver.resolveByKey(actorId);
  const actorName = identityRes.status === 'SUCCESS' ? identityRes.identity.displayName : 'Approver';
  const actorRoleName = identityRes.status === 'SUCCESS' ? identityRes.identity.role : 'Approver';
  const roleId = identityRes.status === 'SUCCESS' ? identityRes.identity.roleId : null;
  const identity = identityRes.status === 'SUCCESS' ? identityRes.identity : null;

  if (['approve', 'reject'].includes(action) && targetCR.status !== 'Pending') {
    const err = new Error(`Invalid lifecycle transition: Cannot ${action} a ${targetCR.status} request.`);
    err.statusCode = 400;
    throw err;
  }
  if (action === 'implement' && targetCR.status !== 'Approved') {
    const err = new Error('Invalid lifecycle transition: Only approved requests can be implemented.');
    err.statusCode = 400;
    throw err;
  }

  const actorIds = new Set([actorId].filter(Boolean));
  if (identity) {
    if (Array.isArray(identity.aliases)) {
      identity.aliases.forEach((alias) => actorIds.add(alias));
    }
    if (identity.userKey) actorIds.add(identity.userKey);
    if (identity.employeeBusinessId) actorIds.add(identity.employeeBusinessId);
    if (identity.sourceId) actorIds.add(String(identity.sourceId));
    if (identity.id) actorIds.add(String(identity.id));
  }

  const isSelf = actorIds.has(targetCR.requesterId) ||
    (identity?.employeeBusinessId && targetCR.employeeId && targetCR.employeeId === identity.employeeBusinessId) ||
    (identity?.email && targetCR.employeeEmail && targetCR.employeeEmail.toLowerCase() === identity.email.toLowerCase()) ||
    (identity?.email && targetCR.requesterEmail && targetCR.requesterEmail.toLowerCase() === identity.email.toLowerCase());

  if (isSelf) {
    const err = new Error(`Self-approval prohibited: You cannot ${action} your own Change Request (${id}).`);
    err.statusCode = 403;
    throw err;
  }
  const rolesList = identity?.rolesList || [roleId].filter(Boolean);
  const isAdminOrSuperAdmin = rolesList.includes('role-1') || rolesList.includes('role-2') || rolesList.includes('role-2-change') || identity?.isSuperAdmin || identity?.isChangeAdmin;
  const isChangeManager = rolesList.includes('role-3') || Boolean(identity?.isChangeManager) || (identity?.cmCategories && identity.cmCategories.length > 0);
  const isChangeImplementer = rolesList.includes('role-5') || Boolean(identity?.isChangeImplementer) || (identity?.ciCategories && identity.ciCategories.length > 0);
  const cmAssignedCategoryIds = identityRes.status === 'SUCCESS' ? (identityRes.identity.cmCategories || []) : [];

  if (action === 'implement') {
    let canImplement = isAdminOrSuperAdmin;
    if (!canImplement && isChangeImplementer) {
      let ciAssignedIds = identity?.ciCategories || [];
      if (!ciAssignedIds || ciAssignedIds.length === 0) {
        const assignments = await ChangeImplementerCategory.findAll({
          where: {
            [Op.or]: [
              { userId: actorId },
              ...(identity?.userKey ? [{ userId: identity.userKey }] : []),
              ...(identity?.employeeBusinessId ? [{ userId: identity.employeeBusinessId }] : []),
              ...(identity?.sourceId ? [{ userId: `EMP-${identity.sourceId}` }, { userId: `S8-${identity.sourceId}` }, { userId: String(identity.sourceId) }] : [])
            ]
          }
        });
        ciAssignedIds = assignments.map(a => a.categoryId);
      }

      const assignedCategories = await CatalogCategory.findAll({
        where: { id: { [Op.in]: ciAssignedIds } }
      });
      const categoryNames = assignedCategories.map(c => c.name.toLowerCase().trim());
      const crCategory = (targetCR.category || '').toLowerCase().trim();
      const crCategoryId = targetCR.categoryId || '';

      canImplement = ciAssignedIds.includes(crCategoryId) || categoryNames.some(cn => crCategory.includes(cn) || cn.includes(crCategory));
    }

    if (!canImplement) {
      const err = new Error('Unauthorized: Only Admins, Super Admins, or assigned Change Implementers can mark a Change Request as Implemented.');
      err.statusCode = 403;
      throw err;
    }

    await sequelize.transaction(async (tx) => {
      const cr = await ChangeRequest.findByPk(id, { transaction: tx, lock: tx.LOCK?.UPDATE });
      if (!cr) {
        const err = new Error(`Change Request ${id} not found.`);
        err.statusCode = 404;
        throw err;
      }
      if (cr.status !== 'Approved') {
        const err = new Error(`Cannot implement request: Current status is ${cr.status}, must be Approved.`);
        err.statusCode = 400;
        throw err;
      }

      cr.status = 'Implemented';
      cr.closedAt = new Date();
      const existingComments = Array.isArray(cr.comments) ? [...cr.comments] : [];
      if (actionComment) {
        existingComments.push({
          id: `cmt-${Date.now()}`,
          authorName: actorName,
          authorRole: actorRoleName,
          text: actionComment,
          action: 'Implemented',
          createdAt: new Date().toISOString()
        });
        cr.comments = existingComments;
        const currentCustom = cr.customFieldValues && typeof cr.customFieldValues === 'object' ? { ...cr.customFieldValues } : {};
        currentCustom.comments = existingComments;
        currentCustom.implementedComment = actionComment;
        currentCustom.implementedBy = actorName;
        currentCustom.implementedByEmail = identity?.email || null;
        cr.customFieldValues = currentCustom;
        if (typeof cr.changed === 'function') cr.changed('customFieldValues', true);
      }
      await cr.save({ transaction: tx });
      await updateConfig('cr_approval_comments', (map) => ({
        ...map,
        [id]: {
          ...(map[id] || {}),
          implementedComment: actionComment,
          implementedBy: actorName,
          implementedByEmail: identity?.email || null
        }
      }), tx);
      await addAuditLog({ actorId, action: 'CR Implemented', ref: id, detail: `Marked Change Request ${id} as Implemented. Comment: ${actionComment || 'None'}` }, tx);
    });

    ChangeRequest.findByPk(id, { include: CR_INCLUDE })
      .then((updatedCR) => {
        if (updatedCR) {
          const serialized = serializeChangeRequest(updatedCR);
          sendChangeRequestImplementedEmail({
            cr: serialized,
            requesterName: serialized.employeeName || serialized.requester,
            requesterEmail: serialized.employeeEmail || serialized.requesterEmail,
            implementerName: actorName,
            implementerEmail: identity?.email,
            implementedComment: actionComment,
            managerEmail: serialized.managerEmail
          }).catch((err) => console.error('[mail] implement notification failed:', err.message));
        }
      })
      .catch((err) => console.error('[mail] fetch updated CR for implement notification failed:', err.message));

    const metrics = await getConfig('worklist_metrics');
    return { id, action: 'implement', status: 'Implemented', closedAt: new Date(), implementedComment: actionComment, worklistMetrics: metrics };
  }

  // Mandatory comment enforcement server-side
  if (!actionComment || !actionComment.trim()) {
    const err = new Error(`A non-empty comment is required to ${action} this Change Request.`);
    err.statusCode = 400;
    throw err;
  }

  const isStage1 = isManagerReviewStage(targetCR.approvalStage);
  const isStage2 = isStage2ReviewStage(targetCR.approvalStage, targetCR.status, 'Pending');

  if (isStage1) {
    // Stage 1: Manager Review
    // Actor must be the assigned manager or resolved via email token
    const managerEmailLower = (targetCR.managerEmail || '').toLowerCase().trim();
    const actorEmailLower = (identity?.email || '').toLowerCase().trim();
    const isAssignedManager = Boolean(managerEmailLower && actorEmailLower && managerEmailLower === actorEmailLower);

    if (!isAssignedManager && !isAdminOrSuperAdmin) {
      const err = new Error('Unauthorized: This request is awaiting approval from the assigned reporting manager.');
      err.statusCode = 403;
      throw err;
    }

    if (action === 'reject') {
      await sequelize.transaction(async (tx) => {
        const cr = await ChangeRequest.findByPk(id, { transaction: tx, lock: tx.LOCK?.UPDATE });
        if (cr.status !== 'Pending') {
          const err = new Error(`This change request has already been decided (current status: ${cr.status}).`);
          err.statusCode = 409;
          throw err;
        }
        cr.status = 'Rejected';
        cr.approvalStage = APPROVAL_STAGE.REJECTED;
        cr.closedAt = new Date();
        cr.rejectionReason = actionComment;
        const existingComments = Array.isArray(cr.comments) ? [...cr.comments] : [];
        existingComments.push({
          id: `cmt-${Date.now()}`,
          authorName: actorName,
          authorRole: 'Reporting Manager',
          text: actionComment,
          action: 'Rejected by Manager',
          createdAt: new Date().toISOString()
        });
        cr.comments = existingComments;
        const currentCustom = cr.customFieldValues && typeof cr.customFieldValues === 'object' ? { ...cr.customFieldValues } : {};
        currentCustom.comments = existingComments;
        currentCustom.rejectedComment = actionComment;
        currentCustom.rejectedBy = actorName;
        currentCustom.rejectionReason = actionComment;
        cr.customFieldValues = currentCustom;
        if (typeof cr.changed === 'function') cr.changed('customFieldValues', true);
        await cr.save({ transaction: tx });

        await addAuditLog({
          actorId,
          action: 'CR Rejected by Manager',
          ref: id,
          detail: `Manager ${actorName} (${identity?.email}) rejected Change Request ${id}. Reason: ${actionComment}`
        }, tx);
      });

      // Notify requester with "Rejected by Manager" subject
      sendManagerRejectionEmail({
        module: 'cr',
        requestCode: id,
        title: targetCR.title,
        requesterEmail: targetCR.employeeEmail || targetCR.requesterEmail,
        requesterName: targetCR.employeeName || targetCR.requester,
        managerName: actorName,
        managerEmail: identity?.email,
        comment: actionComment
      }).catch((err) => console.error('[mail] manager rejection notify failed:', err.message));

      return { id, action: 'reject', status: 'Rejected', rejectionReason: actionComment, comment: actionComment };
    }

    if (action === 'approve') {
      await sequelize.transaction(async (tx) => {
        const cr = await ChangeRequest.findByPk(id, { transaction: tx, lock: tx.LOCK?.UPDATE });
        if (cr.status !== 'Pending' || !isManagerReviewStage(cr.approvalStage)) {
          const err = new Error(`This change request has already been decided (current status: ${cr.status}).`);
          err.statusCode = 409;
          throw err;
        }
        cr.status = 'Pending';
        cr.approvalStage = APPROVAL_STAGE.STAGE_2_REVIEW;
        const existingComments = Array.isArray(cr.comments) ? [...cr.comments] : [];
        existingComments.push({
          id: `cmt-${Date.now()}`,
          authorName: actorName,
          authorRole: 'Reporting Manager',
          text: actionComment,
          action: 'Manager Approved',
          createdAt: new Date().toISOString()
        });
        cr.comments = existingComments;
        const currentCustom = cr.customFieldValues && typeof cr.customFieldValues === 'object' ? { ...cr.customFieldValues } : {};
        currentCustom.comments = existingComments;
        currentCustom.managerApprovedComment = actionComment;
        currentCustom.managerApprovedBy = actorName;
        currentCustom.managerApprovedAt = new Date().toISOString();
        cr.customFieldValues = currentCustom;
        if (typeof cr.changed === 'function') cr.changed('customFieldValues', true);
        await cr.save({ transaction: tx });

        await addAuditLog({
          actorId,
          action: 'CR Manager Approved',
          ref: id,
          detail: `Manager ${actorName} (${identity?.email}) approved Change Request ${id}. Comment: ${actionComment}`
        }, tx);
      });

      // Advance to Stage 2: Notify Change Managers / Admins
      const categoryTarget = targetCR.categoryId || targetCR.category;
      getApproverEmails(categoryTarget).then(async (approverEmails) => {
        const updatedCR = await ChangeRequest.findByPk(id, { include: CR_INCLUDE });
        const serialized = serializeChangeRequest(updatedCR);
        await sendChangeRequestCreatedEmail({
          cr: serialized,
          requesterName: serialized.employeeName || serialized.requester,
          approverEmails
        });
      }).catch((err) => console.error('[mail] Stage 2 invite notification failed:', err.message));

      return { id, action: 'approve', status: 'Pending', approvalStage: APPROVAL_STAGE.STAGE_2_REVIEW, comment: actionComment };
    }
  }

  // Stage 2: Change Manager / Admin Review
  if (!isAdminOrSuperAdmin && !isChangeManager) {
    const err = new Error('Unauthorized: Only authorized Change Desk Admins or Change Managers can decide Stage 2.');
    err.statusCode = 403;
    throw err;
  }

  if (isChangeManager && !isAdminOrSuperAdmin) {
    let cmAssignedIds = cmAssignedCategoryIds;
    if (!cmAssignedIds || cmAssignedIds.length === 0) {
      const assignments = await ChangeManagerCategory.findAll({
        where: {
          [Op.or]: [
            { userId: actorId },
            ...(identity?.userKey ? [{ userId: identity.userKey }] : []),
            ...(identity?.employeeBusinessId ? [{ userId: identity.employeeBusinessId }] : []),
            ...(identity?.sourceId ? [{ userId: `EMP-${identity.sourceId}` }, { userId: `S8-${identity.sourceId}` }, { userId: String(identity.sourceId) }] : [])
          ]
        }
      });
      cmAssignedIds = assignments.map(a => a.categoryId);
    }

    const assignedCategories = await CatalogCategory.findAll({
      where: { id: { [Op.in]: cmAssignedIds } }
    });
    const categoryNames = assignedCategories.map(c => c.name.toLowerCase().trim());
    const crCategory = (targetCR.category || '').toLowerCase().trim();
    const crCategoryId = targetCR.categoryId || '';

    const isAssigned = cmAssignedIds.includes(crCategoryId) || categoryNames.some(cn => crCategory.includes(cn) || cn.includes(crCategory));

    if (!isAssigned) {
      const err = new Error('Unauthorized: Change Managers can only perform actions on tickets in their assigned categories.');
      err.statusCode = 403;
      throw err;
    }
  }

  if (action === 'sendback') {
    await sequelize.transaction(async (tx) => {
      const cr = await ChangeRequest.findByPk(id, { transaction: tx });
      if (cr) {
        cr.status = 'Draft';
        cr.approvalStage = APPROVAL_STAGE.DRAFT;
        await cr.save({ transaction: tx });
        await ChangeRequestApproval.destroy({ where: { changeRequestId: id }, transaction: tx });
        await addAuditLog({ actorId, action: 'CR Sent Back', ref: id, detail: `Sent back ${id} to draft.` }, tx);
      }
    });
    const metrics = await getConfig('worklist_metrics');
    return { id, action, status: 'Draft', worklistMetrics: metrics };
  }

  const decision = action === 'approve' ? 'Approved' : 'Rejected';
  const finalStatus = decision;

  await sequelize.transaction(async (t) => {
    const [updatedCount] = await ChangeRequestApproval.update(
      { decision, rationale: actionComment, decidedAt: new Date() },
      { where: { changeRequestId: id, approverId: actorId, decision: 'Pending' }, transaction: t }
    );

    if (updatedCount === 0) {
      const existing = await ChangeRequestApproval.findOne({
        where: { changeRequestId: id, approverId: actorId },
        transaction: t
      });
      if (!existing) {
        await ChangeRequestApproval.create(
          { changeRequestId: id, approverId: actorId, decision, rationale: actionComment, decidedAt: new Date() },
          { transaction: t }
        );
      } else {
        await existing.update({ decision, rationale: actionComment, decidedAt: new Date() }, { transaction: t });
      }
    }

    await ChangeRequestApproval.update(
      { rationale: 'Resolved by peer approver' },
      { where: { changeRequestId: id, decision: 'Pending', approverId: { [Op.ne]: actorId } }, transaction: t }
    );

    const changeRequest = await ChangeRequest.findByPk(id, { transaction: t, lock: t.LOCK?.UPDATE });
    if (changeRequest && changeRequest.status !== 'Pending') {
      const err = new Error(`This change request has already been decided (current status: ${changeRequest.status}).`);
      err.statusCode = 409;
      throw err;
    }
    if (changeRequest) {
      changeRequest.status = finalStatus;
      changeRequest.approvalStage = finalStatus === 'Approved' ? APPROVAL_STAGE.COMPLETED : APPROVAL_STAGE.REJECTED;
      if (finalStatus === 'Rejected') {
        changeRequest.closedAt = new Date();
        changeRequest.rejectionReason = actionComment || 'This change request was rejected during Change Manager review.';
      }
      const existingComments = Array.isArray(changeRequest.comments) ? [...changeRequest.comments] : [];
      if (actionComment) {
        existingComments.push({
          id: `cmt-${Date.now()}`,
          authorName: actorName,
          authorRole: actorRoleName,
          text: actionComment,
          action: finalStatus,
          createdAt: new Date().toISOString()
        });
        changeRequest.comments = existingComments;
        const currentCustom = changeRequest.customFieldValues && typeof changeRequest.customFieldValues === 'object'
          ? { ...changeRequest.customFieldValues }
          : {};
        currentCustom.comments = existingComments;
        if (finalStatus === 'Approved') {
          currentCustom.approvedComment = actionComment;
          currentCustom.approvedBy = actorName;
        } else if (finalStatus === 'Rejected') {
          currentCustom.rejectionReason = actionComment;
          currentCustom.rejectedComment = actionComment;
          currentCustom.rejectedBy = actorName;
        }
        changeRequest.customFieldValues = currentCustom;
        if (typeof changeRequest.changed === 'function') changeRequest.changed('customFieldValues', true);
      }
      await changeRequest.save({ transaction: t });

      await updateConfig('cr_approval_comments', (map) => ({
        ...map,
        [id]: {
          ...(map[id] || {}),
          ...(decision === 'Approved' ? { approvedComment: actionComment, approvedBy: actorName, approvedDate: new Date().toISOString() } : {}),
          ...(decision === 'Rejected' ? { rejectedComment: actionComment, rejectionReason: actionComment, rejectedBy: actorName, rejectedDate: new Date().toISOString() } : {})
        }
      }), t);
    }

    await addAuditLog(
      {
        action: `CR ${decision}`,
        ref: changeRequest ? changeRequest.id : id,
        detail: `${decision} by first responder approver (${actorId}). Comment: ${actionComment || 'None'}`,
        actorId
      },
      t
    );

    await updateConfig(
      'worklist_metrics',
      (m) => ({ [decision === 'Approved' ? 'approved' : 'rejected']: (m[decision === 'Approved' ? 'approved' : 'rejected'] || 0) + 1 }),
      t
    );
  });

  ChangeRequest.findByPk(id, { include: CR_INCLUDE })
    .then(async (updatedCR) => {
      if (!updatedCR) return;
      const serialized = serializeChangeRequest(updatedCR);

      if (decision === 'Approved') {
        const categoryTarget = serialized.categoryId || serialized.category;
        const implementerEmails = await getImplementerEmails(categoryTarget);

        await sendChangeRequestApprovedEmail({
          cr: serialized,
          requesterName: serialized.employeeName || serialized.requester,
          requesterEmail: serialized.employeeEmail || serialized.requesterEmail,
          approverName: actorName,
          approverEmail: identity?.email,
          approvalComment: actionComment,
          implementerEmails,
          managerEmail: serialized.managerEmail
        });
      } else if (decision === 'Rejected') {
        await sendChangeRequestRejectedEmail({
          cr: serialized,
          requesterName: serialized.employeeName || serialized.requester,
          requesterEmail: serialized.employeeEmail || serialized.requesterEmail,
          decidedBy: actorName,
          decidedByEmail: identity?.email,
          rejectionReason: actionComment,
          managerEmail: serialized.managerEmail
        });
      }
    })
    .catch((err) => console.error('[mail] decision notification failed:', err.message));

  const pending = await ChangeRequest.count({ where: { status: 'Pending' } });
  const metrics = await getConfig('worklist_metrics');
  return {
    id,
    action,
    status: finalStatus,
    approvedComment: decision === 'Approved' ? actionComment : undefined,
    rejectedComment: decision === 'Rejected' ? actionComment : undefined,
    rejectionReason: decision === 'Rejected' ? actionComment : undefined,
    comment: actionComment,
    decidedBy: actorName,
    worklistMetrics: { ...metrics, pending }
  };
};

export const addChangeRequestCommentService = async ({ id, commentText, actorId = null } = {}) => {
  if (!commentText || !commentText.trim()) {
    const err = new Error('Comment text cannot be empty.');
    err.statusCode = 400;
    throw err;
  }
  const identityRes = await IdentityResolver.resolveByKey(actorId);
  const actorName = identityRes.status === 'SUCCESS' ? identityRes.identity.displayName : 'User';
  const actorRoleName = identityRes.status === 'SUCCESS' ? identityRes.identity.role : 'User';
  const roleId = identityRes.status === 'SUCCESS' ? identityRes.identity.roleId : null;
  const isAdminOrSuperAdmin = roleId === 'role-1' || roleId === 'role-2' || roleId === 'role-2-change';
  if (!isAdminOrSuperAdmin) {
    const err = new Error('Unauthorized: Only Admins and Super Admins can post comments.');
    err.statusCode = 403;
    throw err;
  }

  const cr = await ChangeRequest.findByPk(id, { include: CR_INCLUDE });
  if (!cr) {
    const err = new Error(`Change Request ${id} not found.`);
    err.statusCode = 404;
    throw err;
  }

  const currentCustom = cr.customFieldValues && typeof cr.customFieldValues === 'object' ? { ...cr.customFieldValues } : {};
  const existingComments = Array.isArray(currentCustom.comments) ? [...currentCustom.comments] : [];

  const newComment = {
    id: `cmt-${Date.now()}`,
    authorId: actorId,
    authorName: actorName,
    authorRole: actorRoleName,
    text: commentText.trim(),
    createdAt: new Date().toISOString()
  };

  existingComments.push(newComment);
  currentCustom.comments = existingComments;

  cr.customFieldValues = currentCustom;
  cr.changed('customFieldValues', true);
  await cr.save();

  await addAuditLog({
    actorId,
    action: 'Comment Added',
    ref: id,
    detail: `Added comment to CR ${id}: "${commentText.trim().substring(0, 50)}..."`
  });

  return serializeChangeRequest(cr);
};
