import { Op } from 'sequelize';
import {
  ChangeRequest,
  ChangeRequestApproval,
  AuditLog,
  CatalogCategory,
  CatalogSubcategory,
  Employee
} from '../models/index.js';
import { IdentityResolver } from './identityResolver.service.js';

/**
 * Shared category & date filtering function for ChangeRequests.
 * Do NOT duplicate category matching logic in individual report builders.
 */
export const getChangeRequestsByCategoryFilter = async ({
  fromDate = null,
  toDate = null,
  categoryId = null,
  subcategoryId = null
}) => {
  const where = {};

  // Date range filter on submittedAt (or createdAt as fallback)
  if (fromDate || toDate) {
    const dateClause = {};
    if (fromDate) dateClause[Op.gte] = new Date(fromDate);
    if (toDate) dateClause[Op.lte] = new Date(toDate);
    where.submittedAt = dateClause;
  }

  // Parse cat:<id> / sub:<id> prefixes if passed directly in categoryId
  let targetCatId = categoryId;
  let targetSubcatId = subcategoryId;

  if (typeof targetCatId === 'string' && targetCatId.startsWith('cat:')) {
    targetCatId = targetCatId.replace('cat:', '');
  } else if (typeof targetCatId === 'string' && targetCatId.startsWith('sub:')) {
    targetSubcatId = targetCatId.replace('sub:', '');
    targetCatId = null;
  }

  if (targetSubcatId) {
    const subcatObj = await CatalogSubcategory.findByPk(targetSubcatId);
    const subcatName = subcatObj ? subcatObj.name : targetSubcatId;

    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { subcategoryId: targetSubcatId },
        {
          subcategoryId: { [Op.eq]: null },
          subCategory: { [Op.iLike]: subcatName }
        }
      ]
    });
  } else if (targetCatId && targetCatId.toLowerCase() !== 'all') {
    const catObj = await CatalogCategory.findByPk(targetCatId);
    const catName = catObj ? catObj.name : targetCatId;

    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        { category: { [Op.iLike]: `%${catName}%` } }
      ]
    });
  }

  return await ChangeRequest.findAll({
    where,
    include: [
      { model: ChangeRequestApproval, as: 'approvals' }
    ],
    order: [['submittedAt', 'DESC']]
  });
};

/**
 * 1. Success Rate Summary:
 * Count Approved vs Rejected tickets in range (exclude Pending/Draft).
 * Return { approved, rejected, successRate }
 */
export const getSuccessRateSummary = async (fromDate, toDate, categoryId, subcategoryId) => {
  const tickets = await getChangeRequestsByCategoryFilter({ fromDate, toDate, categoryId, subcategoryId });
  const resolved = tickets.filter(t => ['Approved', 'Rejected'].includes(t.status));
  const approved = resolved.filter(t => t.status === 'Approved').length;
  const rejected = resolved.filter(t => t.status === 'Rejected').length;
  const total = approved + rejected;
  const successRate = total > 0 ? (approved / total) * 100 : 0;

  return {
    approved,
    rejected,
    total,
    successRate: parseFloat(successRate.toFixed(1)),
    successRateRatio: total > 0 ? approved / total : 0
  };
};

/**
 * 2. Category Volume:
 * Count tickets grouped by category (or by subcategory, if a specific category was selected).
 */
export const getCategoryVolume = async (fromDate, toDate, categoryId, subcategoryId) => {
  const tickets = await getChangeRequestsByCategoryFilter({ fromDate, toDate, categoryId, subcategoryId });
  const counts = {};

  const isSpecificCategorySelected = Boolean(categoryId || subcategoryId);

  tickets.forEach(t => {
    const key = isSpecificCategorySelected
      ? (t.subCategory || 'General Subcategory')
      : (t.category || 'General Category');
    counts[key] = (counts[key] || 0) + 1;
  });

  const breakdown = Object.entries(counts).map(([name, count]) => ({
    name,
    count,
    percentage: tickets.length > 0 ? Math.round((count / tickets.length) * 100) : 0
  }));

  return {
    totalTickets: tickets.length,
    groupedBy: isSpecificCategorySelected ? 'subcategory' : 'category',
    breakdown
  };
};

/**
 * 3. Approval Turnaround Time:
 * For each resolved ticket (status Approved or Rejected) in range:
 * turnaround = MAX(change_request_approvals.decidedAt) - change_requests.submittedAt
 * Return average turnaround (in days) plus count of tickets included.
 */
