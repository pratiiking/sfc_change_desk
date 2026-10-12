import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const ChangeRequestApproval = sequelize.define(
  'ChangeRequestApproval',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    changeRequestId: {
      type: DataTypes.STRING,
      allowNull: false
    },
    // A real FK to employees.emp_id (see migration 049) -- an employees row
    // is permanent (never deleted, unlike hot_desk_users), so this can
    // never again be orphaned by someone's access being removed. Nullable
    // because a handful of pre-migration rows had no resolvable identity.
    approverId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    decisionId: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      field: 'decision_id'
    },
    decidedAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    tableName: 'change_request_approvals',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['change_request_id', 'approver_id'] },
      { fields: ['change_request_id', 'decision_id'] },
      // Used by the paged worklist when retrieving an approver's decisions.
      { fields: ['approver_id', 'change_request_id', 'decision_id'] }
    ]
  }
);
