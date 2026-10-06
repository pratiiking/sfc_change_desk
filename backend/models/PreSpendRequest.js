import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const PreSpendRequest = sequelize.define(
  'PreSpendRequest',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    requestCode: {
      type: DataTypes.STRING(32),
      allowNull: true,
      unique: true,
      field: 'request_code'
    },
    // employeeId/managerId are the only stored identity columns -- requesterName/
    // requesterEmail/managerName/managerEmail below are VIRTUAL, derived from the
    // employeeRecord/managerRecord associations (see models/index.js), so this
    // data can never drift from or duplicate the employees table.
    employeeId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'employee_id'
    },
    managerId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'manager_id'
    },
    requesterName: {
      type: DataTypes.VIRTUAL,
      get() { return this.employeeRecord?.name ?? null; }
    },
    requesterEmail: {
      type: DataTypes.VIRTUAL,
      get() { return this.employeeRecord?.email ?? null; }
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    subcategory: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    itemDescription: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'item_description'
    },
    estimatedAmount: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: true,
      defaultValue: 0,
      field: 'estimated_amount'
    },
    neededByDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'needed_by_date'
    },
    costCentre: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'cost_centre'
    },
    budgetLine: {
      type: DataTypes.STRING(150),
      allowNull: true,
      field: 'budget_line'
    },
    businessJustification: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'business_justification'
    },
    isUrgent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_urgent'
    },
    urgentReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'urgent_reason'
    },
    vendors: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    selectedVendor: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'selected_vendor'
    },
    commercialException: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'commercial_exception'
    },
    commercialReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'commercial_reason'
    },
    commercialJustification: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'commercial_justification'
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'Pending Approval'
    },
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
    managerName: {
      type: DataTypes.VIRTUAL,
      get() { return this.managerRecord?.name ?? null; }
    },
    managerEmail: {
      type: DataTypes.VIRTUAL,
      get() { return this.managerRecord?.email ?? null; }
    },
    managerReviewEnteredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'manager_review_entered_at'
    },
    policyCertified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'policy_certified'
    },
    approvalHistory: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'approval_history'
    }
  },
  {
    tableName: 'pre_spend_requests',
    timestamps: true,
    underscored: true
  }
);
