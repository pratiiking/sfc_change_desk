// Model registry – tables + their relationships.
import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// ---------- Roles -------------------------------------------
export const Role = sequelize.define(
  'Role',
  {
    id: { type: DataTypes.UUID, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    authority: { type: DataTypes.JSONB, defaultValue: [] },
    rank: { type: DataTypes.INTEGER, allowNull: false }
  },
  { tableName: 'hot_desk_roles', timestamps: false }
);

// ---------- Change requests -----------------------------
export const ChangeRequest = sequelize.define(
  'ChangeRequest',
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    subCategory: { type: DataTypes.STRING, defaultValue: '' },
    // employeeId is the authorization anchor for ownership (My Requests, draft
    // edit/submit, self-approval block) as well as the FK to employees for
    // display -- there is deliberately no separate requesterId/login-identity
    // column; every requester is necessarily a real employee.
    employeeId: { type: DataTypes.STRING, allowNull: false },
    managerId: { type: DataTypes.STRING, allowNull: true, field: 'manager_id' },
    location: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
    justification: { type: DataTypes.TEXT, defaultValue: '' },
    startDate: { type: DataTypes.STRING, allowNull: true },
    endDate: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.STRING, defaultValue: 'Pending' },
    approvalStage: {
      type: DataTypes.STRING(32),
      defaultValue: 'manager_review',
      field: 'approval_stage'
    },
    approvalCycle: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: 'approval_cycle'
    },
    managerReviewEnteredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'manager_review_entered_at'
    },
    submittedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    approverId: { type: DataTypes.STRING, allowNull: true },
    subcategoryId: { type: DataTypes.STRING, allowNull: true },
    // employeeName/employeeEmail/managerName/managerEmail are intentionally NOT
    // real columns: they're derived below from employeeId/managerId via the
    // employeeRecord/managerRecord associations, so display data can never
    // drift from (or be spoofed independently of) the employees table.
    employeeName: {
      type: DataTypes.VIRTUAL,
      get() { return this.employeeRecord?.name ?? null; }
    },
    employeeEmail: {
      type: DataTypes.VIRTUAL,
      get() { return this.employeeRecord?.email ?? null; }
    },
    managerName: {
      type: DataTypes.VIRTUAL,
      get() { return this.managerRecord?.name ?? null; }
    },
    managerEmail: {
      type: DataTypes.VIRTUAL,
      get() { return this.managerRecord?.email ?? null; }
    },
    rejectionReason: { type: DataTypes.TEXT, allowNull: true },
    customFieldValues: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} }
  },
  {
    tableName: 'change_requests',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['employee_id'] },
      { fields: ['status'] },
      { fields: ['category'] },
      { fields: ['submitted_at'] },
      { fields: ['employee_id', 'submitted_at'] }
    ]
  }
);

// ---------- Audit Logs -----------------------------------
export const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    actorId: { type: DataTypes.STRING, allowNull: false, field: 'actor_id' },
    action: { type: DataTypes.STRING, allowNull: false },
    ref: { type: DataTypes.STRING, allowNull: true },
    detail: { type: DataTypes.TEXT, allowNull: true },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  },
  {
    tableName: 'hot_desk_audit_logs',
    timestamps: true,
    underscored: true
  }
);

// ---------- Associations ------------------------------
import { ChangeRequestApproval } from './ChangeRequestApproval.js';
import { CatalogCategory } from './CatalogCategory.js';
import { CatalogSubcategory } from './CatalogSubcategory.js';
import { CatalogSubcategoryField } from './CatalogSubcategoryField.js';
import { Employee } from './Employee.js';
import { UserS8 } from './UserS8.js';

export { ChangeRequestApproval, CatalogCategory, CatalogSubcategory, CatalogSubcategoryField, Employee, UserS8 };

ChangeRequestApproval.belongsTo(ChangeRequest, { foreignKey: 'changeRequestId', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
ChangeRequest.hasMany(ChangeRequestApproval, { as: 'approvals', foreignKey: 'changeRequestId' });

ChangeRequest.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'empId', as: 'employeeRecord' });
ChangeRequest.belongsTo(Employee, { foreignKey: 'managerId', targetKey: 'empId', as: 'managerRecord' });

