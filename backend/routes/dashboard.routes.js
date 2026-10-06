import express from 'express';
import {
  getMetrics,
  getCategories,
  getStatusBreakdown,
  exportDashboardData
} from '../controllers/dashboard.controller.js';
import { authenticateUser, requireOrganizationScopeRole, requirePermission } from '../middlewares/auth.middleware.js';

import changeRequestsRouter from './changeRequest.routes.js';
import worklistRouter from './worklist.routes.js';
import settingsRouter from './settings.routes.js';
import catalogueRouter from './catalog.routes.js';

import preSpendRouter from './preSpend.routes.js';
import travelDeskRouter from './travelDesk.routes.js';

const router = express.Router();

// Apply authentication middleware globally
router.use(authenticateUser);

// Core Dashboard analytics & export
router.get('/metrics', requireOrganizationScopeRole, getMetrics);
router.get('/categories', requireOrganizationScopeRole, getCategories);
router.get('/status-breakdown', requireOrganizationScopeRole, getStatusBreakdown);
// /export always returns an organization-wide dump regardless of query params
// (see exportDashboardData: every module branch hardcodes org scope), so unlike the
// other routes here this needs an unconditional role check, not the scope-triggered one.
router.get('/export', requirePermission('dashboard.export'), exportDashboardData);

// Modular Domain Routers
router.use('/', changeRequestsRouter);
router.use('/', worklistRouter);
router.use('/', settingsRouter);
router.use('/', catalogueRouter);
router.use('/pre-spend', preSpendRouter);
router.use('/travel-desk', travelDeskRouter);

export default router;
