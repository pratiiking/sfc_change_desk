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
    employeeId: { type: DataTypes.STRING, defaultValue: '' },
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
    requesterId: { type: DataTypes.STRING, allowNull: false },
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
      { fields: ['requester_id'] },
      { fields: ['status'] },
      { fields: ['category'] },
      { fields: ['submitted_at'] },
      { fields: ['requester_id', 'submitted_at'] }
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
  TravelRequest,
  NotificationJob
};

export { sequelize };

