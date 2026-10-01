import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Check } from 'lucide-react';
import { apiFetch } from '../../lib/apiFetch.lib';
import { ROLE } from '../../lib/permissions.lib';

export default function ChangeRequestModal({ cr, onClose, onApprove, onReject, onSendBack, onSubmitForApproval, onImplement, onAddComment, user }) {
  if (!cr) return null;

  const currentUser = user || JSON.parse(localStorage.getItem('sfc_user') || '{}');
  const userRoleName = (currentUser?.role || '').toLowerCase();
  const userRoleId = currentUser?.roleId || '';
  const isAdminOrSuperAdmin = [ROLE.SUPER_ADMIN, ROLE.ADMIN_LEGACY].includes(userRoleId) || userRoleName.includes('admin') || userRoleName.includes('super');
  const isChangeManager = userRoleId === ROLE.CHANGE_MANAGER || userRoleName.includes('manager') || (Array.isArray(currentUser?.cmCategories) && currentUser.cmCategories.length > 0);
  const isChangeImplementer = userRoleId === ROLE.CHANGE_IMPLEMENTER || userRoleName.includes('implementer') || (Array.isArray(currentUser?.ciCategories) && currentUser.ciCategories.length > 0);
  const managerCategories = currentUser?.cmCategories ?? [];
  const implementerCategories = currentUser?.ciCategories ?? [];
  const crCatName = (cr.category || '').toLowerCase().trim();
  const crCatId = cr.categoryId || '';
  const isImplementerAssigned = isChangeImplementer && (
    implementerCategories.includes(crCatId) ||
    implementerCategories.some(cid => crCatName.includes(cid.toLowerCase()) || cid.toLowerCase().includes(crCatName))
  );
  const canMarkImplemented = (isAdminOrSuperAdmin || isImplementerAssigned);
  const isRequester = !isAdminOrSuperAdmin && !isChangeManager && !isChangeImplementer;
  const isSelfRequest = Boolean(
    (cr.requesterId && currentUser?.id && (String(cr.requesterId) === String(currentUser.id) || String(cr.requesterId) === String(currentUser?.userKey))) ||
    (cr.employeeId && currentUser?.employeeId && String(cr.employeeId).trim().toLowerCase() === String(currentUser.employeeId).trim().toLowerCase()) ||
    (cr.employeeEmail && currentUser?.email && cr.employeeEmail.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) ||
    (cr.requesterEmail && currentUser?.email && cr.requesterEmail.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) ||
    (cr.customFieldValues?.employeeEmail && currentUser?.email && String(cr.customFieldValues.employeeEmail).trim().toLowerCase() === currentUser.email.trim().toLowerCase())
  );

  const [actionPrompt, setActionPrompt] = useState(null); // { action: 'approve'|'reject'|'implement', title: string, color: string }
  const [actionCommentInput, setActionCommentInput] = useState('');
  const [actionCommentError, setActionCommentError] = useState('');
  const [hoveredStepIdx, setHoveredStepIdx] = useState(null);

  const initialComments = Array.isArray(cr.comments)
    ? cr.comments
    : Array.isArray(cr.customFieldValues?.comments)
    ? cr.customFieldValues.comments
    : [];
  const [commentsList, setCommentsList] = useState(initialComments);

  useEffect(() => {
    const nextComments = Array.isArray(cr.comments)
      ? cr.comments
      : Array.isArray(cr.customFieldValues?.comments)
      ? cr.customFieldValues.comments
      : [];
    setCommentsList(nextComments);
  }, [cr.id, cr.comments, cr.customFieldValues?.comments]);
  const [commentInput, setCommentInput] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  const handlePostComment = async () => {
    if (!commentInput.trim()) return;
    setIsPostingComment(true);
    setCommentError('');
    try {
      if (onAddComment) {
        await onAddComment(cr.id, commentInput.trim());
      } else {
        const res = await apiFetch('/worklist/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: cr.id, text: commentInput.trim() })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to post comment');
        }
      }
      const newCommentObj = {
        id: `cmt-${Date.now()}`,
        authorName: currentUser.name || 'Admin User',
        authorRole: currentUser.role || 'Admin',
        text: commentInput.trim(),
        createdAt: new Date().toISOString()
      };
      setCommentsList(prev => [...prev, newCommentObj]);
      setCommentInput('');
    } catch (err) {
      setCommentError(err.message || 'Error posting comment');
    } finally {
      setIsPostingComment(false);
    }
  };

  const formatCleanDate = (d) => {
    if (!d) return 'Not specified';
    const str = String(d).trim();
    if (str.includes('T')) {
      const [datePart] = str.split('T');
      const parts = datePart.split('-');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return str;
  };

  const formatCleanTime = (d) => {
    if (!d) return '';
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      const hasTime = (typeof d === 'string' && (d.includes(':') || (d.includes('T') && !d.endsWith('T00:00:00.000Z')))) || typeof d === 'number' || d instanceof Date;
      if (hasTime) {
        return parsed.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      }
    }
    return '';
  };

  const ignoredKeys = [
    'comments',
    'employeeEmail',
    'employeeId',
    'employeeName',
    'managerEmail',
    'title',
    'category',
    'subCategory',
    'startDate',
    'justification',
    'workflow',
    'approvedBy',
    'approvedComment',
    'implementedComment',
    'rejectedComment',
    'rejectionReason'
  ];

  const categoryLower = (cr.category || '').toLowerCase();
  const isITAsset = categoryLower.includes('asset');
  const isServer = categoryLower.includes('server');
  const isNetwork = categoryLower.includes('network');

  const serverNetworkKeys = [
    'hostingType',
    'vlanRequirement',
    'backupRequired',
    'rebootRequired',
    'operatingSystem',
    'currentOsVersion',
    'targetVersionPatch',
    'kbCve',
    'serverName',
    'ipAddress',
    'cpu',
    'ram',
    'storage'
  ];

  const itAssetKeys = [
    'assetType',
    'assetId',
    'dateOfPurchase',
    'disposalReason',
    'currentQtyInStock',
    'qtyRequired',
    'returnAssetConfiguration'
  ];

  const customFields = cr.customFieldValues && typeof cr.customFieldValues === 'object'
    ? Object.entries(cr.customFieldValues).filter(([key, val]) => {
        if (ignoredKeys.includes(key)) return false;
        if (val === undefined || val === null) return false;
        if (typeof val === 'string' && val.trim() === '') return false;
        if (isITAsset && serverNetworkKeys.includes(key)) return false;
        if ((isServer || isNetwork) && itAssetKeys.includes(key)) return false;
        return true;
      })
    : [];

  // Ensure Action Required is always displayed if available on cr
  const hasActionInFields = customFields.some(([k]) => k === 'actionRequired' || k === 'action');
  const requestAction = cr.action || cr.actionRequired || cr.customFieldValues?.actionRequired;
  if (!hasActionInFields && requestAction && typeof requestAction === 'string' && requestAction.trim()) {
    customFields.unshift(['actionRequired', requestAction.trim()]);
  }

  const statusLower = (cr.status || '').toLowerCase();
  const decisionLower = (cr.myDecision || '').toLowerCase();

  const isStage1Pending = cr.approvalStage === 'manager_review' && statusLower === 'pending';
  const hasManagerApproved = cr.approvalStage === 'stage_2_review' || Boolean(cr.customFieldValues?.managerApprovedBy || cr.customFieldValues?.managerApprovedAt);

  const isImplemented = statusLower === 'implemented';
  const isRejected = statusLower === 'rejected' || decisionLower === 'rejected';
  const isApproved = (statusLower === 'approved' || decisionLower === 'approved') && !isImplemented;

  const statusLabel = isImplemented
    ? 'Implemented'
    : isRejected
      ? (cr.rejectionReason?.includes('Manager') ? 'Rejected by Manager' : 'Rejected')
      : isApproved
        ? 'Approved'
        : isStage1Pending
          ? 'Waiting for manager review'
          : hasManagerApproved
            ? 'Manager approved'
            : (cr.status || 'Pending');

  const statusBg = isImplemented ? '#ECFDF5' : isRejected ? '#FEE2E2' : isApproved ? '#F5F3FF' : '#FEF3C7';
  const statusColor = isImplemented ? '#059669' : isRejected ? '#DC2626' : isApproved ? '#7C3AED' : '#D97706';
  const statusDot = isImplemented ? '#10B981' : isRejected ? '#DC2626' : isApproved ? '#8B5CF6' : '#D97706';

  const steps = isRejected
    ? ['Requested', 'Rejected']
    : ['Requested', 'Manager Review', 'Approved', 'Implemented'];

  const currentStepIdx = isRejected ? 1
    : isImplemented ? 3
    : isApproved ? 2
    : hasManagerApproved ? 2
    : 1;

  const progressPercent = Math.min(100, Math.max(0, (currentStepIdx / (steps.length - 1)) * 100));

  const activeColor = isRejected ? '#DC2626' : isImplemented ? '#10B981' : isApproved ? '#8B5CF6' : '#F59E0B';

  const canAct = cr.canAct === true && !isApproved && !isRejected && !isImplemented && !isSelfRequest;

  const getStepDate = (stepName) => {
    const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (stepName === 'Requested') return cr.raisedDate || (cr.submittedAt ? new Date(cr.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : todayFormatted);
    if (stepName === 'Manager Review') return hasManagerApproved ? (cr.customFieldValues?.managerApprovedAt ? new Date(cr.customFieldValues.managerApprovedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : todayFormatted) : '';
    if (stepName === 'Approved') return (isApproved || isImplemented) ? (cr.approvedDate || (cr.decidedAt ? new Date(cr.decidedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (cr.updatedAt ? new Date(cr.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : cr.raisedDate || todayFormatted))) : '';
    if (stepName === 'Rejected') return isRejected ? (cr.closedDate || cr.rejectedDate || (cr.closedAt ? new Date(cr.closedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (cr.updatedAt ? new Date(cr.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : cr.raisedDate || todayFormatted))) : '';
    if (stepName === 'Implemented') return isImplemented ? (cr.closedDate || cr.implementedDate || (cr.closedAt ? new Date(cr.closedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (cr.updatedAt ? new Date(cr.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : cr.raisedDate || todayFormatted))) : '';
    return '';
  };

  const getStepTime = (stepName) => {
    if (stepName === 'Requested') return formatCleanTime(cr.submittedAt || cr.createdAt);
    if (stepName === 'Manager Review') return hasManagerApproved ? formatCleanTime(cr.customFieldValues?.managerApprovedAt) : '';
    if (stepName === 'Approved') return (isApproved || isImplemented) ? (formatCleanTime(cr.decidedAt || cr.approvedAt || cr.updatedAt)) : '';
    if (stepName === 'Rejected') return isRejected ? (formatCleanTime(cr.closedAt || cr.decidedAt || cr.updatedAt)) : '';
    if (stepName === 'Implemented') return isImplemented ? (formatCleanTime(cr.closedAt || cr.implementedAt || cr.updatedAt)) : '';
    return '';
  };

  const getStepTooltipInfo = (stepName) => {
    const sDate = getStepDate(stepName);
    const sTime = getStepTime(stepName);
    if (stepName === 'Requested') {
      return {
        title: 'Submitted Request',
        author: cr.employeeName || cr.requester || 'Requester',
        comment: cr.justification || 'Change request submitted for review.',
        date: sDate
      };
    }
    if (stepName === 'Manager Review') {
      return {
        title: 'Reporting Manager Review',
        author: cr.customFieldValues?.managerApprovedBy || cr.managerName || 'Manager',
        comment: cr.customFieldValues?.managerApprovedComment || (hasManagerApproved ? 'Manager approved and endorsed change.' : 'Awaiting reporting manager review.'),
        date: sDate
      };
    }
    if (stepName === 'Approved') {
      const approvalComment =
        cr.approvedComment ||
        cr.approved_comment ||
        cr.approvalRationale ||
        cr.approval_rationale ||
        ([...commentsList].reverse().find(c => {
          const act = (c.action || c.type || c.decision || '').toLowerCase();
          return act === 'approved' || act === 'approve';
        })?.text) ||
        (Array.isArray(cr.approvals) ? cr.approvals.find(a => (a.decision || '').toLowerCase() === 'approved')?.rationale : null) ||
        'Change request approved during Change Manager review.';

      return {
        title: 'Change Manager Approval',
        author: cr.approvedBy || cr.decidedBy || 'Approver',
        comment: approvalComment,
        date: sDate
      };
    }
    if (stepName === 'Rejected') {
      const rejectionComment =
        cr.rejectedComment ||
        cr.rejected_comment ||
        cr.rejectionReason ||
        cr.rejection_reason ||
        cr.customFieldValues?.rejectionReason ||
        ([...commentsList].reverse().find(c => {
          const act = (c.action || c.type || c.decision || '').toLowerCase();
          return act === 'rejected' || act === 'reject';
        })?.text) ||
        (Array.isArray(cr.approvals) ? cr.approvals.find(a => (a.decision || '').toLowerCase() === 'rejected')?.rationale : null) ||
        'Change request rejected during Change Manager review.';

      return {
        title: 'Change Manager Rejection',
        author: cr.rejectedBy || cr.decidedBy || 'Approver',
        comment: rejectionComment,
        date: sDate
      };
    }
    if (stepName === 'Implemented') {
      const implComment =
        cr.implementedComment ||
        cr.implemented_comment ||
        cr.implementationComment ||
        ([...commentsList].reverse().find(c => {
          const act = (c.action || c.type || c.decision || '').toLowerCase();
          return act === 'implemented' || act === 'implement';
        })?.text) ||
        'Change implemented and verified.';

      return {
        title: 'Implementation Completed',
        author: cr.decidedBy || 'Admin',
        comment: implComment,
        date: sDate
      };
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_40px_rgba(0,0,0,0.2)]">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-7 pb-4 pt-6">
          <div>
            <h2 className="m-0 text-xl font-medium leading-[1.3] text-foreground">
              {cr.id}: {cr.title}
            </h2>
            <span className="mt-1 block text-[0.825rem] text-muted-foreground">
              {cr.category} {cr.subCategory ? `· ${cr.subCategory}` : ''}
            </span>
          </div>
          <button onClick={onClose} className="cursor-pointer border-none bg-none p-[0.2rem] text-muted-foreground">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto">

        {/* Status */}
        <div className="flex items-center gap-12 px-7 pb-2 pt-5">
          <div>
            <div className="mb-[0.4rem] text-[0.8rem] font-medium text-foreground">Status</div>
            <div
              className="inline-flex items-center gap-[0.35rem] rounded-[var(--radius-lg)] px-3 py-1 text-[0.8rem] font-medium"
              style={{ backgroundColor: statusBg, color: statusColor }}
            >
              <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: statusDot }} />
              <span>{statusLabel}</span>
            </div>
          </div>

        </div>

        {/* Rejection Rationale Display Banner */}
        {(isRejected || cr.rejectionReason || cr.rejection_reason) && (
          <div className="px-7 py-2">
            <div className="flex flex-col gap-[0.4rem] rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-5 shadow-[0_2px_6px_rgba(220,38,38,0.08)]">
              <div className="flex items-center gap-[0.45rem]">
                <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
                <span className="text-[0.775rem] font-semibold uppercase tracking-[0.05em] text-[#DC2626]">
                  Rejection Reason / Approver Comments
                </span>
              </div>
              <p className="m-0 break-words text-[0.9rem] font-medium leading-normal text-[#991B1B] [overflow-wrap:anywhere]">
                {cr.rejectionReason || cr.rejection_reason || cr.customFieldValues?.rejectionReason || 'This change request was rejected during Change Manager review.'}
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Lifecycle Visualizer with Hover Tooltips & Dates */}
        <div className="px-7 pb-7 pt-5">
          <div className="mb-6 text-[0.85rem] font-extrabold text-foreground">Lifecycle</div>
          <div className="flex w-full items-start px-2">
            {steps.map((step, idx) => {
              const isLast = idx === steps.length - 1;
              const isStepRejected = isRejected && idx === currentStepIdx;

              // Step completion checks:
              // Step 0: 'Requested' is always completed once submitted
              // Step 1: 'Manager Review' is completed only if manager approved or stage progressed beyond
              // Step 2: 'Approved' is completed only if approved or implemented
              // Step 3: 'Implemented' is completed only if implemented
              let isFinished = false;
              let isCurrentPending = false;

              if (step === 'Requested') {
                isFinished = true;
              } else if (step === 'Manager Review') {
                isFinished = hasManagerApproved || isApproved || isImplemented;
                isCurrentPending = !isFinished && !isRejected && (isStage1Pending || currentStepIdx === 1);
              } else if (step === 'Approved') {
                isFinished = isApproved || isImplemented;
                isCurrentPending = !isFinished && !isRejected && hasManagerApproved && !isStage1Pending;
              } else if (step === 'Implemented') {
                isFinished = isImplemented;
                isCurrentPending = !isFinished && !isRejected && isApproved;
              }

              // State 1 (Rejected): Red (#DC2626) with '✖'
              // State 2 (Done / Completed / Approved): Green (#10B981) with '✔'
              // State 3 (Waiting for Approval / Pending): Yellow (#FEF3C7 bg, #F59E0B border) with Amber Dot '•' (No tick)
              // State 4 (Rest / Upcoming): Greyed out (border-border, bg-card, muted text)

              const circleBg = isStepRejected
                ? '#DC2626'
                : isFinished
                ? '#10B981'
                : isCurrentPending
                ? '#FEF3C7'
                : 'var(--card-bg)';

              const circleBorder = isStepRejected
                ? 'border-[#DC2626]'
                : isFinished
                ? 'border-[#10B981]'
                : isCurrentPending
                ? 'border-[#F59E0B]'
                : 'border-border';

              const textColor = isStepRejected
                ? 'text-[#DC2626]'
                : isFinished
                ? 'text-[#059669]'
                : isCurrentPending
                ? 'text-[#D97706]'
                : 'text-[#94A3B8]';

              // Connector line color to next step
              const nextStepFinished = (idx + 1 < steps.length) && (
                steps[idx + 1] === 'Manager Review' ? (hasManagerApproved || isApproved || isImplemented)
                : steps[idx + 1] === 'Approved' ? (isApproved || isImplemented)
                : steps[idx + 1] === 'Implemented' ? isImplemented
                : false
              );
              const nextStepRejected = isRejected && (idx + 1) === currentStepIdx;
              const connectorColor = nextStepRejected
                ? '#DC2626'
                : nextStepFinished
                ? '#10B981'
                : 'var(--border-color)';

              const stepDate = isFinished ? getStepDate(step) : '';
              const stepTime = isFinished ? getStepTime(step) : '';
              const tooltipInfo = getStepTooltipInfo(step);

              const getStepLabel = () => {
                if (step === 'Requested') return 'Requested';
                if (step === 'Manager Review') return isFinished ? 'Manager Approved' : 'Manager Review';
                if (step === 'Approved') return isFinished ? 'Approved' : isCurrentPending ? 'Pending Approval' : 'Approval';
                if (step === 'Implemented') return isFinished ? 'Implemented' : isCurrentPending ? 'Pending Implementation' : 'Implementation';
                if (step === 'Rejected') return 'Rejected';
                return step;
              };

              const displayStepLabel = getStepLabel();

              return (
                <React.Fragment key={step}>
                  {/* Step Node */}
                  <div
                    onMouseEnter={() => setHoveredStepIdx(idx)}
                    onMouseLeave={() => setHoveredStepIdx(null)}
                    className={`relative z-[3] flex min-w-[100px] flex-col items-center ${isFinished ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {/* Circle Node */}
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform duration-150 [transition-timing-function:ease] ${circleBorder} ${
                        hoveredStepIdx === idx ? 'scale-[1.15]' : 'scale-100'
                      }`}
                      style={{ backgroundColor: circleBg }}
                    >
                      {isStepRejected ? (
                        <X size={18} color="#FFFFFF" strokeWidth={3} />
                      ) : isFinished ? (
                        <Check size={18} color="#FFFFFF" strokeWidth={3} />
                      ) : isCurrentPending ? (
                        <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                      ) : null}
                    </div>

                    {/* Step Title */}
                    <span className={`mt-2 text-center text-[0.825rem] font-extrabold ${textColor}`}>
                      {displayStepLabel}
                    </span>

                    {/* Step Date & Time */}
                    {stepDate && (
                      <span className={`mt-[0.2rem] text-center font-mono text-[0.725rem] font-semibold ${textColor}`}>
                        {stepDate}
                      </span>
                    )}
                    {stepTime && (
                      <span className={`mt-[0.1rem] text-center font-mono text-[0.7rem] font-medium ${textColor}`}>
                        {stepTime}
                      </span>
                    )}

                    {/* Hover Tooltip Popover (Only comment shown) */}
                    {hoveredStepIdx === idx && tooltipInfo && isFinished && (
                      <div
                        className={`absolute bottom-[115%] z-[300] w-[220px] rounded-[10px] border border-border bg-card px-[0.85rem] py-[0.65rem] pointer-events-none shadow-[0_10px_25px_rgba(0,0,0,0.25)] ${
                          idx === 0 ? 'left-0' : isLast ? 'left-auto right-0' : 'left-1/2 -translate-x-1/2'
                        }`}
                      >
                        <div className="mb-[0.3rem] border-b border-border pb-1">
                          <span
                            className={`text-[0.725rem] font-extrabold uppercase tracking-[0.04em] ${
                              isStepRejected ? 'text-[#DC2626]' : isFinished ? 'text-[#10B981]' : isCurrentPending ? 'text-[#D97706]' : 'text-foreground'
                            }`}
                          >
                            {tooltipInfo.title}
                          </span>
                        </div>
                        <p className="m-0 break-words text-[0.8rem] font-medium leading-[1.45] text-foreground [overflow-wrap:anywhere]">
                          "{tooltipInfo.comment}"
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Connector Line to Next Step (rendered ONLY if NOT the last step) */}
                  {!isLast && (
                    <div
                      className={`mt-[15px] h-[2.5px] flex-1 transition-colors duration-300 [transition-timing-function:ease] ${
                        nextStepRejected ? 'bg-[#DC2626]' : nextStepFinished ? 'bg-[#10B981]' : 'bg-border'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Section 1: Requester Details */}
        <div className="flex flex-col gap-4 border-b border-border px-7 py-5">
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-[0.9rem] font-semibold text-foreground">Section 1: Requester Details</h3>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Requester / Employee</div>
              <div className="text-[0.85rem] text-muted-foreground">{cr.employeeName || cr.requester || 'Requester'}</div>
            </div>
            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">
                {isRejected ? 'Rejected By' : isApproved || isImplemented ? 'Approved By' : 'Approver'}
              </div>
              <div className={`text-[0.85rem] font-medium ${isRejected ? 'text-[#DC2626]' : isApproved || isImplemented ? 'text-[#059669]' : 'text-muted-foreground'}`}>
                {cr.decidedBy || cr.approver || (isApproved || isImplemented || isRejected ? 'Gauri Shinde' : '—')}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Employee ID</div>
              <div className="font-mono text-[0.85rem] text-muted-foreground">{cr.employeeId || cr.empId || 'N/A'}</div>
            </div>
            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Employee Email</div>
              <div className="text-[0.85rem] text-muted-foreground">{cr.employeeEmail || cr.requesterEmail || 'N/A'}</div>
            </div>
            {(isImplemented || cr.implementedBy || cr.implementedComment) && (
              <>
                <div>
                  <div className="mb-1 text-[0.8rem] font-medium text-foreground">Implemented By</div>
                  <div className="text-[0.85rem] font-semibold text-[#7C3AED]">
                    {cr.implementedBy || cr.customFieldValues?.implementedBy || cr.decidedBy || 'Implementer'}
                  </div>
                </div>
                {Boolean(cr.implementedByEmail || cr.customFieldValues?.implementedByEmail) && (
                  <div>
                    <div className="mb-1 text-[0.8rem] font-medium text-foreground">Implementer Email</div>
                    <div className="text-[0.85rem] text-muted-foreground">
                      {cr.implementedByEmail || cr.customFieldValues?.implementedByEmail}
                    </div>
                  </div>
                )}
              </>
            )}
            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Location</div>
              <div className="text-[0.85rem] text-muted-foreground">{cr.location || 'Not specified'}</div>
            </div>
            {cr.customFieldValues?.managerName && (
              <div>
                <div className="mb-1 text-[0.8rem] font-medium text-foreground">Manager Name</div>
                <div className="text-[0.85rem] text-muted-foreground">{cr.customFieldValues.managerName}</div>
              </div>
            )}
            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Manager Email</div>
              <div className="text-[0.85rem] text-muted-foreground">{cr.managerEmail || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Section 2: Change Details */}
        <div className="flex flex-col gap-5 border-b border-border px-7 pb-3 pt-5">
          <div>
            <h3 className="m-0 text-[0.9rem] font-semibold text-foreground">Section 2: Change Details</h3>
          </div>

          {/* Core Change Request Form Fields */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <div className="col-span-full">
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Change Title</div>
              <div className="text-[0.9rem] font-semibold text-foreground">{cr.title || 'Untitled Request'}</div>
            </div>

            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Category</div>
              <div className="text-[0.85rem] text-muted-foreground">{cr.category || 'Server & Infra'}</div>
            </div>

            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Sub-category</div>
              <div className="text-[0.85rem] text-muted-foreground">{cr.subCategory || 'Server Lifecycle'}</div>
            </div>

            <div>
              <div className="mb-1 text-[0.8rem] font-medium text-foreground">Start Date</div>
              <div className="font-mono text-[0.85rem] text-muted-foreground">{formatCleanDate(cr.startDate)}</div>
            </div>
          </div>

          {/* Action-specific and Custom Form Fields */}
          {customFields.length > 0 && (
            <div className="flex flex-col gap-[0.85rem] rounded-[10px] border border-border bg-input px-5 py-[1.1rem]">
              <span className="text-[0.775rem] font-bold uppercase tracking-[0.04em] text-info">
                Action & Specification Details
              </span>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
                {customFields.map(([key, val]) => {
                  const formattedKey = key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, (str) => str.toUpperCase())
                    .replace(/Ip /g, 'IP ')
                    .replace(/Os/g, 'OS')
                    .replace(/Cpu/g, 'CPU')
                    .replace(/Ram/g, 'RAM')
                    .replace(/Kb /g, 'KB ')
                    .replace(/Cve/g, 'CVE')
                    .replace(/Vlan/g, 'VLAN');

                  return (
                    <div key={key}>
                      <div className="text-xs font-medium text-muted-foreground">
                        {formattedKey}
                      </div>
                      <div className="mt-[0.15rem] break-words text-[0.85rem] font-semibold text-foreground">
                        {String(val)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dynamic Status-Aware Dates */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-5">
            <div>
              <div className="mb-1 text-[0.8rem] font-bold text-foreground">Raised Date</div>
              <div className="font-mono text-[0.85rem] text-muted-foreground">{getStepDate('Requested') || cr.raisedDate || 'Recently'}</div>
            </div>

            {isImplemented ? (
              <>
                <div>
                  <div className="mb-1 text-[0.8rem] font-bold text-foreground">Approved Date</div>
                  <div className="font-mono text-[0.85rem] font-bold text-[#059669]">{getStepDate('Approved') || cr.approvedDate || 'Approved'}</div>
                </div>
                <div>
                  <div className="mb-1 text-[0.8rem] font-bold text-foreground">Implemented Date</div>
                  <div className="font-mono text-[0.85rem] font-bold text-[#0284C7]">{getStepDate('Implemented') || cr.implementedDate || cr.closedDate || 'Implemented'}</div>
                </div>
              </>
            ) : isApproved ? (
              <div>
                <div className="mb-1 text-[0.8rem] font-bold text-foreground">Approved Date</div>
                <div className="font-mono text-[0.85rem] font-bold text-[#059669]">{getStepDate('Approved') || cr.approvedDate || 'Approved'}</div>
              </div>
            ) : isRejected ? (
              <div>
                <div className="mb-1 text-[0.8rem] font-bold text-foreground">Rejected Date</div>
                <div className="font-mono text-[0.85rem] font-bold text-[#DC2626]">{getStepDate('Rejected') || cr.rejectedDate || cr.closedDate || 'Rejected'}</div>
              </div>
            ) : null}
          </div>

          {/* Business Justification */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-[0.35rem] text-[0.8rem] font-medium text-foreground">Business Justification</div>
              <div className="break-words text-[0.85rem] leading-[1.45] text-muted-foreground [overflow-wrap:anywhere]">
                {cr.justification || 'No business justification provided.'}
              </div>
            </div>
          </div>
        </div>

        {/* Action Confirmation Modal Popup (Approve / Reject / Implement) */}
        {actionPrompt && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/65 p-4">
            <div
              className="flex w-full max-w-[500px] flex-col gap-4 rounded-2xl border bg-card px-7 py-6 shadow-[0_25px_50px_rgba(0,0,0,0.4)]"
              style={{ borderColor: actionPrompt.color === '#DC2626' ? '#FCA5A5' : 'var(--border-color)' }}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="m-0 text-[1.05rem] font-extrabold" style={{ color: actionPrompt.color }}>
                    {actionPrompt.title}
                  </h3>
                  <span className="whitespace-nowrap rounded-[5px] border border-[#CBD5E1] bg-[#F1F5F9] px-2 py-[0.15rem] text-[0.725rem] font-semibold text-[#64748B]">
                    Visible to all
                  </span>
                </div>
                <p className="m-0 mt-[0.35rem] text-[0.825rem] leading-[1.4] text-muted-foreground">
                  {actionPrompt.action === 'implement'
                    ? 'A comment explaining what has been done'
                    : actionPrompt.action === 'reject'
                    ? 'Please provide the reason for rejection.'
                    : 'A comment explaining what has been done'}
                </p>
              </div>

              <textarea
                rows={4}
                placeholder="Enter comment..."
                value={actionCommentInput}
                onChange={(e) => {
                  setActionCommentInput(e.target.value);
                  if (actionCommentError) setActionCommentError('');
                }}
                className={`w-full resize-y rounded-[10px] border bg-input px-[0.95rem] py-3 text-sm text-foreground outline-none ${
                  actionCommentError ? 'border-[#DC2626]' : 'border-border'
                }`}
              />

              {actionCommentError && (
                <span className="text-[0.8rem] font-bold text-[#DC2626]">
                  {actionCommentError}
                </span>
              )}

              <div className="mt-1 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActionPrompt(null);
                    setActionCommentInput('');
                    setActionCommentError('');
                  }}
                  className="h-[34px] cursor-pointer rounded-md border border-border bg-card px-3.5 py-1.5 text-[0.8rem] font-semibold text-foreground transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!actionCommentInput.trim()) {
                      setActionCommentError('Please enter a comment.');
                      return;
                    }
                    const commentText = actionCommentInput.trim();
                    if (actionPrompt.action === 'approve' && onApprove) {
                      cr.approvedComment = commentText;
                      cr.approvedBy = currentUser.name || 'Approver';
                      onApprove(cr.id, commentText);
                    } else if (actionPrompt.action === 'reject' && onReject) {
                      cr.rejectedComment = commentText;
                      cr.rejectionReason = commentText;
                      cr.rejectedBy = currentUser.name || 'Approver';
                      onReject(cr.id, commentText);
                    } else if (actionPrompt.action === 'implement' && onImplement) {
                      cr.implementedComment = commentText;
                      onImplement(cr.id, commentText);
                    }
                    setActionPrompt(null);
                    setActionCommentInput('');
                    onClose();
                  }}
                  className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded-md border-none px-3.5 py-1.5 text-[0.8rem] font-bold text-white shadow-sm transition-opacity"
                  style={{ backgroundColor: actionPrompt.color }}
                >
                  {actionPrompt.action === 'approve'
                    ? 'Approve'
                    : actionPrompt.action === 'implement'
                    ? 'Implement'
                    : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        )}

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border bg-card px-7 pb-6 pt-4">
            <button onClick={onClose} className="cursor-pointer rounded-lg border border-border bg-card px-[1.1rem] py-[0.55rem] text-[0.825rem] font-semibold text-foreground">Close</button>

            {canAct ? (
              <>
                {onReject && (
                  <button onClick={() => { setActionPrompt({ action: 'reject', title: 'Reject Change Request', color: '#DC2626' }); setActionCommentInput(''); }} className="cursor-pointer rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-[1.1rem] py-[0.55rem] text-[0.825rem] font-bold text-[#DC2626]">Reject</button>
                )}
                {onApprove && (
                  <button onClick={() => { setActionPrompt({ action: 'approve', title: 'Approve Change Request', color: '#0D9488' }); setActionCommentInput(''); }} className="cursor-pointer rounded-lg border-none bg-[#0D9488] px-5 py-[0.55rem] text-[0.825rem] font-bold text-white shadow-[0_1px_3px_rgba(13,148,136,0.2)]">Approve</button>
                )}
              </>
            ) : isApproved && canMarkImplemented && !isSelfRequest ? (
              <button
                onClick={() => {
                  setActionPrompt({ action: 'implement', title: 'Mark as Implemented', color: '#0D9488' });
                  setActionCommentInput('');
                }}
                className="cursor-pointer rounded-lg border-none bg-primary px-5 py-[0.55rem] text-[0.825rem] font-medium text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
              >
                Mark as Implemented
              </button>
            ) : (
              <span
                className={`inline-flex items-center gap-[0.35rem] rounded-lg border px-[0.95rem] py-[0.45rem] text-[0.8rem] font-semibold ${
                  (isApproved || isImplemented)
                    ? 'border-[#A7F3D0] bg-[#D1FAE5] text-[#059669]'
                    : isRejected
                    ? 'border-[#FCA5A5] bg-[#FEE2E2] text-[#DC2626]'
                    : 'border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]'
                }`}
              >
                {(isApproved || isImplemented)
                  ? 'Approved'
                  : isRejected
                  ? 'Rejected'
                  : 'Pending'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
