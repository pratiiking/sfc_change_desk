import React, { useState } from 'react';
import { X, IndianRupee, FileText, CheckCircle2, Clock, XCircle, Building2, Calendar, AlertTriangle, ShieldCheck, Check } from 'lucide-react';
import { ROLE } from '../../lib/permissions.lib';

const money = (value) => Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

const formatCleanDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return String(d);
  }
};

const formatCleanTime = (d) => {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export default function PreSpendDetailsModal({ item, onClose, onApprove, onReject, user }) {
  if (!item) return null;

  const [actionPrompt, setActionPrompt] = useState(null); // 'approve' | 'reject'
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [hoveredStepIdx, setHoveredStepIdx] = useState(null);

  const roleName = (user?.role || '').toLowerCase();
  const roleId = user?.roleId || '';
  const rawRoleIds = Array.isArray(user?.rolesList) ? user.rolesList : [];
  const isSuperAdmin = Boolean(user?.isSuperAdmin || roleId === ROLE.SUPER_ADMIN || rawRoleIds.includes(ROLE.SUPER_ADMIN) || roleName.includes('super'));
  const isBoardUser = Boolean(user?.isBoardMember || roleId === 'role-board' || roleId === ROLE.BOARD || rawRoleIds.includes(ROLE.BOARD) || rawRoleIds.includes('role-board') || roleName.includes('board'));
  const isPreSpendAdmin = Boolean(user?.isPreSpendAdmin || roleId === ROLE.PRESPEND_ADMIN || rawRoleIds.includes(ROLE.PRESPEND_ADMIN) || (roleName.includes('admin') && (roleName.includes('spend') || roleName.includes('prespend'))));

  const status = item.status || 'Pending Approval';
  const isApproved = status.toLowerCase().includes('approved') || status.toLowerCase().includes('procured');
  const isRejected = status.toLowerCase().includes('rejected');
  const isPending = !isApproved && !isRejected;

  const isStage1Pending = item.approvalStage === 'manager_review' && isPending;
  const hasManagerApproved = item.approvalStage === 'stage_2_review' || (Array.isArray(item.approvalHistory) && item.approvalHistory.some(h => (h.decision || '').toLowerCase().includes('manager approved') || (h.action || '').toLowerCase().includes('manager approved')));

  const canActOnModal = isPending && !isStage1Pending && (isBoardUser || isSuperAdmin);

  const statusLabel = isRejected
    ? (item.rejectionReason?.includes('Manager') ? 'Rejected by Manager' : 'Rejected')
    : isApproved
      ? 'Approved'
      : isStage1Pending
        ? 'Waiting for manager review'
        : hasManagerApproved
          ? 'Manager approved'
          : status;

  const statusBadgeClass = isApproved
    ? 'bg-[#F5F3FF] text-[#7C3AED]'
    : isRejected
      ? 'bg-[#FEF2F2] text-[#DC2626]'
      : 'bg-[#FEF3C7] text-[#D97706]';
  const statusDotClass = isApproved ? 'bg-[#8B5CF6]' : isRejected ? 'bg-[#EF4444]' : 'bg-[#F59E0B]';

  const steps = isRejected
    ? ['Requested', 'Rejected']
    : ['Requested', 'Manager Review', 'Approved'];

  const currentStepIdx = isRejected ? 1 : isApproved ? 2 : hasManagerApproved ? 1 : 0;

  const getStepDate = (stepName) => {
    const todayFormatted = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (stepName === 'Requested') return item.raisedDate || (item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : todayFormatted));
    if (stepName === 'Manager Review') {
      const mgrEvt = Array.isArray(item.approvalHistory) ? item.approvalHistory.find(h => (h.decision || '').toLowerCase().includes('manager approved') || (h.action || '').toLowerCase().includes('manager approved')) : null;
      return mgrEvt ? new Date(mgrEvt.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (hasManagerApproved ? todayFormatted : '');
    }
    if (stepName === 'Approved') return isApproved ? (item.decidedAt ? new Date(item.decidedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : todayFormatted)) : '';
    if (stepName === 'Rejected') return isRejected ? (item.decidedAt ? new Date(item.decidedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : todayFormatted)) : '';
    return '';
  };

  const getStepTime = (stepName) => {
    if (stepName === 'Requested') return formatCleanTime(item.submittedAt || item.createdAt);
    if (stepName === 'Manager Review') {
      const mgrEvt = Array.isArray(item.approvalHistory) ? item.approvalHistory.find(h => (h.decision || '').toLowerCase().includes('manager approved') || (h.action || '').toLowerCase().includes('manager approved')) : null;
      return mgrEvt ? formatCleanTime(mgrEvt.timestamp) : '';
    }
    if (stepName === 'Approved') return isApproved ? formatCleanTime(item.decidedAt || item.approvedAt || item.updatedAt) : '';
    if (stepName === 'Rejected') return isRejected ? formatCleanTime(item.decidedAt || item.closedAt || item.updatedAt) : '';
    return '';
  };

  const getStepTooltipInfo = (stepName) => {
    const sDate = getStepDate(stepName);
    if (stepName === 'Requested') {
      return {
        title: 'Submitted Pre-Spend Request',
        author: item.employeeName || item.requesterName || item.requester || 'Requester',
        comment: item.justification || item.buying || 'Pre-spend requisition submitted.',
        date: sDate
      };
    }
    if (stepName === 'Manager Review') {
      const mgrEvt = Array.isArray(item.approvalHistory) ? item.approvalHistory.find(h => (h.decision || '').toLowerCase().includes('manager approved') || (h.action || '').toLowerCase().includes('manager approved')) : null;
      return {
        title: 'Reporting Manager Review',
        author: mgrEvt?.actorName || item.managerName || 'Manager',
        comment: mgrEvt?.comment || (hasManagerApproved ? 'Manager approved and endorsed requisition.' : 'Awaiting reporting manager review.'),
        date: sDate
      };
    }
    if (stepName === 'Approved') {
      return {
        title: 'Board Member Approval',
        author: item.decidedBy || item.approvedBy || 'Board Member',
        comment: item.approvedComment || item.approvalComment || item.comment || 'Requisition authorized by Board.',
        date: sDate
      };
    }
    if (stepName === 'Rejected') {
      return {
        title: 'Pre-Spend Rejected',
        author: item.decidedBy || item.approvedBy || 'Approver',
        comment: item.rejectedComment || item.rejectionReason || item.comment || 'Requisition rejected.',
        date: sDate
      };
    }
    return null;
  };

  const vendors = Array.isArray(item.vendors) ? item.vendors.filter(v => v && (v.name || v.amount)) : [];
  const commercial = item.commercial || {};

  const handleActionSubmit = async () => {
    if (!actionPrompt) return;
    setIsSubmittingAction(true);
    try {
      if (actionPrompt === 'approve' && onApprove) {
        await onApprove(item.id, 'approve', commentInput.trim());
      } else if (actionPrompt === 'reject' && onReject) {
        await onReject(item.id, 'reject', commentInput.trim());
      }
      onClose();
    } catch (err) {
      console.error('Error processing pre-spend action:', err);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] box-border flex h-screen w-screen items-center justify-center bg-[rgba(15,23,42,0.65)] p-5 backdrop-blur-[3px]">
      <div className="flex w-full max-w-[780px] max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-7 py-5">
          <div className="flex items-center gap-[0.85rem]">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#EFF6FF] text-[#2563EB]">
              <IndianRupee size={20} />
            </div>
            <div>
              <div className="flex items-center gap-[0.6rem]">
                <h2 className="m-0 text-[1.15rem] font-bold text-foreground">
                  Pre-Spend Requisition
                </h2>
                <span className="rounded-md bg-[#EFF6FF] px-2 py-[0.15rem] text-[0.825rem] font-semibold text-primary font-[var(--font-mono)]">
                  {item.requestCode || item.id}
                </span>
              </div>
              <p className="mt-[0.2rem] mb-0 text-[0.8rem] text-muted-foreground">
                Financial purchase approval and quotation audit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center gap-[0.35rem] rounded-full px-3 py-1 text-[0.775rem] font-semibold ${statusBadgeClass}`}>
              <span className={`h-[6px] w-[6px] rounded-full ${statusDotClass}`} />
              <span>{status}</span>
            </div>

            <button
              onClick={onClose}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-transparent text-muted-foreground"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-7 py-6">

          {/* Section 1: Item & Amount Spotlight */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-input p-5">
            <div className="flex-1">
              <span className="text-[0.75rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Item / Buying Requirement
              </span>
              <h3 className="mx-0 mt-[0.3rem] mb-2 text-[1.1rem] font-bold leading-[1.4] text-foreground">
                {item.itemDescription || item.buying || item.title}
              </h3>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-[#E2E8F0] px-[0.6rem] py-[0.2rem] text-[0.775rem] font-semibold text-[#334155]">
                  {item.category}
                </span>
                {item.subcategory && (
                  <span className="rounded-md border border-border bg-white px-[0.6rem] py-[0.2rem] text-[0.775rem] font-medium text-muted-foreground">
                    {item.subcategory}
                  </span>
                )}
                {item.isUrgent && (
                  <span className="inline-flex items-center gap-[0.3rem] rounded-md border border-[#FECACA] bg-[#FEF2F2] px-[0.6rem] py-[0.2rem] text-[0.775rem] font-bold text-[#DC2626]">
                    <AlertTriangle size={12} /> Urgent Requisition
                  </span>
                )}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <span className="text-[0.75rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Estimated Amount
              </span>
              <div className="mt-[0.2rem] text-[1.45rem] font-extrabold text-[#059669]">
                {money(item.estimatedAmount || item.amount)}
              </div>
            </div>
          </div>

          {/* Lifecycle Visualizer (Requested -> Approved / Rejected) */}
          <div className="rounded-xl border border-border bg-input px-6 py-5">
            <div className="mb-5 text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
              Lifecycle
            </div>
            <div className="flex w-full items-start px-2">
              {steps.map((step, idx) => {
                const isLast = idx === steps.length - 1;
                const isStepRejected = isRejected && idx === currentStepIdx;

                // Step completion logic:
                // Step 0: 'Requested' is always completed
                // Step 1: 'Manager Review' is completed if hasManagerApproved or isApproved
                // Step 2: 'Approved' is completed if isApproved
                let isFinished = false;
                let isCurrentPending = false;

                if (step === 'Requested') {
                  isFinished = true;
                } else if (step === 'Manager Review') {
                  isFinished = hasManagerApproved || isApproved;
                  isCurrentPending = !isFinished && !isRejected && (isStage1Pending || currentStepIdx === 1);
                } else if (step === 'Approved') {
                  isFinished = isApproved;
                  isCurrentPending = !isFinished && !isRejected && hasManagerApproved;
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

                const nextStepFinished = (idx + 1 < steps.length) && (
                  steps[idx + 1] === 'Manager Review' ? (hasManagerApproved || isApproved)
                  : steps[idx + 1] === 'Approved' ? isApproved
                  : false
                );
                const nextStepRejected = isRejected && (idx + 1) === currentStepIdx;
                const connectorBgClass = nextStepRejected
                  ? 'bg-[#DC2626]'
                  : nextStepFinished
                  ? 'bg-[#10B981]'
                  : 'bg-border';

                const getStepLabel = () => {
                  if (step === 'Requested') return 'Requested';
                  if (step === 'Manager Review') return isFinished ? 'Manager Approved' : 'Manager Review';
                  if (step === 'Approved') return isFinished ? 'Approved' : isCurrentPending ? 'Pending Approval' : 'Approval';
                  if (step === 'Rejected') return 'Rejected';
                  return step;
                };

                const displayStepLabel = getStepLabel();
                const stepDate = isFinished ? getStepDate(step) : '';
                const stepTime = isFinished ? getStepTime(step) : '';
                const tooltipInfo = getStepTooltipInfo(step);

                return (
                  <React.Fragment key={step}>
                    <div
                      onMouseEnter={() => setHoveredStepIdx(idx)}
                      onMouseLeave={() => setHoveredStepIdx(null)}
                      className={`relative z-[3] flex min-w-[100px] flex-col items-center ${isFinished ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform duration-150 ease-[ease] ${circleBorder} ${
                          hoveredStepIdx === idx ? 'scale-[1.15]' : 'scale-100'
                        }`}
                        style={{ backgroundColor: circleBg }}
                      >
                        {isStepRejected ? (
                          <X size={18} strokeWidth={3} className="text-white" />
                        ) : isFinished ? (
                          <Check size={18} strokeWidth={3} className="text-white" />
                        ) : isCurrentPending ? (
                          <span className="h-2 w-2 rounded-full bg-[#F59E0B]" />
                        ) : null}
                      </div>

                      <span className={`mt-2 text-center text-[0.825rem] font-extrabold ${textColor}`}>
                        {displayStepLabel}
                      </span>

                      {stepDate && (
                        <span className={`mt-[0.2rem] text-center text-[0.725rem] font-semibold font-[var(--font-mono)] ${textColor}`}>
                          {stepDate}
                        </span>
                      )}
                      {stepTime && (
                        <span className={`mt-[0.1rem] text-center text-[0.7rem] font-medium font-[var(--font-mono)] ${textColor}`}>
                          {stepTime}
                        </span>
                      )}

                      {hoveredStepIdx === idx && tooltipInfo && isFinished && (
                        <div
                          className={`pointer-events-none absolute bottom-[115%] z-[300] w-[220px] rounded-[10px] border border-border bg-card px-[0.85rem] py-[0.65rem] shadow-[0_10px_25px_rgba(0,0,0,0.25)] ${
                            idx === 0 ? 'left-0' : isLast ? 'right-0 left-auto' : 'left-1/2 -translate-x-1/2'
                          }`}
                        >
                          <div className="mb-[0.3rem] border-b border-border pb-1">
                            <span className={`text-[0.725rem] font-extrabold uppercase tracking-[0.04em] ${textColor}`}>
                              {tooltipInfo.title}
                            </span>
                          </div>
                          <p className="m-0 break-words text-[0.8rem] font-medium leading-[1.45] text-foreground [overflow-wrap:anywhere]">
                            "{tooltipInfo.comment}"
                          </p>
                        </div>
                      )}
                    </div>

                    {!isLast && (
                      <div className={`mt-[15px] h-[2.5px] flex-1 transition-colors duration-300 ease-[ease] ${connectorBgClass}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Section 2: Requisition Details */}
          <div>
            <h4 className="m-0 mb-[0.85rem] text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
              Requester &amp; Requisition Details
            </h4>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <div>
                <div className="text-[0.775rem] text-muted-foreground">Requester</div>
                <div className="mt-[0.15rem] text-[0.875rem] font-semibold text-foreground">
                  {item.employeeName || item.requesterName || item.requester || '—'}
                </div>
                {(item.employeeEmail || item.requesterEmail) && (
                  <div className="mt-[0.1rem] text-[0.75rem] text-muted-foreground font-[var(--font-mono)]">
                    {item.employeeEmail || item.requesterEmail}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[0.775rem] text-muted-foreground">
                  {isRejected ? 'Rejected By' : isApproved ? 'Approved By' : 'Approver'}
                </div>
                <div className={`mt-[0.15rem] text-[0.875rem] font-semibold ${isRejected ? 'text-[#DC2626]' : isApproved ? 'text-[#059669]' : 'text-foreground'}`}>
                  {item.decidedBy || item.approvedBy || (isApproved ? 'Approved' : isRejected ? 'Rejected' : '—')}
                </div>
                {(item.decidedByEmail || item.approvedByEmail) && (
                  <div className="mt-[0.1rem] text-[0.75rem] text-muted-foreground font-[var(--font-mono)]">
                    {item.decidedByEmail || item.approvedByEmail}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[0.775rem] text-muted-foreground">Requested On</div>
                <div className="mt-[0.15rem] text-[0.875rem] font-semibold text-foreground font-[var(--font-mono)]">
                  {item.raisedDate || (item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'))}
                </div>
              </div>

              <div>
                <div className="text-[0.775rem] text-muted-foreground">Location</div>
                <div className="mt-[0.15rem] text-[0.875rem] font-semibold text-foreground">
                  {item.location || '—'}
                </div>
              </div>

              <div>
                <div className="text-[0.775rem] text-muted-foreground">Needed By Date</div>
                <div className="mt-[0.15rem] text-[0.875rem] font-semibold text-foreground font-[var(--font-mono)]">
                  {formatCleanDate(item.neededByDate || item.neededBy)}
                </div>
              </div>
            </div>
          </div>

          {/* Business Justification */}
          <div>
            <h4 className="m-0 mb-2 text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
              Business Justification
            </h4>
            <div className="rounded-lg border border-border bg-input px-4 py-[0.85rem] text-[0.85rem] leading-normal text-foreground">
              {item.justification || item.businessJustification || 'No justification provided.'}
            </div>
          </div>

          {/* Section 3: Vendors & Quotations */}
          <div>
            <h4 className="m-0 mb-3 text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
              Vendors &amp; Quotations ({vendors.length})
            </h4>
            {vendors.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full border-collapse text-left text-[0.825rem]">
                  <thead>
                    <tr className="border-b border-border bg-input">
                      <th className="px-[0.85rem] py-[0.65rem] font-semibold text-muted-foreground">Vendor</th>
                      <th className="px-[0.85rem] py-[0.65rem] font-semibold text-muted-foreground">Quoted Amount</th>
                      <th className="px-[0.85rem] py-[0.65rem] font-semibold text-muted-foreground">Quote Date</th>
                      <th className="px-[0.85rem] py-[0.65rem] font-semibold text-muted-foreground">Quotation Document</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((v, i) => {
                      const docSrc = v.fileData || v.fileUrl || (typeof v.file === 'string' ? v.file : null);
                      const hasDoc = Boolean(docSrc || v.fileName);
                      return (
                        <tr key={i} className={i < vendors.length - 1 ? 'border-b border-border' : ''}>
                          <td className="px-[0.85rem] py-[0.65rem] font-semibold text-foreground">
                            <div className="flex items-center gap-[0.4rem]">
                              <span>{v.name || `Vendor ${i + 1}`}</span>
                              {i === 0 && (
                                <span className="rounded bg-[#E6F4EA] px-[0.4rem] py-[0.1rem] text-[0.65rem] font-bold text-[#137333]">
                                  Primary
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-[0.85rem] py-[0.65rem] font-semibold text-[#059669]">{v.amount ? money(v.amount) : '—'}</td>
                          <td className="px-[0.85rem] py-[0.65rem] text-muted-foreground font-[var(--font-mono)]">{formatCleanDate(v.date)}</td>
                          <td className="px-[0.85rem] py-[0.65rem]">
                            {hasDoc ? (
                              <button
                                type="button"
                                title="View attached quotation"
                                onClick={() => {
                                  if (docSrc) {
                                    if (docSrc.startsWith('data:')) {
                                      try {
                                        const parts = docSrc.split(';base64,');
                                        const contentType = parts[0].replace('data:', '') || 'application/pdf';
                                        const raw = window.atob(parts[1]);
                                        const uInt8Array = new Uint8Array(raw.length);
                                        for (let j = 0; j < raw.length; ++j) {
                                          uInt8Array[j] = raw.charCodeAt(j);
                                        }
                                        const blob = new Blob([uInt8Array], { type: contentType });
                                        const blobUrl = URL.createObjectURL(blob);
                                        window.open(blobUrl, '_blank');
                                      } catch {
                                        window.open(docSrc, '_blank');
                                      }
                                    } else {
                                      window.open(docSrc, '_blank');
                                    }
                                  } else {
                                    alert(`Quotation document: ${v.fileName}`);
                                  }
                                }}
                                className="inline-flex cursor-pointer items-center gap-[0.35rem] rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-[0.6rem] py-1 text-[0.75rem] font-semibold text-[#1D4ED8]"
                              >
                                <FileText size={12} />
                                <span className="max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">
                                  {v.fileName || 'View PDF'}
                                </span>
                              </button>
                            ) : (
                              <span className="text-[0.75rem] text-muted-foreground">None attached</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-[0.825rem] italic text-muted-foreground">
                No vendor quotes attached.
              </div>
            )}
          </div>

          {/* Section 4: Commercial Reason & Exceptions */}
          {(commercial.exception || commercial.reason || commercial.justification) && (
            <div>
              <h4 className="m-0 mb-2 text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
                Commercial Evaluation &amp; Exception
              </h4>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 rounded-lg border border-border bg-input px-4 py-[0.85rem]">
                {commercial.exception && (
                  <div>
                    <div className="text-[0.75rem] text-muted-foreground">Exception Type</div>
                    <div className="text-[0.825rem] font-semibold text-foreground">{commercial.exception}</div>
                  </div>
                )}
                {commercial.reason && (
                  <div>
                    <div className="text-[0.75rem] text-muted-foreground">Commercial Reason</div>
                    <div className="text-[0.825rem] font-semibold text-foreground">{commercial.reason}</div>
                  </div>
                )}
                {commercial.justification && (
                  <div className="col-span-full">
                    <div className="text-[0.75rem] text-muted-foreground">Commercial Justification</div>
                    <div className="mt-[0.15rem] text-[0.825rem] text-foreground">{commercial.justification}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Decision / Approval History Section */}
          {(isApproved || isRejected || item.approvedComment || item.rejectedComment || item.rejectionReason || (Array.isArray(item.comments) && item.comments.length > 0) || (Array.isArray(item.approvalHistory) && item.approvalHistory.length > 0)) && (
            <div
              className={`flex flex-col gap-[0.65rem] rounded-[10px] border px-5 py-4 ${
                isApproved ? 'border-[#A7F3D0] bg-[#ECFDF5]' : isRejected ? 'border-[#FECACA] bg-[#FEF2F2]' : 'border-border bg-input'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className={isApproved ? 'text-[#059669]' : isRejected ? 'text-[#DC2626]' : 'text-foreground'} />
                  <span className={`text-[0.825rem] font-bold uppercase tracking-[0.03em] ${isApproved ? 'text-[#065F46]' : isRejected ? 'text-[#991B1B]' : 'text-foreground'}`}>
                    {isApproved ? 'Approved & Authorized' : isRejected ? 'Rejected Decision' : 'Review History'}
                  </span>
                </div>
                {(item.approvedDate || item.closedDate) && (
                  <span className="text-[0.75rem] text-muted-foreground font-[var(--font-mono)]">
                    {item.approvedDate || item.closedDate}
                  </span>
                )}
              </div>

              {(item.decidedBy || item.approvedBy) && (
                <div className="text-[0.825rem] font-semibold text-foreground">
                  Decision by: <span className="font-bold">{item.decidedBy || item.approvedBy}</span>
                  {(item.decidedByEmail || item.approvedByEmail) && (
                    <span className="ml-[0.4rem] text-[0.75rem] font-normal text-muted-foreground font-[var(--font-mono)]">
                      ({item.decidedByEmail || item.approvedByEmail})
                    </span>
                  )}
                </div>
              )}

              {(!Array.isArray(item.comments) || item.comments.length === 0) && (item.approvedComment || item.rejectedComment || item.rejectionReason) && (
                <div className="break-words rounded-md border border-border bg-card px-[0.85rem] py-[0.65rem] text-[0.825rem] leading-[1.45] text-foreground">
                  <div className="mb-[0.2rem] text-[0.725rem] font-bold uppercase text-muted-foreground">
                    Decision Comment / Reason:
                  </div>
                  {item.approvedComment || item.rejectedComment || item.rejectionReason}
                </div>
              )}

              {/* Audit Comments Log */}
              {Array.isArray(item.comments) && item.comments.length > 0 && (
                <div className="mt-1 flex flex-col gap-2">
                  {item.comments.map((c, i) => (
                    <div key={c.id || i} className="rounded-md border border-border bg-card px-3 py-2 text-[0.8rem]">
                      <div className="mb-[0.2rem] flex justify-between text-[0.725rem] text-muted-foreground">
                        <span className="font-semibold text-foreground">{c.authorName || 'Reviewer'} ({c.authorRole || 'Approver'})</span>
                        <span className="font-[var(--font-mono)]">{c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                      </div>
                      <div className="text-foreground">{c.text || c.comment}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action Prompt (Approve/Reject comment box) */}
          {actionPrompt && (
            <div
              className={`flex flex-col gap-3 rounded-[10px] border px-5 py-4 ${
                actionPrompt === 'approve' ? 'border-[#A7F3D0] bg-[#ECFDF5]' : 'border-[#FECACA] bg-[#FEF2F2]'
              }`}
            >
              <div className={`text-[0.85rem] font-bold ${actionPrompt === 'approve' ? 'text-[#065F46]' : 'text-[#991B1B]'}`}>
                {actionPrompt === 'approve' ? 'Approve Pre-Spend Request' : 'Reject Pre-Spend Request'}
              </div>
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={actionPrompt === 'approve' ? 'Add approval note (optional)...' : 'State reason for rejection...'}
                rows={2}
                className="box-border w-full rounded-md border border-border px-3 py-2 text-[0.825rem] outline-none [font-family:inherit]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActionPrompt(null)}
                  className="cursor-pointer rounded-md border border-border bg-white px-[0.85rem] py-[0.45rem] text-[0.8rem]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleActionSubmit}
                  disabled={isSubmittingAction}
                  className={`cursor-pointer rounded-md border-0 px-4 py-[0.45rem] text-[0.8rem] font-semibold text-white ${actionPrompt === 'approve' ? 'bg-[#059669]' : 'bg-[#DC2626]'}`}
                >
                  {isSubmittingAction ? 'Processing...' : actionPrompt === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border bg-card px-7 py-4">
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-border bg-transparent px-5 py-[0.55rem] text-[0.85rem] font-semibold text-foreground"
          >
            Close
          </button>

          {canActOnModal && (onApprove || onReject) && !actionPrompt && (
            <div className="flex gap-3">
              {onReject && (
                <button
                  onClick={() => setActionPrompt('reject')}
                  className="cursor-pointer rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-5 py-[0.55rem] text-[0.85rem] font-semibold text-[#DC2626]"
                >
                  Reject
                </button>
              )}
              {onApprove && (
                <button
                  onClick={() => setActionPrompt('approve')}
                  className="cursor-pointer rounded-lg border-0 bg-[#059669] px-5 py-[0.55rem] text-[0.85rem] font-semibold text-white"
                >
                  Approve Requisition
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
