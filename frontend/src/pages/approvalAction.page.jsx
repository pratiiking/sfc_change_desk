import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Send, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { LoadingSpinner } from '../components/ui/primitives.component';

const formatFieldLabel = (key = '') => {
  return String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/\bIp\b/gi, 'IP')
    .replace(/\bOs\b/gi, 'OS')
    .replace(/\bCpu\b/gi, 'CPU')
    .replace(/\bRam\b/gi, 'RAM')
    .replace(/\bKb\b/gi, 'KB')
    .replace(/\bCve\b/gi, 'CVE')
    .replace(/\bVlan\b/gi, 'VLAN')
    .replace(/\bId\b/gi, 'ID')
    .trim();
};

const formatCleanTime = (d) => {
  try {
    const dt = d ? new Date(d) : new Date();
    return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toLowerCase();
  } catch {
    return '12:00:00 pm';
  }
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

const formatLongDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
};

const IGNORED_KEYS = [
  'comments',
  'approvedComment',
  'approvedBy',
  'rejectedComment',
  'rejectedBy',
  'rejectionReason',
  'rejection_reason',
  'implementedComment',
  'implementedBy',
  'employeeName',
  'employeeEmail',
  'managerEmail',
  'employeeId'
];

const getCustomFields = (cr) => {
  if (!cr) return [];
  const fields = [];
  const raw = (cr.customFieldValues && typeof cr.customFieldValues === 'object') ? cr.customFieldValues : {};

  const actionReq = raw.actionRequired || cr.actionRequired || cr.action;
  if (actionReq && typeof actionReq === 'string' && actionReq.trim()) {
    fields.push(['actionRequired', actionReq.trim()]);
  }

  for (const [k, v] of Object.entries(raw)) {
    if (k === 'actionRequired') continue;
    if (IGNORED_KEYS.includes(k)) continue;
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (typeof v === 'object') continue;
    fields.push([k, String(v).trim()]);
  }
  return fields;
};

