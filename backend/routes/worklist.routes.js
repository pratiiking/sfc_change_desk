import express from 'express';
import {
  getWorklist,
  getWorklistCounts,
  handleWorklistAction,
  addChangeRequestComment
} from '../controllers/worklist.controller.js';
import { requireRole, requireOrganizationScopeRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { worklistActionSchema } from '../validations/worklist.validation.js';
import { ROLE } from '../config/constants.js';

const router = express.Router();

// Any authenticated user can call this — the underlying counts are already
// role-gated per domain and simply come back 0 for a domain the caller can't
// act on, so there's nothing to additionally restrict at the route level.
router.get('/worklist/counts', getWorklistCounts);

router.get('/worklist', requireRole(['Change Manager', 'Change Implementer', 'Admin', 'Super Admin', 'Change Desk Admin', ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY, ROLE.CHANGE_ADMIN, ROLE.CHANGE_MANAGER, ROLE.CHANGE_IMPLEMENTER]), requireOrganizationScopeRole, getWorklist);
router.get('/my-worklist', requireRole(['Change Manager', 'Change Implementer', 'Admin', 'Super Admin', 'Change Desk Admin', ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY, ROLE.CHANGE_ADMIN, ROLE.CHANGE_MANAGER, ROLE.CHANGE_IMPLEMENTER]), requireOrganizationScopeRole, getWorklist);
router.post('/worklist/action', requireRole(['Change Manager', 'Change Implementer', 'Admin', 'Super Admin', 'Change Desk Admin', ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY, ROLE.CHANGE_ADMIN, ROLE.CHANGE_MANAGER, ROLE.CHANGE_IMPLEMENTER]), validate(worklistActionSchema), handleWorklistAction);
router.post('/worklist/comment', requireRole(['Change Manager', 'Change Implementer', 'Admin', 'Super Admin', 'Change Desk Admin', ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY, ROLE.CHANGE_ADMIN, ROLE.CHANGE_MANAGER, ROLE.CHANGE_IMPLEMENTER]), addChangeRequestComment);

export default router;
