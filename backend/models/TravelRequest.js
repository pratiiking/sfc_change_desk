import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const TravelRequest = sequelize.define(
  'TravelRequest',
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
    // employeeId/managerId are the only stored identity columns -- travellerName/
    // travellerEmail/managerName/managerEmail below are VIRTUAL, derived from the
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
    travellerName: {
      type: DataTypes.VIRTUAL,
      get() { return this.employeeRecord?.name ?? null; }
    },
    travellerEmail: {
      type: DataTypes.VIRTUAL,
      get() { return this.employeeRecord?.email ?? null; }
    },
    travelMode: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'travel_mode'
    },
    purpose: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    tripType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'trip_type'
    },
    travelClass: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'travel_class'
    },
    fromLocation: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'from_location'
    },
    toLocation: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'to_location'
    },
    departureDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'departure_date'
    },
    returnDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'return_date'
    },
    preferredTimeSlot: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'preferred_time_slot'
    },
    isShortNotice: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_short_notice'
    },
    bookingDetails: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'booking_details'
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
    }
    // approvalHistory used to be a JSONB array here -- now TravelApproval
    // rows (see models/index.js), one per Stage 1/Stage 2 decision.
  },
  {
    tableName: 'travel_requests',
    timestamps: true,
    underscored: true
  }
);
