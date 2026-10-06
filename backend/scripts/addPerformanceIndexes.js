import '../config/env.js';
import { sequelize } from '../config/database.js';

// Safe to run repeatedly. CONCURRENTLY avoids long write blocking on a live
// PostgreSQL database; each statement must remain outside a transaction.
const indexes = [
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cra_approver_request_decision ON change_request_approvals (approver_id, change_request_id, decision)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_created_at ON notifications (user_id, created_at DESC)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_change_requests_employee_submitted_at ON change_requests (employee_id, submitted_at DESC)'
];

try {
  await sequelize.authenticate();
  for (const sql of indexes) {
    await sequelize.query(sql);
  }
  console.log('Performance indexes are ready.');
} finally {
  await sequelize.close();
}