CatalogCategory.hasMany(CatalogSubcategory, { as: 'subcategories', foreignKey: 'categoryId' });
CatalogSubcategory.belongsTo(CatalogCategory, { as: 'category', foreignKey: 'categoryId' });
CatalogSubcategory.hasMany(CatalogSubcategoryField, { as: 'fields', foreignKey: 'subcategoryId' });
CatalogSubcategoryField.belongsTo(CatalogSubcategory, { as: 'subcategory', foreignKey: 'subcategoryId' });

// ChangeManagerCategory and ChangeImplementerCategory are two application
// views over one shared table (category_role_assignments, see migration
// 006) — same (user, category) assignment shape, distinguished only by
// `type`. The scope filters reads; the beforeValidate hook force-sets
// `type` on every create/upsert so every existing call site (findAll,
// destroy, upsert across changeRequest/identityResolver/userManagement
// services) keeps working completely unchanged.
const categoryAssignmentFields = {
  id: { type: DataTypes.STRING, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'hot_desk_users', key: 'id' }, onDelete: 'CASCADE' },
  categoryId: { type: DataTypes.STRING, allowNull: false, references: { model: 'catalog_categories', key: 'id' }, onDelete: 'CASCADE' },
  type: { type: DataTypes.STRING, allowNull: false }
};

export const ChangeManagerCategory = sequelize.define(
  'ChangeManagerCategory',
  categoryAssignmentFields,
  {
    tableName: 'category_role_assignments',
    timestamps: false,
    defaultScope: { where: { type: 'manager' } },
    hooks: { beforeValidate: (instance) => { instance.type = 'manager'; } }
  }
);

export const ChangeImplementerCategory = sequelize.define(
  'ChangeImplementerCategory',
  categoryAssignmentFields,
  {
    tableName: 'category_role_assignments',
    timestamps: false,
    defaultScope: { where: { type: 'implementer' } },
    hooks: { beforeValidate: (instance) => { instance.type = 'implementer'; } }
  }
);

CatalogCategory.hasMany(ChangeManagerCategory, { foreignKey: 'categoryId', as: 'assignedManagers' });
ChangeManagerCategory.belongsTo(CatalogCategory, { foreignKey: 'categoryId' });

CatalogCategory.hasMany(ChangeImplementerCategory, { foreignKey: 'categoryId', as: 'assignedImplementers' });
ChangeImplementerCategory.belongsTo(CatalogCategory, { foreignKey: 'categoryId' });

import { PreSpendRequest } from './PreSpendRequest.js';
import { TravelRequest } from './TravelRequest.js';
import { NotificationJob } from './NotificationJob.js';
export { PreSpendRequest, TravelRequest, NotificationJob };

PreSpendRequest.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'empId', as: 'employeeRecord' });
PreSpendRequest.belongsTo(Employee, { foreignKey: 'managerId', targetKey: 'empId', as: 'managerRecord' });
TravelRequest.belongsTo(Employee, { foreignKey: 'employeeId', targetKey: 'empId', as: 'employeeRecord' });
TravelRequest.belongsTo(Employee, { foreignKey: 'managerId', targetKey: 'empId', as: 'managerRecord' });

// ---------- Pre-Spend vendor quotes (was a JSONB array on pre_spend_requests) ----------
export const PreSpendVendorQuote = sequelize.define(
  'PreSpendVendorQuote',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    preSpendRequestId: { type: DataTypes.STRING, allowNull: false, field: 'pre_spend_request_id' },
    name: { type: DataTypes.STRING(255), allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    quoteDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'quote_date' },
    fileName: { type: DataTypes.STRING(255), allowNull: true, field: 'file_name' },
    fileUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'file_url' },
    isSelected: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_selected' }
  },
  { tableName: 'pre_spend_vendor_quotes', timestamps: true, underscored: true }
);
PreSpendRequest.hasMany(PreSpendVendorQuote, { foreignKey: 'preSpendRequestId', as: 'vendorQuotes' });
PreSpendVendorQuote.belongsTo(PreSpendRequest, { foreignKey: 'preSpendRequestId' });

