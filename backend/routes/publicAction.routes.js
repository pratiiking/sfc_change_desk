import express from 'express';
import jwt from 'jsonwebtoken';
import { ChangeRequest, ChangeRequestApproval } from '../models/index.js';
import { PreSpendRequest } from '../models/PreSpendRequest.js';
import { TravelRequest } from '../models/TravelRequest.js';
import { serializeChangeRequest } from '../utils/serializers.js';
import {
  applyWorklistActionService,
  addAuditLog
} from '../services/dashboard.service.js';
import { handlePreSpendActionService } from '../services/preSpend.service.js';
import { handleTravelActionService } from '../services/travelDesk.service.js';
import { IdentityResolver } from '../services/identityResolver.service.js';
import { APPROVAL_STAGE, isManagerReviewStage } from '../config/approvalWorkflow.js';
import { publicActionRateLimiter } from '../middlewares/rateLimit.middleware.js';

const CR_INCLUDE = [
  { model: ChangeRequestApproval, as: 'approvals' }
];

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'sfc-change-desk-secure-jwt-secret-key-2026';

router.use(publicActionRateLimiter);

// GET /api/public/change-request-action?token=...&module=...
router.get('/change-request-action', async (req, res) => {
  const { token, module: modQuery } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Missing action token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { crId, preSpendId, travelId, approverEmail, defaultAction, stage: tokenStage, approvalCycle: tokenCycle } = decoded;
    const targetModule = modQuery || (preSpendId ? 'prespend' : travelId ? 'travel' : 'cr');

    // 1. Pre-Spend Module
    if (targetModule === 'prespend' || preSpendId) {
      const psId = preSpendId || crId;
      const ps = await PreSpendRequest.findByPk(psId);
      if (!ps) {
        return res.status(404).json({ success: false, message: `Pre-Spend Request ${psId} not found` });
      }
      if (tokenCycle && ps.approvalCycle && ps.approvalCycle !== tokenCycle) {
        return res.status(409).json({ success: false, message: 'This action link has expired due to a new review cycle.' });
      }
      const isStage1Token = tokenStage === APPROVAL_STAGE.MANAGER_REVIEW;
      const isPending = ps.status === 'Pending Approval' || ps.status === 'Pending';
      const isAlreadyProcessed = isStage1Token
        ? (!isManagerReviewStage(ps.approvalStage) || !isPending)
        : !isPending;

      const lastAction = Array.isArray(ps.approvalHistory) && ps.approvalHistory.length > 0
        ? ps.approvalHistory[ps.approvalHistory.length - 1]
        : null;

      const isStage1 = isManagerReviewStage(ps.approvalStage);

      return res.json({
        success: true,
        data: {
          module: 'prespend',
          request: ps,
          action: defaultAction || 'approve',
          approverEmail,
          stage: ps.approvalStage || APPROVAL_STAGE.MANAGER_REVIEW,
          isManagerReview: isStage1Token || isStage1,
          stageLabel: isStage1 ? 'Waiting for manager review' : ps.status === 'Approved' ? 'Approved' : ps.status === 'Rejected' ? 'Rejected' : 'Pending Stage 2 Review',
          isPending,
          isApproved: ps.status === 'Approved',
          isAlreadyProcessed,
          alreadyProcessedDetails: isAlreadyProcessed ? {
            status: ps.status,
            action: lastAction?.action || (ps.status === 'Approved' ? 'approve' : ps.status === 'Rejected' ? 'reject' : 'processed'),
            decision: lastAction?.decision || ps.status,
            decidedBy: lastAction?.actorName || ps.managerName || 'Approver',
            decidedByEmail: lastAction?.actorEmail || null,
            comment: lastAction?.comment || null,
            timestamp: lastAction?.timestamp || ps.updatedAt
          } : null
        }
      });
    }

    // 2. Travel Desk Module
    if (targetModule === 'travel' || travelId) {
      const trId = travelId || crId;
      const tr = await TravelRequest.findByPk(trId);
      if (!tr) {
        return res.status(404).json({ success: false, message: `Travel Request ${trId} not found` });
      }
      if (tokenCycle && tr.approvalCycle && tr.approvalCycle !== tokenCycle) {
        return res.status(409).json({ success: false, message: 'This action link has expired due to a new review cycle.' });
      }
      const isStage1Token = tokenStage === APPROVAL_STAGE.MANAGER_REVIEW;
      const isPending = tr.status === 'Pending Approval' || tr.status === 'Pending';
      const isAlreadyProcessed = isStage1Token
        ? (!isManagerReviewStage(tr.approvalStage) || !isPending)
        : !isPending;

      const lastAction = Array.isArray(tr.approvalHistory) && tr.approvalHistory.length > 0
        ? tr.approvalHistory[tr.approvalHistory.length - 1]
        : null;

      const isStage1 = isManagerReviewStage(tr.approvalStage);

      return res.json({
        success: true,
        data: {
          module: 'travel',
          request: tr,
          action: defaultAction || 'approve',
          approverEmail,
          stage: tr.approvalStage || APPROVAL_STAGE.MANAGER_REVIEW,
          isManagerReview: isStage1Token || isStage1,
          stageLabel: isStage1 ? 'Waiting for manager review' : tr.status === 'Approved' ? 'Approved' : tr.status === 'Rejected' ? 'Rejected' : 'Pending Stage 2 Review',
          isPending,
          isApproved: tr.status === 'Approved',
          isAlreadyProcessed,
          alreadyProcessedDetails: isAlreadyProcessed ? {
            status: tr.status,
            action: lastAction?.action || (tr.status === 'Approved' ? 'approve' : tr.status === 'Rejected' ? 'reject' : 'processed'),
            decision: lastAction?.decision || tr.status,
            decidedBy: lastAction?.actorName || tr.managerName || 'Approver',
            decidedByEmail: lastAction?.actorEmail || null,
            comment: lastAction?.comment || null,
            timestamp: lastAction?.timestamp || tr.updatedAt
          } : null
        }
      });
    }

    // 3. Change Desk Module (Default)
    const cr = await ChangeRequest.findByPk(crId, { include: CR_INCLUDE });
    if (!cr) {
      return res.status(404).json({ success: false, message: `Change Request ${crId} not found` });
    }
    if (tokenCycle && cr.approvalCycle && cr.approvalCycle !== tokenCycle) {
      return res.status(409).json({ success: false, message: 'This action link has expired due to a new review cycle.' });
    }

    const serialized = serializeChangeRequest(cr);
    const isStage1Token = tokenStage === APPROVAL_STAGE.MANAGER_REVIEW;
    const isImplementToken = defaultAction === 'implement';
    const isStage1 = isManagerReviewStage(cr.approvalStage);

    const isAlreadyProcessed = isStage1Token
      ? (!isManagerReviewStage(cr.approvalStage) || cr.status !== 'Pending')
      : isImplementToken
        ? (cr.status === 'Implemented' || cr.status === 'Rejected')
        : (cr.status !== 'Pending');

    const customVals = (cr.customFieldValues && typeof cr.customFieldValues === 'object') ? cr.customFieldValues : {};
    const lastComment = Array.isArray(cr.comments) && cr.comments.length > 0
      ? cr.comments[cr.comments.length - 1]
      : null;

    const decidedBy = customVals.approvedBy || customVals.rejectedBy || customVals.managerApprovedBy || customVals.implementedBy || lastComment?.authorName || serialized.decidedBy || 'Approver';
    const decidedComment = customVals.approvedComment || customVals.rejectedComment || customVals.rejectionReason || customVals.managerApprovedComment || customVals.implementedComment || lastComment?.text || null;

    return res.json({
      success: true,
      data: {
        module: 'cr',
        cr: serialized,
        request: serialized,
        action: defaultAction || 'approve',
        approverEmail,
        stage: cr.approvalStage || APPROVAL_STAGE.MANAGER_REVIEW,
        isManagerReview: isStage1Token || isStage1,
        stageLabel: isStage1 ? 'Waiting for manager review' : cr.status === 'Approved' ? 'Manager approved' : cr.status === 'Rejected' ? 'Rejected' : cr.status === 'Implemented' ? 'Implemented' : 'Pending Stage 2 Review',
        isPending: serialized.status === 'Pending',
        isApproved: serialized.status === 'Approved',
        isAlreadyProcessed,
        alreadyProcessedDetails: isAlreadyProcessed ? {
          status: cr.status,
          action: cr.status === 'Approved' ? 'approve' : cr.status === 'Implemented' ? 'implement' : cr.status === 'Rejected' ? 'reject' : 'processed',
          decision: cr.status,
          decidedBy,
          decidedByEmail: customVals.approvedByEmail || customVals.implementedByEmail || null,
          comment: decidedComment,
          timestamp: cr.closedAt || customVals.managerApprovedAt || cr.updatedAt
        } : null
      }
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: err.name === 'TokenExpiredError' ? 'This action link has expired' : 'Invalid or malformed action token'
    });
  }
});

