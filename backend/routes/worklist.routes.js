import express from 'express';
import {
  getWorklist,
  getWorklistCounts,
  handleWorklistAction,
  addChangeRequestComment
} from '../controllers/worklist.controller.js';
import { requirePermission, requireOrganizationScopeRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { worklistActionSchema } from '../validations/worklist.validation.js';

const router = express.Router();

// Any authenticated user can call this — the underlying counts are already
// role-gated per domain and simply come back 0 for a domain the caller can't
// act on, so there's nothing to additionally restrict at the route level.
router.get('/worklist/counts', getWorklistCounts);

router.get('/worklist', requirePermission('changeRequest.worklist.view'), requireOrganizationScopeRole, getWorklist);
router.get('/my-worklist', requirePermission('changeRequest.worklist.view'), requireOrganizationScopeRole, getWorklist);
router.post('/worklist/action', requirePermission('changeRequest.worklist.view'), validate(worklistActionSchema), handleWorklistAction);
router.post('/worklist/comment', requirePermission('changeRequest.worklist.view'), addChangeRequestComment);

export default router;