export default function ApprovalActionPage() {
  const [token, setToken] = useState('');
  const [action, setAction] = useState('approve'); // 'approve' | 'reject' | 'implement'
  const [reqModule, setReqModule] = useState('cr'); // 'cr' | 'prespend' | 'travel'
  const [stage, setStage] = useState('');
  const [isManagerReview, setIsManagerReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [crData, setCrData] = useState(null);

  // Already Processed State
  const [isProcessed, setIsProcessed] = useState(false);
  const [processedDetails, setProcessedDetails] = useState(null);

  // Form states
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlAction = params.get('action');
    const urlModule = params.get('module') || 'cr';

    setReqModule(urlModule);

    if (urlAction && ['approve', 'reject', 'implement'].includes(urlAction.toLowerCase())) {
      setAction(urlAction.toLowerCase());
    }
    if (!urlToken) {
      setError('Missing authorization token. Please use the action link provided in your email.');
      setLoading(false);
      return;
    }

    setToken(urlToken);

    // Fetch Request details for confirmation
    const fetchDetails = async () => {
      try {
        const res = await fetch(`/api/public/change-request-action?token=${encodeURIComponent(urlToken)}&module=${encodeURIComponent(urlModule)}`);
        const body = await res.json();
        if (!res.ok || !body.success) {
          throw new Error(body.message || 'Failed to verify action token.');
        }
        setCrData(body.data?.request || body.data?.cr || null);
        if (body.data?.isManagerReview !== undefined) {
          setIsManagerReview(Boolean(body.data.isManagerReview));
        } else if (body.data?.stage || body.data?.tokenStage) {
          setIsManagerReview(body.data?.tokenStage === 'manager_review' || body.data?.stage === 'manager_review');
        }
        if (body.data?.stage || body.data?.tokenStage) {
          setStage(body.data?.tokenStage || body.data?.stage);
        }
        if (body.data?.module) {
          setReqModule(body.data.module);
        }
        if (body.data?.action && !urlAction) {
          setAction(body.data.action);
        }
        if (body.data?.isAlreadyProcessed) {
          setIsProcessed(true);
          setProcessedDetails(body.data.alreadyProcessedDetails || {});
        }
      } catch (err) {
        setError(err.message || 'Unable to load request details.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, []);

  const handleSubmitDecision = async (e) => {
    e?.preventDefault();
    if (!comment.trim()) {
      setFormError(`Please provide a comment to ${action} this request.`);
      return;
    }
    setFormError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/public/change-request-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          module: reqModule,
          action,
          comment: comment.trim()
        })
      });

      const body = await res.json();

      // 409 = the backend's row-locked recheck found someone else already
      // decided this in the moment between this page loading and this
      // submit landing (e.g. two Change Managers assigned to the same
      // category, both with the page open). Treat it the same as the
      // "already processed" path the GET-time check uses, rather than a
      // generic inline error with a still-clickable button -- there's
      // nothing left for this submission to retry.
      if (!res.ok) {
        if (res.status === 409) {
          setIsProcessed(true);
          setProcessedDetails({
            status: crData?.status || 'Processed',
            decision: crData?.status || 'Processed',
            comment: body.message
          });
          return;
        }
        throw new Error(body.message || 'Failed to record your decision.');
      }

      if (body.alreadyProcessed) {
        setIsProcessed(true);
        setProcessedDetails({
          status: crData?.status || 'Processed',
          decision: crData?.status || 'Processed',
          comment: body.message
        });
        return;
      }

      setSuccessResult({
        action,
        message: body.message,
        crId: crData?.requestCode || crData?.id
      });
    } catch (err) {
      setFormError(err.message || 'Something went wrong while submitting.');
    } finally {
      setSubmitting(false);
    }
  };

  const isApprove = action === 'approve';
  const isImplement = action === 'implement';
  const isReject = action === 'reject';
  const isPreSpend = reqModule === 'prespend';
  const isTravel = reqModule === 'travel';

  const portalTitle = isPreSpend
    ? 'Pre-Spend Authorization Portal'
    : isTravel
      ? 'Travel Desk Authorization Portal'
      : isImplement
        ? 'Change Implementation Portal'
        : 'Change Manager Authorization Portal';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] p-[2rem_1rem] [font-family:var(--font-family,Montserrat,sans-serif)]">
      {/* Header Brand Bar */}
      <div className="mb-6 text-center">
        <div className="inline-flex items-center gap-[0.65rem]">
          <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--brand-primary)] text-white">
            <ShieldCheck size={18} />
          </div>
          <span className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
            ChangeDesk
          </span>
        </div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
          {portalTitle}
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-[680px] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_10px_25px_-5px_rgba(0,0,0,0.08),0_8px_10px_-6px_rgba(0,0,0,0.04)]">
        {/* Loading State */}
        {loading && (
          <div className="p-[4rem_2rem] text-center">
            <LoadingSpinner size="lg" message="Verifying secure token and fetching request details..." />
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-[3rem_2rem] text-center">
            <div className="mb-5 inline-flex size-14 items-center justify-center rounded-full bg-[#FEE2E2] text-[#DC2626]">
              <AlertCircle size={28} />
            </div>
            <h2 className="m-0 mb-2 text-[1.2rem] font-bold text-[#0F172A]">
              Action Link Unavailable
            </h2>
            <p className="m-0 mx-auto mb-6 max-w-[420px] text-sm leading-normal text-[#64748B]">
              {error}
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-5 py-[0.65rem] text-[0.85rem] font-semibold text-white no-underline"
            >
              Go to ChangeDesk Portal
            </a>
          </div>
        )}

        {/* Success State */}
        {!loading && successResult && (
          <div className="px-8 py-14 text-center">
            <div
              className={`mb-5 inline-flex size-16 items-center justify-center rounded-full ${
                successResult.action === 'implement'
                  ? 'bg-[#CCFBF1] text-[#0D9488]'
                  : successResult.action === 'approve'
                    ? 'bg-[#D1FAE5] text-[#059669]'
                    : 'bg-[#FEE2E2] text-[#DC2626]'
              }`}
            >
              {successResult.action === 'reject' ? <XCircle size={36} /> : <CheckCircle2 size={36} />}
            </div>
            <h2 className="m-0 mb-2 text-[1.35rem] font-extrabold text-[#0F172A]">
              {successResult.action === 'implement'
                ? 'Request Implemented & Closed'
                : successResult.action === 'approve'
                  ? 'Request Approved'
                  : 'Request Rejected'}
            </h2>
            <p className="m-0 mx-auto mb-7 max-w-[440px] text-[0.9rem] leading-[1.55] text-[#475569]">
              Request <strong>{successResult.crId}</strong> has been marked as <strong>{successResult.action === 'implement' ? 'Implemented' : successResult.action === 'approve' ? 'Approved' : 'Rejected'}</strong>. The database, audit records, and notification emails have been dispatched.
            </p>
            {!isManagerReview && (
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-6 py-[0.7rem] text-sm font-semibold text-white no-underline shadow-[0_2px_5px_rgba(0,0,0,0.15)]"
              >
                <span>Go to ChangeDesk Dashboard</span>
                <ArrowRight size={16} />
              </a>
            )}
          </div>
        )}

        {/* Already Processed State */}
        {!loading && !error && !successResult && isProcessed && (
          <div className="px-8 py-14 text-center">
            <div
              className={`mb-5 inline-flex size-16 items-center justify-center rounded-full ${
                (processedDetails?.status === 'Approved' || crData?.status === 'Approved')
                  ? 'bg-[#D1FAE5] text-[#059669]'
                  : (processedDetails?.status === 'Implemented' || crData?.status === 'Implemented')
                    ? 'bg-[#CCFBF1] text-[#0D9488]'
                    : (processedDetails?.status === 'Rejected' || crData?.status === 'Rejected')
                      ? 'bg-[#FEE2E2] text-[#DC2626]'
                      : 'bg-[#FEF3C7] text-[#D97706]'
              }`}
            >
              {(processedDetails?.status === 'Rejected' || crData?.status === 'Rejected') ? <XCircle size={36} /> : <CheckCircle2 size={36} />}
            </div>
            <h2 className="m-0 mb-2 text-[1.35rem] font-extrabold text-[#0F172A]">
              {(processedDetails?.status === 'Approved' || crData?.status === 'Approved')
                ? 'Request Already Approved'
                : (processedDetails?.status === 'Implemented' || crData?.status === 'Implemented')
                  ? 'Request Already Implemented & Closed'
                  : (processedDetails?.status === 'Rejected' || crData?.status === 'Rejected')
                    ? 'Request Already Rejected'
                    : 'Request Already Processed'}
            </h2>
            <p className="m-0 mx-auto mb-6 max-w-[460px] text-[0.9rem] leading-[1.55] text-[#475569]">
              This request (<strong>{crData?.requestCode || crData?.id}</strong>) is currently in <strong>{crData?.status || processedDetails?.status || 'Finalized'}</strong> status. The action link in your email has already been executed.
            </p>

            {/* Decision Details Card */}
            {(processedDetails?.decidedBy || processedDetails?.comment || crData?.approvedComment || crData?.rejectedComment || crData?.rejectionReason) && (
              <div className="mx-auto mb-7 max-w-[480px] rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-left">
                <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.04em] text-[#0F172A]">
                  Recorded Decision Information
                </div>
                {processedDetails?.decidedBy && (
                  <div className="mb-[0.35rem] text-[0.825rem] text-[#334155]">
                    <span className="font-semibold text-[#64748B]">Processed By: </span>
                    <span className="font-bold">{processedDetails.decidedBy}</span>
                    {processedDetails.decidedByEmail && <span className="text-[#64748B]"> ({processedDetails.decidedByEmail})</span>}
                  </div>
                )}
                {processedDetails?.timestamp && (
                  <div className="mb-[0.35rem] text-[0.825rem] text-[#334155]">
                    <span className="font-semibold text-[#64748B]">Timestamp: </span>
                    <span>{formatLongDate(processedDetails.timestamp)} at {formatCleanTime(processedDetails.timestamp)}</span>
                  </div>
                )}
                {(processedDetails?.comment || crData?.approvedComment || crData?.rejectedComment || crData?.rejectionReason) && (
                  <div className="mt-2 border-t border-dashed border-[#CBD5E1] pt-2 text-[0.825rem] text-[#334155]">
                    <span className="font-semibold text-[#64748B]">Note / Comment: </span>
                    <span className="italic text-[#0F172A]">"{processedDetails?.comment || crData?.approvedComment || crData?.rejectedComment || crData?.rejectionReason}"</span>
                  </div>
                )}
              </div>
            )}

            <div className="mb-7 inline-flex items-center gap-[0.45rem] rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-[0.6rem] text-[0.8rem] font-semibold text-[#1E40AF]">
              <span>ℹ Form submission is disabled as no further action is required.</span>
            </div>

            {!isManagerReview && (
              <div>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-6 py-[0.7rem] text-sm font-semibold text-white no-underline shadow-[0_2px_5px_rgba(0,0,0,0.15)]"
                >
                  <span>Go to ChangeDesk Dashboard</span>
                  <ArrowRight size={16} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Action Decision Form */}
        {!loading && !error && !successResult && !isProcessed && crData && (
          <div>
            {/* Top Banner indicating current action */}
            <div
              className={`flex flex-wrap items-center justify-between gap-3 px-7 py-5 ${
                isImplement
                  ? 'border-b border-[#99F6E4] bg-[#F0FDFA]'
                  : isApprove
                    ? 'border-b border-[#BBF7D0] bg-[#F0FDF4]'
                    : 'border-b border-[#FECACA] bg-[#FEF2F2]'
              }`}
            >
              <div className="flex items-center gap-[0.65rem]">
                <div
                  className={`flex size-8 items-center justify-center rounded-full ${
                    isImplement ? 'bg-[#CCFBF1] text-[#0D9488]' : isApprove ? 'bg-[#DCFCE7] text-[#059669]' : 'bg-[#FEE2E2] text-[#DC2626]'
                  }`}
                >
                  {isReject ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                </div>
                <div>
                  <h3 className={`m-0 text-base font-bold ${isImplement ? 'text-[#115E59]' : isApprove ? 'text-[#166534]' : 'text-[#991B1B]'}`}>
                    {isImplement ? 'Mark Request as Implemented' : isApprove ? 'Approve Request' : 'Reject Request'}
                  </h3>
                  <span className={`text-[0.775rem] ${isImplement ? 'text-[#0F766E]' : isApprove ? 'text-[#15803D]' : 'text-[#B91C1C]'}`}>
                    Confirm your decision for {crData.requestCode || crData.id}
                  </span>
                </div>
              </div>

              {/* Action Switcher Toggle (Only between approve/reject if not implement) */}
              {!isImplement && (
                <button
                  type="button"
                  onClick={() => {
                    setAction(isApprove ? 'reject' : 'approve');
                    setFormError('');
                  }}
                  className="cursor-pointer border-0 bg-transparent text-[0.8rem] font-semibold text-[#475569] underline"
                >
                  Switch to {isApprove ? 'Reject' : 'Approve'}
                </button>
              )}
            </div>

            {/* Request Summary Card */}
            <div className="border-b border-[#E2E8F0] px-7 py-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <span className="font-mono text-xs font-bold tracking-[0.05em] text-[#2563EB]">
                    {crData.requestCode || crData.id}
                  </span>
                  <h2 className="mt-[0.2rem] mb-[0.3rem] text-[1.2rem] font-bold leading-[1.3] text-[#0F172A]">
                    {isPreSpend ? (crData.itemDescription || crData.category) : isTravel ? `${crData.travelMode}: ${crData.fromLocation} → ${crData.toLocation}` : crData.title}
                  </h2>
                  <span className="text-[0.825rem] text-[#64748B]">
                    {isPreSpend
                      ? `${crData.category} ${crData.subcategory ? `· ${crData.subcategory}` : ''}`
                      : isTravel
                        ? `${crData.tripType || 'One-Way'} · ${crData.travelClass || 'Standard'}`
                        : `${crData.category} ${crData.subCategory ? `· ${crData.subCategory}` : ''}`}
                  </span>
                </div>
                <div
                  className={`flex items-center gap-[0.35rem] whitespace-nowrap rounded-full px-[0.8rem] py-[0.35rem] text-xs font-bold ${
                    crData.status === 'Approved' ? 'bg-[#F5F3FF] text-[#7C3AED]' : crData.status === 'Implemented' ? 'bg-[#ECFDF5] text-[#059669]' : crData.status === 'Rejected' ? 'bg-[#FEF2F2] text-[#DC2626]' : 'bg-[#FEF3C7] text-[#D97706]'
                  }`}
                >
                  {crData.status === 'Approved' || crData.status === 'Implemented' ? <CheckCircle2 size={13} /> : crData.status === 'Rejected' ? <XCircle size={13} /> : <Clock size={13} />}
                  <span>{crData.status}</span>
                </div>
              </div>

              {/* Dynamic Overview Section depending on Module */}
              {isPreSpend && (
                <div className="mt-3 border-t border-[#E2E8F0] pt-4">
                  <div className="mb-[0.65rem] text-[0.825rem] font-bold text-[#0F172A]">
                    Requisition &amp; Financial Overview
                  </div>
                  <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Requester</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.requesterName}</div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Estimated Amount</div>
                      <div className="mt-[0.15rem] text-[0.9rem] font-bold text-[#059669]">
                        {Number(crData.estimatedAmount || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Cost Centre</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.costCentre || 'Corporate'}</div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Budget Line</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.budgetLine || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Needed By</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{formatCleanDate(crData.neededByDate)}</div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Selected Vendor</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-bold text-[#2563EB]">{crData.selectedVendor || 'Primary Quote'}</div>
                    </div>
                  </div>
                </div>
              )}

              {isTravel && (
                <div className="mt-3 border-t border-[#E2E8F0] pt-4">
                  <div className="mb-[0.65rem] text-[0.825rem] font-bold text-[#0F172A]">
                    Traveller &amp; Journey Overview
                  </div>
                  <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Traveller Name</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.travellerName}</div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Departure Date</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-bold text-[#2563EB]">{formatCleanDate(crData.departureDate)}</div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Return Date</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{formatCleanDate(crData.returnDate)}</div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Department</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.department || 'Corporate'}</div>
                    </div>
                    <div>
                      <div className="text-[0.7rem] font-semibold text-[#64748B]">Time Slot</div>
                      <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.preferredTimeSlot || 'Anytime'}</div>
                    </div>
                    {crData.isShortNotice && (
                      <div>
                        <div className="text-[0.7rem] font-semibold text-[#DC2626]">Notice Status</div>
                        <div className="mt-[0.15rem] text-[0.8rem] font-bold text-[#DC2626]">Short Notice (&lt; 7 Days)</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isPreSpend && !isTravel && (
                <>
                  {/* Change Desk Section 1 */}
                  <div className="mt-3 border-t border-[#E2E8F0] pt-4">
                    <div className="mb-[0.65rem] text-[0.825rem] font-bold text-[#0F172A]">
                      Section 1: Requester Details
                    </div>
                    <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
                      <div>
                        <div className="text-[0.7rem] font-semibold text-[#64748B]">Requester / Employee</div>
                        <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.employeeName || crData.requester || 'Requester'}</div>
                      </div>
                      <div>
                        <div className="text-[0.7rem] font-semibold text-[#64748B]">Approver</div>
                        <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.decidedBy || crData.approver || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[0.7rem] font-semibold text-[#64748B]">Employee ID</div>
                        <div className="mt-[0.15rem] font-mono text-[0.85rem] font-semibold text-[#0F172A]">{crData.employeeId || crData.empId || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-[0.7rem] font-semibold text-[#64748B]">Employee Email</div>
                        <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.employeeEmail || crData.requesterEmail || '—'}</div>
                      </div>
                      <div>
                        <div className="text-[0.7rem] font-semibold text-[#64748B]">Location</div>
                        <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.location || 'Not specified'}</div>
                      </div>
                      <div>
                        <div className="text-[0.7rem] font-semibold text-[#64748B]">Manager Email</div>
                        <div className="mt-[0.15rem] text-[0.85rem] font-semibold text-[#0F172A]">{crData.managerEmail || '—'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Action & Specification Details Box */}
                  {(() => {
                    const customFields = getCustomFields(crData);
                    if (!customFields.length) return null;
                    return (
                      <div className="my-4 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
                        <div className="mb-3 text-xs font-extrabold uppercase tracking-[0.04em] text-[#0F172A]">
                          Action &amp; Specification Details
                        </div>
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[0.85rem]">
                          {customFields.map(([k, v]) => (
                            <div key={k}>
                              <div className="text-[0.7rem] font-semibold text-[#64748B]">{formatFieldLabel(k)}</div>
                              <div className="mt-[0.15rem] break-words text-[0.85rem] font-bold text-[#0F172A]">{v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              {/* Justification Section */}
              <div className="mt-3">
                <div className="mb-[0.35rem] text-xs font-bold text-[#0F172A]">
                  {isPreSpend ? 'Business & Selection Justification' : isTravel ? 'Purpose of Visit' : 'Business Justification'}
                </div>
                <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[0.85rem] leading-[1.55] text-[#1E293B]">
                  {crData.businessJustification || crData.purpose || crData.justification || 'No justification entered.'}
                </div>
              </div>
            </div>

            {/* Decision Confirmation Form */}
            <form onSubmit={handleSubmitDecision} className="px-7 py-6">
              <div className="mb-5">
                <label className="mb-2 block text-[0.85rem] font-semibold text-[#0F172A]">
                  {isImplement
                    ? 'Implementation Remarks / Execution Notes *'
                    : isApprove
                      ? 'Approval Comments / Instructions (Required) *'
                      : 'Rejection Reason (Required) *'}
                </label>
                <textarea
                  rows={4}
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={
                    isImplement
                      ? 'Add any execution notes, deployment logs, or verification comments...'
                      : isApprove
                        ? 'Add comments, review notes, or instructions for the next stage...'
                        : 'Please explain why this request cannot be approved...'
                  }
                  className={`box-border w-full rounded-lg bg-[#F8FAFC] px-[0.95rem] py-3 font-[inherit] text-sm outline-none ${
                    formError ? 'border-[1.5px] border-[#DC2626]' : 'border border-[#CBD5E1]'
                  }`}
                />
                {formError && (
                  <div className="mt-[0.4rem] text-[0.8rem] font-semibold text-[#DC2626]">
                    {formError}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-[0.85rem]">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`inline-flex items-center gap-2 rounded-lg border-0 px-7 py-3 text-[0.9rem] font-bold text-white ${
                    submitting ? 'cursor-not-allowed opacity-70' : 'cursor-pointer opacity-100'
                  } ${
                    isImplement
                      ? 'bg-[#0D9488] shadow-[0_2px_6px_rgba(13,148,136,0.3)]'
                      : isApprove
                        ? 'bg-[#059669] shadow-[0_2px_6px_rgba(5,150,105,0.3)]'
                        : 'bg-[#DC2626] shadow-[0_2px_6px_rgba(220,38,38,0.3)]'
                  }`}
                >
                  <Send size={16} />
                  <span>
                    {submitting
                      ? 'Submitting...'
                      : isImplement
                        ? 'Submit as Implemented'
                        : isApprove
                          ? 'Confirm Approval'
                          : 'Confirm Rejection'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