// POST /api/public/change-request-action
router.post('/change-request-action', async (req, res) => {
  const { token, module: modBody, action, comment } = req.body || {};

  if (!token) {
    return res.status(400).json({ success: false, message: 'Missing action token' });
  }
  if (!['approve', 'reject', 'implement'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Action must be "approve", "reject", or "implement"' });
  }

  const actionComment = (comment || '').trim();
  if (!actionComment) {
    return res.status(400).json({ success: false, message: 'A comment is required for this action.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { crId, preSpendId, travelId, approverEmail, stage: tokenStage, approvalCycle: tokenCycle } = decoded;
    const targetModule = modBody || (preSpendId ? 'prespend' : travelId ? 'travel' : 'cr');

    // Resolve approver's actor identity from email
    let actor = { email: approverEmail, displayName: 'Approver' };
    if (approverEmail) {
      const resIdentity = await IdentityResolver.resolveByEmail(approverEmail);
      if (resIdentity?.status === 'SUCCESS' && resIdentity?.identity) {
        actor = {
          ...resIdentity.identity,
          id: resIdentity.identity.id || resIdentity.identity.userKey,
          userKey: resIdentity.identity.userKey,
          email: resIdentity.identity.email || approverEmail,
          roleId: resIdentity.identity.roleId,
          role: resIdentity.identity.roleName
        };
      }
    }

    // 1. Handle Pre-Spend
    if (targetModule === 'prespend' || preSpendId) {
      const psId = preSpendId || crId;
      const ps = await PreSpendRequest.findByPk(psId);
      if (!ps) {
        return res.status(404).json({ success: false, message: `Pre-Spend Request ${psId} not found` });
      }
      if (tokenCycle && ps.approvalCycle && ps.approvalCycle !== tokenCycle) {
        return res.status(409).json({ success: false, message: 'This action link has expired due to a new review cycle.' });
      }
      if (tokenStage === APPROVAL_STAGE.MANAGER_REVIEW && !isManagerReviewStage(ps.approvalStage)) {
        return res.json({
          success: true,
          alreadyProcessed: true,
          message: `This Pre-Spend request has already been reviewed by the manager (Current Status: ${ps.status}).`,
          data: ps
        });
      }
      if (ps.status !== 'Pending Approval' && ps.status !== 'Pending') {
        return res.json({
          success: true,
          alreadyProcessed: true,
          message: `This Pre-Spend request has already been marked as ${ps.status}.`,
          data: ps
        });
      }
      const result = await handlePreSpendActionService({
        id: psId,
        action,
        comment: actionComment,
        actor
      });
      const actionText = action === 'approve' ? 'Approved' : 'Rejected';
      return res.json({
        success: true,
        message: `Pre-Spend Request ${result.requestCode || psId} has been ${actionText} successfully.`,
        data: result
      });
    }

    // 2. Handle Travel Desk
    if (targetModule === 'travel' || travelId) {
      const trId = travelId || crId;
      const tr = await TravelRequest.findByPk(trId);
      if (!tr) {
        return res.status(404).json({ success: false, message: `Travel Request ${trId} not found` });
      }
      if (tokenCycle && tr.approvalCycle && tr.approvalCycle !== tokenCycle) {
        return res.status(409).json({ success: false, message: 'This action link has expired due to a new review cycle.' });
      }
      if (tokenStage === APPROVAL_STAGE.MANAGER_REVIEW && !isManagerReviewStage(tr.approvalStage)) {
        return res.json({
          success: true,
          alreadyProcessed: true,
          message: `This Travel request has already been reviewed by the manager (Current Status: ${tr.status}).`,
          data: tr
        });
      }
      if (tr.status !== 'Pending Approval' && tr.status !== 'Pending') {
        return res.json({
          success: true,
          alreadyProcessed: true,
          message: `This Travel request has already been marked as ${tr.status}.`,
          data: tr
        });
      }
      const result = await handleTravelActionService({
        id: trId,
        action,
        comment: actionComment,
        actor
      });
      const actionText = action === 'approve' ? 'Approved' : 'Rejected';
      return res.json({
        success: true,
        message: `Travel Request ${result.requestCode || trId} has been ${actionText} successfully.`,
        data: result
      });
    }

    // 3. Handle Change Request
    const cr = await ChangeRequest.findByPk(crId);
    if (!cr) {
      return res.status(404).json({ success: false, message: `Change Request ${crId} not found` });
    }
    if (tokenCycle && cr.approvalCycle && cr.approvalCycle !== tokenCycle) {
      return res.status(409).json({ success: false, message: 'This action link has expired due to a new review cycle.' });
    }

    if (tokenStage === APPROVAL_STAGE.MANAGER_REVIEW && !isManagerReviewStage(cr.approvalStage)) {
      return res.json({
        success: true,
        alreadyProcessed: true,
        message: `This Change Request has already been reviewed by the manager (Current Status: ${cr.status}).`,
        data: cr
      });
    }

    if (action === 'implement') {
      if (cr.status === 'Implemented') {
        return res.json({
          success: true,
          alreadyProcessed: true,
          message: `Change Request ${crId} has already been marked as Implemented.`,
          data: cr
        });
      }
      if (cr.status !== 'Approved') {
        return res.status(400).json({
          success: false,
          message: `Cannot implement Change Request in "${cr.status}" status (must be Approved).`
        });
      }
    } else {
      if (cr.status !== 'Pending') {
        return res.json({
          success: true,
          alreadyProcessed: true,
          message: `This Change Request has already been marked as ${cr.status}.`,
          data: cr
        });
      }
    }

    const result = await applyWorklistActionService({
      id: crId,
      action,
      rejectionReason: actionComment,
      comment: actionComment,
      actorId: actor?.id || actor?.userKey || null
    });

    const actionText = action === 'approve' ? 'Approved' : action === 'implement' ? 'Implemented' : 'Rejected';

    return res.json({
      success: true,
      message: `Change Request ${crId} has been ${actionText} successfully.`,
      data: result
    });
  } catch (err) {
    console.error('[publicActions] Action failed:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to process approval action'
    });
  }
});

export default router;
