// ────────────────────────────────────────────────────────────────
//  Shared two-stage approval workflow constants/predicates.
//
//  Change Desk, Travel Desk, and Pre-Spend each run the exact same
//  state machine on their own request table (manager_review ->
//  stage_2_review -> completed|rejected, with an optional draft
//  stage before manager_review). The stage *names* and the
//  predicates that read them were independently copy-pasted into
//  all three services — this is the one place that now owns them,
//  so a future change to the state machine is made once instead of
//  three times in sync.
//
//  Only the pure, side-effect-free pieces live here (constants +
//  predicates). Each service still performs its own writes and
//  module-specific side effects (audit logs, notifications, stats)
//  around these — that orchestration is legitimately different per
//  module and is intentionally NOT unified.
// ────────────────────────────────────────────────────────────────

export const APPROVAL_STAGE = Object.freeze({
  DRAFT: 'draft',
  MANAGER_REVIEW: 'manager_review',
  STAGE_2_REVIEW: 'stage_2_review',
  COMPLETED: 'completed',
  REJECTED: 'rejected'
});

/** True while the request is awaiting the requester's manager. */
export const isManagerReviewStage = (approvalStage) => approvalStage === APPROVAL_STAGE.MANAGER_REVIEW;

/**
 * True while the request is awaiting the second (CAB / admin) stage.
 * `pendingStatus` is the module's own "still open, no explicit stage yet"
 * status string (Change Desk: 'Pending', Travel/Pre-Spend: 'Pending Approval') —
 * older rows created before `approvalStage` existed fall back to it.
 */
export const isStage2ReviewStage = (approvalStage, status, pendingStatus) =>
  approvalStage === APPROVAL_STAGE.STAGE_2_REVIEW || (!approvalStage && status === pendingStatus);

/** Patch to apply when a request is first submitted (or a draft is submitted). */
export const initialApprovalState = (cycle = 1) => ({
  approvalStage: APPROVAL_STAGE.MANAGER_REVIEW,
  approvalCycle: cycle,
  managerReviewEnteredAt: new Date()
});
