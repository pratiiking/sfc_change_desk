import express from 'express';
import {
  getSettingsUsers,
  createSettingsUser,
  updateSettingsUser,
  deleteSettingsUser,
  getSettingsRoles,
  updateRolePermissions,
  getSettingsAuditLogs,
  exportAuditLogs,
  getChangeManagerCategories,
  updateChangeManagerCategories,
  getChangeImplementerCategories,
  updateChangeImplementerCategories
} from '../controllers/settings.controller.js';
import { requireRole } from '../middlewares/auth.middleware.js';
import { ROLE } from '../config/constants.js';

const router = express.Router();

router.get('/settings/users', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), getSettingsUsers);
router.post('/settings/users', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), createSettingsUser);
router.patch('/settings/users/:id', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), updateSettingsUser);
router.delete('/settings/users/:id', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), deleteSettingsUser);
router.get('/settings/roles', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), getSettingsRoles);
router.patch('/settings/roles/:id', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), updateRolePermissions);
router.get('/settings/audit-logs', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), getSettingsAuditLogs);
router.post('/settings/audit-logs/export', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), exportAuditLogs);

router.get('/settings/change-manager-categories/:userId', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), getChangeManagerCategories);
router.put('/settings/change-manager-categories/:userId', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), updateChangeManagerCategories);

router.get('/settings/change-implementer-categories/:userId', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), getChangeImplementerCategories);
router.put('/settings/change-implementer-categories/:userId', requireRole(['Super Admin', ROLE.SUPER_ADMIN]), updateChangeImplementerCategories);

export default router;
