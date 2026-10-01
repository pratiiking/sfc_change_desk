import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { ROLE } from '../config/constants.js';

export const ChangeUser = sequelize.define(
  'ChangeUser',
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    designation: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: ''
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: ROLE.REQUESTER // Default to standard Requester
    },
    roleName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Requester'
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Active' // Active, Invited, Inactive
    },
    invitedBy: {
      type: DataTypes.STRING,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  },
  {
    tableName: 'change_user',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['email'] },
      { fields: ['role_id'] },
      { fields: ['status'] }
    ]
  }
);
