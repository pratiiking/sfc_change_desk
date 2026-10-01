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
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'display_name'
    },
    givenName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'given_name'
    },
    familyName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'family_name'
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
    loginType: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'login_type'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login'
    },
    role: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'role'
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