// ---------- Approval decision outcomes (was a hand-typed string everywhere) ----------
export const ApprovalDecision = sequelize.define(
  'ApprovalDecision',
  {
    id: { type: DataTypes.SMALLINT, primaryKey: true },
    code: { type: DataTypes.STRING(20), allowNull: false, unique: true }
  },
  { tableName: 'approval_decisions', timestamps: false }
);

// ---------- Approval decision ledgers (was a JSONB array on each request table) ----------
// One row per decision (Stage 1 manager review or Stage 2 admin/board review).
// deciderId is a real FK to employees -- every possible decider (reporting
// manager, Board member, Admin, Super Admin) is resolvable to a real
// employee record via email, so this stays consistently employee-anchored
// across both stages instead of mixing login-identity and employee concepts.
// deciderRoleId is the decider's hot_desk_roles.id *at the time of the
// decision* (nullable: a plain Reporting Manager with no elevated role has
// none) -- resolved directly from the already-authenticated actor's roleId,
// never hardcoded. decisionId replaces the free-text decision string.
export const PreSpendApproval = sequelize.define(
  'PreSpendApproval',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    preSpendRequestId: { type: DataTypes.STRING, allowNull: false, field: 'pre_spend_request_id' },
    stage: { type: DataTypes.STRING(32), allowNull: false },
    deciderId: { type: DataTypes.STRING(64), allowNull: false, field: 'decider_id' },
    deciderRoleId: { type: DataTypes.UUID, allowNull: true, field: 'decider_role_id' },
    decisionId: { type: DataTypes.SMALLINT, allowNull: false, field: 'decision_id' },
    comment: { type: DataTypes.TEXT, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: false, field: 'decided_at' }
  },
  { tableName: 'pre_spend_approvals', timestamps: true, underscored: true }
);
PreSpendRequest.hasMany(PreSpendApproval, { foreignKey: 'preSpendRequestId', as: 'approvalRecords' });
PreSpendApproval.belongsTo(PreSpendRequest, { foreignKey: 'preSpendRequestId' });
PreSpendApproval.belongsTo(Employee, { foreignKey: 'deciderId', targetKey: 'empId', as: 'decider' });
PreSpendApproval.belongsTo(Role, { foreignKey: 'deciderRoleId', as: 'deciderRoleRecord' });
PreSpendApproval.belongsTo(ApprovalDecision, { foreignKey: 'decisionId', as: 'decisionRecord' });

export const TravelApproval = sequelize.define(
  'TravelApproval',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    travelRequestId: { type: DataTypes.STRING, allowNull: false, field: 'travel_request_id' },
    stage: { type: DataTypes.STRING(32), allowNull: false },
    deciderId: { type: DataTypes.STRING(64), allowNull: false, field: 'decider_id' },
    deciderRoleId: { type: DataTypes.UUID, allowNull: true, field: 'decider_role_id' },
    decisionId: { type: DataTypes.SMALLINT, allowNull: false, field: 'decision_id' },
    comment: { type: DataTypes.TEXT, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: false, field: 'decided_at' }
  },
  { tableName: 'travel_approvals', timestamps: true, underscored: true }
);
TravelRequest.hasMany(TravelApproval, { foreignKey: 'travelRequestId', as: 'approvalRecords' });
TravelApproval.belongsTo(TravelRequest, { foreignKey: 'travelRequestId' });
TravelApproval.belongsTo(Employee, { foreignKey: 'deciderId', targetKey: 'empId', as: 'decider' });
TravelApproval.belongsTo(Role, { foreignKey: 'deciderRoleId', as: 'deciderRoleRecord' });
TravelApproval.belongsTo(ApprovalDecision, { foreignKey: 'decisionId', as: 'decisionRecord' });

export const models = {
  Role,
  CatalogCategory,
  CatalogSubcategory,
  CatalogSubcategoryField,
  ChangeRequest,
  ChangeRequestApproval,
  AuditLog,
  ChangeManagerCategory,
  ChangeImplementerCategory,
  Employee,
  UserS8,
  PreSpendRequest,
  PreSpendVendorQuote,
  PreSpendApproval,
  TravelRequest,
  TravelApproval,
  ApprovalDecision,
  NotificationJob
};

export { sequelize };

