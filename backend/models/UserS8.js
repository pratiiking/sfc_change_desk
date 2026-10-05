import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const UserS8 = sequelize.define(
  'UserS8',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'last_name'
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true
    },
    microsoftId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'microsoft_id'
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login'
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id'
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 'Active'
    },
    designation: {
      type: DataTypes.STRING,
      allowNull: true
    },
    invitedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'invited_by'
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
    tableName: 'hot_desk_users',
    timestamps: true
  }
);
