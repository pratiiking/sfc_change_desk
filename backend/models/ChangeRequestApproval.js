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
    approverId: {
      type: DataTypes.STRING,
      allowNull: false
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
