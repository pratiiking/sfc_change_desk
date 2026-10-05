import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const NotificationJob = sequelize.define(
  'NotificationJob',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    module: {
      type: DataTypes.STRING(32), // 'cr', 'prespend', 'travel'
      allowNull: false
    },
    requestId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'request_id'
    },
    approvalCycle: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: 'approval_cycle'
    },
    jobType: {
      type: DataTypes.STRING(64), // 'manager_invitation', 'stage_2_invitation', 'manager_reminder', 'decision_notice'
      allowNull: false,
      field: 'job_type'
    },
    recipientEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'recipient_email'
    },
    status: {
      type: DataTypes.STRING(32), // 'pending', 'processing', 'sent', 'failed', 'cancelled'
      defaultValue: 'pending'
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    maxAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      field: 'max_attempts'
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error'
    },
    lockedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'locked_until'
    },
    workerId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'worker_id'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at'
    }
  },
  {
    tableName: 'notification_jobs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['status', 'locked_until'] },
      { fields: ['module', 'request_id'] },
      { fields: ['created_at'] }
    ]
  }
);