export const getApprovalTurnaroundTime = async (fromDate, toDate, categoryId, subcategoryId) => {
  const tickets = await getChangeRequestsByCategoryFilter({ fromDate, toDate, categoryId, subcategoryId });
  const resolved = tickets.filter(t => ['Approved', 'Rejected'].includes(t.status));

  let totalTurnaroundMs = 0;
  let validCount = 0;

  resolved.forEach(t => {
    const submittedTime = t.submittedAt ? new Date(t.submittedAt).getTime() : new Date(t.createdAt).getTime();
    let maxDecidedTime = null;

    if (t.approvals && t.approvals.length > 0) {
      t.approvals.forEach(app => {
        if (app.decidedAt) {
          const dTime = new Date(app.decidedAt).getTime();
          if (!maxDecidedTime || dTime > maxDecidedTime) maxDecidedTime = dTime;
        }
      });
    }

    if (!maxDecidedTime && t.closedAt) {
      maxDecidedTime = new Date(t.closedAt).getTime();
    } else if (!maxDecidedTime && t.updatedAt) {
      maxDecidedTime = new Date(t.updatedAt).getTime();
    }

    if (maxDecidedTime && maxDecidedTime >= submittedTime) {
      totalTurnaroundMs += (maxDecidedTime - submittedTime);
      validCount++;
    }
  });

  const avgTurnaroundMs = validCount > 0 ? totalTurnaroundMs / validCount : 0;
  const avgTurnaroundDays = parseFloat((avgTurnaroundMs / 86400000).toFixed(2));
  const avgTurnaroundHours = parseFloat((avgTurnaroundMs / 3600000).toFixed(1));

  return {
    ticketCount: validCount,
    avgTurnaroundDays,
    avgTurnaroundHours,
    totalResolvedCount: resolved.length
  };
};

/**
 * 4. Emergency Change Log:
 * IGNORE categoryId/subcategoryId params entirely.
 * Filter to tickets where category = 'Emergency Change' (or matching Emergency Change category/workflow).
 * Return full ticket list with title, requester, status, submittedAt, closedAt.
 */
export const getEmergencyChangeLog = async (fromDate, toDate) => {
  const where = {
    [Op.or]: [
      { category: { [Op.iLike]: '%Emergency%' } },
      { subCategory: { [Op.iLike]: '%Emergency%' } }
    ]
  };

  if (fromDate || toDate) {
    const dateClause = {};
    if (fromDate) dateClause[Op.gte] = new Date(fromDate);
    if (toDate) dateClause[Op.lte] = new Date(toDate);
    where.submittedAt = dateClause;
  }

  const tickets = await ChangeRequest.findAll({
    where,
    include: [{ model: Employee, as: 'employeeRecord' }],
    order: [['submittedAt', 'DESC']]
  });

  const log = tickets.map(t => ({
    id: t.id,
    title: t.title,
    requesterName: t.employeeRecord?.name || null,
    requesterEmail: t.employeeRecord?.email || null,
    status: t.status,
    submittedAt: t.submittedAt,
    closedAt: t.closedAt
  }));

  return {
    totalEmergencyCount: log.length,
    tickets: log
  };
};

/**
 * 5. Audit Trail Export:
 * IGNORE categoryId/subcategoryId entirely.
 * Return audit_logs rows within date range, with actor name, action, ref, detail, timestamp.
 */
export const getAuditTrailExport = async (fromDate, toDate) => {
  const where = {};
  if (fromDate || toDate) {
    const dateClause = {};
    if (fromDate) dateClause[Op.gte] = new Date(fromDate);
    if (toDate) dateClause[Op.lte] = new Date(toDate);
    where.createdAt = dateClause;
  }

  const rows = await AuditLog.findAll({
    where,
    order: [['id', 'DESC']]
  });

  const actorKeys = [...new Set(rows.map(r => r.actorId).filter(Boolean))];
  const identityMap = new Map();
  await Promise.all(
    actorKeys.map(async (k) => {
      const res = await IdentityResolver.resolveByKey(k);
      if (res.status === 'SUCCESS' && res.identity) {
        identityMap.set(k, res.identity);
      }
    })
  );

  const logs = rows.map(r => {
    const actor = identityMap.get(r.actorId);
    return {
      id: r.id,
      actorName: actor?.displayName || actor?.name || null,
      actorEmail: actor?.email || null,
      action: r.action,
      ref: r.ref || '—',
      detail: r.detail,
      timestamp: r.timestamp || String(r.createdAt)
    };
  });

  return {
    totalLogs: logs.length,
    logs
  };
};
