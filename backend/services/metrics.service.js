import { Op, fn, col } from 'sequelize';
import { ChangeRequest } from '../models/index.js';
import { buildDateFilterClause } from '../utils/dateFilterUtils.js';
import { IdentityResolver } from './identityResolver.service.js';

export { buildDateFilterClause };

// Personal dashboard scope is anchored to the employee directory (employeeId),
// same as "My Requests" -- resolve the acting login identity's employeeBusinessId
// rather than filtering by a login-identity key directly.
const getDashboardScopeWhere = async (userId) => {
  if (!userId) return {};
  const identityRes = await IdentityResolver.resolveByKey(userId);
  const employeeId = identityRes.status === 'SUCCESS' ? identityRes.identity?.employeeBusinessId : null;
  return { employeeId: employeeId || '__no_match__' };
};

export const getMetricsService = async (userId = null, { dateFilter = null, startDate = null, endDate = null, status = null, searchQuery = null } = {}) => {
  try {
    const userWhere = await getDashboardScopeWhere(userId);
    const dateClause = buildDateFilterClause(dateFilter, startDate, endDate);
    const andClauses = [
      {
        status: { [Op.notIn]: ['Draft', 'draft', 'Deleted', 'deleted', 'Cancelled', 'cancelled'] }
      }
    ];
    if (userWhere && Object.keys(userWhere).length > 0) andClauses.push(userWhere);
    if (dateClause) andClauses.push(dateClause);

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

    const activeWhere = { [Op.and]: andClauses };

    const grouped = await ChangeRequest.findAll({
      where: activeWhere,
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true
    });
    const counts = grouped.reduce((map, row) => {
      map[String(row.status || '').toLowerCase()] = Number(row.count) || 0;
      return map;
    }, {});
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const pending = (counts.pending || 0) + (counts.open || 0) + (counts.submitted || 0);
    const approved = counts.approved || 0;
    const implemented = (counts.implemented || 0) + (counts['in progress'] || 0) + (counts.scheduled || 0);
    const rejected = counts.rejected || 0;

    const statusNormalized = String(status || '').toLowerCase().trim();
    const approvedMetric = (statusNormalized && !['all', 'approved'].includes(statusNormalized))
      ? 0
      : approved;

    return [
      { title: 'Total Change Requests', value: total, count: total, change: 'Total Requests', iconBg: '#EBF5FF', iconColor: '#2563EB', isTotal: true },
      { title: 'Pending Approvals', value: pending, count: pending, change: 'Awaiting review', iconBg: '#FEF3C7', iconColor: '#D97706', isPending: true },
      { id: 'approved', title: 'Approved', value: approvedMetric, count: approvedMetric, change: 'Approved', iconBg: '#ECFDF5', iconColor: '#059669', isApproved: true },
      { title: 'Implemented', value: implemented, count: implemented, change: 'Implemented', iconBg: '#F3E8FF', iconColor: '#7C3AED', isImplemented: true, isInProgress: true },
      { title: 'Rejected', value: rejected, count: rejected, change: 'Rejected', iconBg: '#FEE2E2', iconColor: '#DC2626', isRejected: true }
    ];
  } catch (err) {
    console.warn('[metricsService] getMetricsService DB warning:', err.message);
    return [
      { title: 'Total Change Requests', value: 0, count: 0, change: 'Total Requests', iconBg: '#EBF5FF', iconColor: '#2563EB', isTotal: true },
      { title: 'Pending Approvals', value: 0, count: 0, change: 'Awaiting review', iconBg: '#FEF3C7', iconColor: '#D97706', isPending: true },
      { id: 'approved', title: 'Approved', value: 0, count: 0, change: 'Approved', iconBg: '#ECFDF5', iconColor: '#059669', isApproved: true },
      { title: 'Implemented', value: 0, count: 0, change: 'Implemented', iconBg: '#F3E8FF', iconColor: '#7C3AED', isImplemented: true, isInProgress: true },
      { title: 'Rejected', value: 0, count: 0, change: 'Rejected', iconBg: '#FEE2E2', iconColor: '#DC2626', isRejected: true }
    ];
  }
};

