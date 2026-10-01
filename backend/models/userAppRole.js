import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const UserAppRole = sequelize.define(
  'UserAppRole',
  {
    userKey: {
      type: DataTypes.STRING(100),
      primaryKey: true,
      field: 'user_key'
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id',
      references: {
        model: 'roles',
        key: 'id'
      }
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at'
    }
  },
  {
    tableName: 'changedesk_identity_roles',
    timestamps: true
  }
);
