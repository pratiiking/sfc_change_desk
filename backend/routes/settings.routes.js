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
import { requirePermission } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/settings/users', requirePermission('settings.users.manage'), getSettingsUsers);
router.post('/settings/users', requirePermission('settings.users.manage'), createSettingsUser);
router.patch('/settings/users/:id', requirePermission('settings.users.manage'), updateSettingsUser);
router.delete('/settings/users/:id', requirePermission('settings.users.manage'), deleteSettingsUser);
router.get('/settings/roles', requirePermission('settings.roles.view'), getSettingsRoles);
router.patch('/settings/roles/:id', requirePermission('settings.roles.manage'), updateRolePermissions);
router.get('/settings/audit-logs', requirePermission('settings.auditLogs.view'), getSettingsAuditLogs);
router.post('/settings/audit-logs/export', requirePermission('settings.auditLogs.view'), exportAuditLogs);

router.get('/settings/change-manager-categories/:userId', requirePermission('settings.users.manage'), getChangeManagerCategories);
router.put('/settings/change-manager-categories/:userId', requirePermission('settings.users.manage'), updateChangeManagerCategories);

router.get('/settings/change-implementer-categories/:userId', requirePermission('settings.users.manage'), getChangeImplementerCategories);
router.put('/settings/change-implementer-categories/:userId', requirePermission('settings.users.manage'), updateChangeImplementerCategories);

export default router;