export const getCategoryMetricsService = async (userId = null, { dateFilter = null, startDate = null, endDate = null } = {}) => {
  const userWhere = await getDashboardScopeWhere(userId);
  const dateClause = buildDateFilterClause(dateFilter, startDate, endDate);
  const palette = ['#D97706', '#475569', '#7C3AED', '#0D9488', '#DC2626', '#2563EB'];

  const CANONICAL_CATEGORIES = [
    { id: 'cat-asset', name: 'IT Asset', color: '#D97706' },
    { id: 'cat-o365', name: 'Office 365 & Collaboration', color: '#475569' },
    { id: 'cat-acc', name: 'Access & Security', color: '#7C3AED' },
    { id: 'cat-net', name: 'Network & Connectivity', color: '#0D9488' },
    { id: 'cat-sec', name: 'Security Tools & Policies', color: '#DC2626' },
    { id: 'cat-srv', name: 'Server & Infra', color: '#2563EB' }
  ];

  const andClauses = [
    {
      status: { [Op.notIn]: ['Draft', 'draft', 'Deleted', 'deleted', 'Cancelled', 'cancelled'] }
    }
  ];
  if (userWhere && Object.keys(userWhere).length > 0) andClauses.push(userWhere);
  if (dateClause) andClauses.push(dateClause);

  const activeWhere = { [Op.and]: andClauses };

  const grouped = await ChangeRequest.findAll({
    where: activeWhere,
    attributes: ['category', [fn('COUNT', col('id')), 'count']],
    group: ['category'],
    raw: true
  });
  const categoryCounts = new Map(grouped.map((row) => [String(row.category || '').toLowerCase(), Number(row.count) || 0]));
  const results = CANONICAL_CATEGORIES.map((cat, index) => ({
    categoryId: cat.id,
    category: cat.name,
    label: cat.name,
    name: cat.name,
    count: (categoryCounts.get(cat.name.toLowerCase()) || 0) + (categoryCounts.get(cat.id.toLowerCase()) || 0),
    color: cat.color || palette[index % palette.length],
    percentage: 0
  }));
  const totalCount = results.reduce((sum, item) => sum + item.count, 0);

  for (const item of results) {
    item.percentage = (item.count > 0 && totalCount > 0)
      ? Math.round((item.count / totalCount) * 100)
      : 0;
  }

  return results;
};

export const getStatusBreakdownService = async (userId = null, { dateFilter = null, startDate = null, endDate = null } = {}) => {
  const userWhere = await getDashboardScopeWhere(userId);
  const dateClause = buildDateFilterClause(dateFilter, startDate, endDate);
  const statuses = [
    { status: 'Pending', label: 'Pending Approvals', color: '#D97706' },
    { status: 'Approved', label: 'Approved', color: '#059669' },
    { status: 'Implemented', label: 'Implemented', color: '#7C3AED' },
    { status: 'Rejected', label: 'Rejected', color: '#DC2626' }
  ];

  const andClauses = [];
  if (userWhere && Object.keys(userWhere).length > 0) andClauses.push(userWhere);
  if (dateClause) andClauses.push(dateClause);
  const activeWhere = andClauses.length > 0 ? { [Op.and]: andClauses } : {};

  const grouped = await ChangeRequest.findAll({
    where: activeWhere,
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    group: ['status'],
    raw: true
  });
  const countFor = (names) => grouped.reduce((sum, row) => (
    names.includes(String(row.status || '').toLowerCase()) ? sum + (Number(row.count) || 0) : sum
  ), 0);
  return statuses.map((s) => ({
    status: s.status,
    label: s.label || s.status,
    count: countFor(s.status === 'Pending' ? ['pending', 'submitted'] : s.status === 'Approved' ? ['approved'] : s.status === 'Implemented' ? ['implemented', 'in progress', 'scheduled'] : [s.status.toLowerCase()]),
    color: s.color
  }));
};
