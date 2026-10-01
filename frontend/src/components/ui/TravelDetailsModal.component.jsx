import React, { useState } from 'react';
import {
  X,
  Plane,
  Car,
  Bus,
  Train,
  Building2,
  Calendar,
  Clock,
  MapPin,
  AlertTriangle,
  User,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Check
} from 'lucide-react';
import { ROLE } from '../../lib/permissions.lib';

const MODE_ICONS = {
  Flight: Plane,
  Cab: Car,
  Bus: Bus,
  Train: Train,
  Hotel: Building2
};

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

export default function TravelDetailsModal({ item, onClose, onApprove, onReject, user }) {
  if (!item) return null;

  const [actionPrompt, setActionPrompt] = useState(null); // 'approve' | 'reject'
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [hoveredStepIdx, setHoveredStepIdx] = useState(null);

  const roleName = (user?.role || '').toLowerCase();
  const roleId = user?.roleId || '';
  const isSuperAdmin = roleId === ROLE.SUPER_ADMIN || roleName.includes('super');
  const isBoardUser = roleId === 'role-board' || roleName.includes('board');
  const isTravelAdmin = roleId === ROLE.TRAVEL_ADMIN || (roleName.includes('admin') && roleName.includes('travel'));

  const status = item.status || 'Pending Approval';
  const isApproved = status.toLowerCase().includes('approved') || status.toLowerCase().includes('booked') || status.toLowerCase().includes('ticketed');
  const isRejected = status.toLowerCase().includes('rejected');
  const isPending = !isApproved && !isRejected;

  const isStage1Pending = item.approvalStage === 'manager_review' && isPending;
  const hasManagerApproved = item.approvalStage === 'stage_2_review' || (Array.isArray(item.approvalHistory) && item.approvalHistory.some(h => (h.decision || '').toLowerCase().includes('manager approved') || (h.action || '').toLowerCase().includes('manager approved')));

  const statusLabel = isRejected
    ? (item.rejectionReason?.includes('Manager') ? 'Rejected by Manager' : 'Rejected')
    : isApproved
      ? 'Approved'
      : isStage1Pending
        ? 'Waiting for manager review'
        : hasManagerApproved
          ? 'Manager approved'
          : status;

  const steps = isRejected
    ? ['Requested', 'Rejected']
    : ['Requested', 'Manager Review', 'Approved'];

  const currentStepIdx = isRejected ? 1 : isApproved ? 2 : hasManagerApproved ? 2 : 1;

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
        title: 'Submitted Travel Booking',
        author: item.employeeName || item.travellerName || item.requesterName || 'Requester',
        comment: item.purpose || item.tripReason || 'Travel reservation requested.',
        date: sDate
      };
    }
    if (stepName === 'Manager Review') {
      const mgrEvt = Array.isArray(item.approvalHistory) ? item.approvalHistory.find(h => (h.decision || '').toLowerCase().includes('manager approved') || (h.action || '').toLowerCase().includes('manager approved')) : null;
      return {
        title: 'Reporting Manager Review',
        author: mgrEvt?.actorName || item.managerName || 'Manager',
        comment: mgrEvt?.comment || (hasManagerApproved ? 'Manager approved and endorsed booking.' : 'Awaiting reporting manager review.'),
        date: sDate
      };
    }
    if (stepName === 'Approved') {
      return {
        title: 'Travel Booking Approved',
        author: item.decidedBy || item.approvedBy || 'Approver',
        comment: item.approvedComment || item.approvalComment || item.comment || 'Travel booking authorized.',
        date: sDate
      };
    }
    if (stepName === 'Rejected') {
      return {
        title: 'Travel Booking Rejected',
        author: item.decidedBy || item.approvedBy || 'Approver',
        comment: item.rejectedComment || item.rejectionReason || item.comment || 'Travel booking rejected.',
        date: sDate
      };
    }
    return null;
  };

  // Short notice flight rule: strictly ONLY Board members can approve/reject short notice flights
  const isShortNoticeFlight = Boolean(item.isShortNotice);
  const canActOnModal = isPending && !isStage1Pending && (
    isShortNoticeFlight
      ? isBoardUser // Strictly Board only (disabled for Super Admin & Travel Admin)
      : (isTravelAdmin || isBoardUser || isSuperAdmin)
  );

  const statusBadgeClass = isApproved
    ? 'bg-[#F5F3FF] text-[#7C3AED]'
    : isRejected
      ? 'bg-[#FEF2F2] text-[#DC2626]'
      : isShortNoticeFlight
        ? 'bg-[#FEF2F2] text-[#DC2626]'
        : 'bg-[#FEF3C7] text-[#D97706]';
  const statusDotClass = isApproved
    ? 'bg-[#8B5CF6]'
    : isRejected
      ? 'bg-[#EF4444]'
      : isShortNoticeFlight
        ? 'bg-[#EF4444]'
        : 'bg-[#F59E0B]';

  const mode = item.travelMode || item.category || 'Flight';
  const IconComponent = MODE_ICONS[mode] || Plane;
  const booking = item.bookingDetails || {};

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
      console.error('Error processing travel action:', err);
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
              <IconComponent size={20} />
            </div>
            <div>
              <div className="flex items-center gap-[0.6rem]">
                <h2 className="m-0 text-[1.15rem] font-bold text-foreground">
                  Travel Booking Details
                </h2>
                <span className="rounded-md bg-[#EFF6FF] px-2 py-[0.15rem] text-[0.825rem] font-semibold text-primary font-[var(--font-mono)]">
                  {item.requestCode || item.id}
                </span>
              </div>
              <p className="mt-[0.2rem] mb-0 text-[0.8rem] text-muted-foreground">
                {mode} reservation and itinerary review
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

          {/* Section 1: Route Spotlight */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-input p-5">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[0.725rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  {mode === 'Hotel' ? 'Location' : 'Origin'}
                </span>
                <div className="mt-[0.15rem] text-[1.1rem] font-bold text-foreground">
                  {item.fromLocation || item.toLocation || 'Not specified'}
                </div>
              </div>

              {mode !== 'Hotel' && item.toLocation && (
                <>
                  <div className="flex items-center text-muted-foreground">
                    <ArrowRight size={18} />
                  </div>
                  <div>
                    <span className="text-[0.725rem] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Destination
                    </span>
                    <div className="mt-[0.15rem] text-[1.1rem] font-bold text-foreground">
                      {item.toLocation}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-md bg-[#EFF6FF] px-[0.65rem] py-1 text-[0.775rem] font-semibold text-[#2563EB]">
                {mode} {item.tripType ? `• ${item.tripType}` : ''}
              </span>
              {item.travelClass && (
                <span className="rounded-md border border-border bg-white px-[0.65rem] py-1 text-[0.775rem] font-medium text-muted-foreground">
                  {item.travelClass}
                </span>
              )}
              {item.isShortNotice && (
                <span className="inline-flex items-center gap-[0.3rem] rounded-md border border-[#FECACA] bg-[#FEF2F2] px-[0.65rem] py-1 text-[0.775rem] font-bold text-[#DC2626]">
                  <AlertTriangle size={12} /> Short-Notice (&lt; 7d)
                </span>
              )}
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

          {/* Section 2: Traveller & Schedule Details */}
          <div>
            <h4 className="m-0 mb-[0.85rem] text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
              Traveller &amp; Schedule
            </h4>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <div>
                <div className="text-[0.775rem] text-muted-foreground">Traveller</div>
                <div className="mt-[0.15rem] text-[0.875rem] font-semibold text-foreground">
                  {item.employeeName || item.travellerName || item.requesterName || '—'}
                </div>
                {(item.employeeEmail || item.travellerEmail || item.requesterEmail) && (
                  <div className="mt-[0.1rem] text-[0.75rem] text-muted-foreground font-[var(--font-mono)]">
                    {item.employeeEmail || item.travellerEmail || item.requesterEmail}
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
                <div className="text-[0.775rem] text-muted-foreground">Department / Cost Centre</div>
                <div className="mt-[0.15rem] text-[0.875rem] font-semibold text-foreground">
                  {item.department || item.costCentre || '—'}
                </div>
              </div>

              <div>
                <div className="text-[0.775rem] text-muted-foreground">{mode === 'Hotel' ? 'Check-in Date' : 'Departure Date'}</div>
                <div className="mt-[0.15rem] text-[0.875rem] font-semibold text-foreground font-[var(--font-mono)]">
                  {formatCleanDate(item.departureDate)}
                </div>
                {item.preferredTimeSlot && (
                  <div className="text-[0.75rem] text-muted-foreground">
                    Slot: {item.preferredTimeSlot}
                  </div>
                )}
              </div>

              {item.returnDate && (
                <div>
                  <div className="text-[0.775rem] text-muted-foreground">{mode === 'Hotel' ? 'Check-out Date' : 'Return / Onward Date'}</div>
                  <div className="mt-[0.15rem] text-[0.875rem] font-semibold text-foreground font-[var(--font-mono)]">
                    {formatCleanDate(item.returnDate)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Purpose of Visit */}
          <div>
            <h4 className="m-0 mb-2 text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
              Purpose of Visit / Business Justification
            </h4>
            <div className="rounded-lg border border-border bg-input px-4 py-[0.85rem] text-[0.85rem] leading-normal text-foreground">
              {item.purpose || 'No business purpose provided.'}
            </div>
          </div>

          {/* Section 3: Multi-City Flight Legs or Extra Booking Specifications */}
          {Array.isArray(booking?.legs) && booking.legs.length > 0 ? (
            <div className="flex flex-col gap-[0.85rem]">
              <h4 className="m-0 text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
                Multi-City Flight Itinerary ({booking.legs.length} Legs)
              </h4>
              <div className="flex flex-col gap-2">
                {booking.legs.map((leg, idx) => (
                  <div
                    key={leg.id || idx}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-input px-4 py-3"
                  >
                    <div className="flex items-center gap-[0.65rem]">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[0.75rem] font-bold text-white">
                        {idx + 1}
                      </span>
                      <span className="text-[0.875rem] font-bold text-foreground">
                        {leg.from} → {leg.to}
                      </span>
                    </div>

                    <div className="flex items-center gap-5 text-[0.8rem] text-muted-foreground">
                      <div className="flex items-center gap-[0.35rem]">
                        <Calendar size={13} />
                        <span className="font-semibold text-foreground">{formatCleanDate(leg.travelDate)}</span>
                      </div>
                      {leg.preferredTime && (
                        <div className="flex items-center gap-[0.35rem]">
                          <Clock size={13} />
                          <span>{leg.preferredTime}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {Boolean(booking.returnFlightRequired) && (booking.returnLeg || booking.returnDate) && (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3"
                  >
                    <div className="flex items-center gap-[0.65rem]">
                      <span className="rounded-md bg-[#2563EB] px-2 py-[0.15rem] text-[0.75rem] font-bold text-white">
                        Return Flight
                      </span>
                      <span className="text-[0.875rem] font-bold text-[#1E3A8A]">
                        {booking.returnLeg?.from || booking.returnFrom || item.toLocation || ''} → {booking.returnLeg?.to || booking.returnTo || item.fromLocation || ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-5 text-[0.8rem] text-[#1E40AF]">
                      <div className="flex items-center gap-[0.35rem]">
                        <Calendar size={13} />
                        <span className="font-semibold">{formatCleanDate(booking.returnLeg?.travelDate || booking.returnDate || item.returnDate)}</span>
                      </div>
                      {(booking.returnLeg?.preferredTime || booking.returnPreferredTime) && (
                        <div className="flex items-center gap-[0.35rem]">
                          <Clock size={13} />
                          <span>{booking.returnLeg?.preferredTime || booking.returnPreferredTime}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : Object.keys(booking).length > 0 ? (
            <div>
              <h4 className="m-0 mb-3 text-[0.85rem] font-bold uppercase tracking-[0.04em] text-foreground">
                Booking Specifications
              </h4>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 rounded-lg border border-border bg-input px-4 py-[0.85rem]">
                {Object.entries(booking).map(([key, val]) => {
                  if (!val || typeof val === 'object' || ['Traveller', 'Department / Cost Centre', 'Purpose of visit', 'Date of travel', 'Date of journey', 'Check-in date', 'From', 'To', 'From station', 'To station', 'Trip type', 'legs', 'returnFlightRequired'].includes(key)) return null;
                  return (
                    <div key={key}>
                      <div className="text-[0.75rem] text-muted-foreground">{key}</div>
                      <div className="mt-[0.1rem] text-[0.825rem] font-semibold text-foreground">{String(val)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

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
                    {isApproved ? 'Approved & Confirmed' : isRejected ? 'Rejected Decision' : 'Review History'}
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

          {/* Short-notice Flight Board Approval Notice */}
          {isShortNoticeFlight && isPending && !isBoardUser && (
            <div className="flex items-center gap-[0.65rem] rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-[1.1rem] py-[0.85rem]">
              <AlertTriangle size={18} className="shrink-0 text-[#DC2626]" />
              <div className="text-[0.825rem] leading-[1.4] text-[#991B1B]">
                <strong>Short-Notice Flight Notice (&lt; 7 days):</strong> This flight departure is within 7 days and requires direct authorization from the <strong>Board of Directors</strong>. Travel Admin actions are restricted.
              </div>
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
                {actionPrompt === 'approve' ? 'Approve Travel Request' : 'Reject Travel Request'}
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
                  Approve Travel
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
