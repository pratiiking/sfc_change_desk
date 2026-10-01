import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Check, X, RotateCw, FileText, IndianRupee, Plane, MessageSquare, AlertTriangle, Loader2 } from 'lucide-react';
import ChangeRequestModal from '../components/ui/changeRequestModal.component';
import PreSpendDetailsModal from '../components/ui/PreSpendDetailsModal.component';
import TravelDetailsModal from '../components/ui/TravelDetailsModal.component';
import FilterBar, { initCustomDateRange } from '../components/ui/filterBar.component';
import ModuleSwitcher from '../components/ui/moduleSwitcher.component';
import { Pagination, LoadingSpinner, CommentPopupModal } from '../components/ui/primitives.component';
import { apiFetch } from '../lib/apiFetch.lib';
import { useWorklistActionableDots } from '../queries/worklist.queries';
import { getAllowedWorklistModules, ROLE } from '../lib/permissions.lib';

function MyWorklistPage({ onNavigate, searchQuery = '', user, isOrgWorklist = false }) {
  const queryClient = useQueryClient();
  const roleName = (user?.role || '').toLowerCase();
  const roleId = user?.roleId || '';
  const rawRoleIds = Array.isArray(user?.rolesList) ? user.rolesList : [];
  const userRolesList = Array.isArray(user?.roles)
    ? user.roles.map(r => (typeof r === 'string' ? r : r.roleName || r.name || r.roleId || '').toLowerCase())
    : [roleName];

  const isSuperAdmin = Boolean(user?.isSuperAdmin || roleId === ROLE.SUPER_ADMIN || rawRoleIds.includes(ROLE.SUPER_ADMIN) || roleName.includes('super') || userRolesList.some(r => r.includes('super')));
  const isBoardUser = Boolean(user?.isBoardMember || roleId === 'role-board' || roleId === ROLE.BOARD || rawRoleIds.includes(ROLE.BOARD) || rawRoleIds.includes('role-board') || roleName.includes('board') || userRolesList.some(r => r.includes('board')));
  const isTravelAdmin = Boolean(user?.isTravelAdmin || roleId === ROLE.TRAVEL_ADMIN || rawRoleIds.includes(ROLE.TRAVEL_ADMIN) || (roleName.includes('admin') && roleName.includes('travel')) || userRolesList.some(r => r.includes('travel admin')));
  const isPreSpendAdmin = Boolean(user?.isPreSpendAdmin || roleId === ROLE.PRESPEND_ADMIN || rawRoleIds.includes(ROLE.PRESPEND_ADMIN) || (roleName.includes('admin') && (roleName.includes('spend') || roleName.includes('prespend'))) || userRolesList.some(r => r.includes('pre-spend') || r.includes('prespend')));
  const isChangeAdmin = Boolean(user?.isChangeAdmin || roleId === ROLE.CHANGE_ADMIN || roleId === ROLE.ADMIN_LEGACY || rawRoleIds.includes(ROLE.CHANGE_ADMIN) || rawRoleIds.includes(ROLE.ADMIN_LEGACY) || userRolesList.some(r => r.includes('change desk admin') || r.includes('change admin')));
  const isChangeManager = Boolean(user?.isChangeManager || roleId === ROLE.CHANGE_MANAGER || rawRoleIds.includes(ROLE.CHANGE_MANAGER) || roleName.includes('manager') || userRolesList.some(r => r.includes('manager')) || (Array.isArray(user?.cmCategories) && user.cmCategories.length > 0));
  const isImplementer = Boolean(user?.isChangeImplementer || roleId === ROLE.CHANGE_IMPLEMENTER || rawRoleIds.includes(ROLE.CHANGE_IMPLEMENTER) || roleName.includes('implementer') || userRolesList.some(r => r.includes('implementer')) || (Array.isArray(user?.ciCategories) && user.ciCategories.length > 0));
  const isApprover = isSuperAdmin || isBoardUser || isChangeAdmin || isTravelAdmin || isPreSpendAdmin || isChangeManager || isImplementer;
  const isRequester = !isApprover;

  // Determine allowed modules cumulatively from shared permission helper
  const allowedModules = getAllowedWorklistModules(user);
  const defaultModule = allowedModules[0] || null;

  // Read module from URL query parameter
  const getModuleFromUrl = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mod = params.get('module');
      if (mod && allowedModules.includes(mod)) return mod;
    }
    return defaultModule;
  };

  const [activeModule, setActiveModule] = useState(getModuleFromUrl);

  // If user permissions load and activeModule is no longer allowed, sync to first allowed module
  useEffect(() => {
    if (allowedModules.length > 0 && !allowedModules.includes(activeModule)) {
      setActiveModule(allowedModules[0]);
    }
  }, [allowedModules.join(','), activeModule]);

  // Keep activeModule in sync when URL changes
  useEffect(() => {
    const handleUrlChange = () => {
      const mod = getModuleFromUrl();
      if (mod !== activeModule) {
        setActiveModule(mod);
        setActiveFilter('Pending');
      }
    };
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, [allowedModules, activeModule]);

  // Also sync when location.search updates via internal navigation
  useEffect(() => {
    const mod = getModuleFromUrl();
    if (mod !== activeModule) {
      setActiveModule(mod);
      setActiveFilter('Pending');
    }
  }, [typeof window !== 'undefined' ? window.location.search : '']);

  const [selectedCr, setSelectedCr] = useState(null);
  const [dateFilter, setDateFilter] = useState('last_30_days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [rowActionPrompt, setRowActionPrompt] = useState(null); // { item, action, title, color }
  const [rowActionCommentInput, setRowActionCommentInput] = useState('');
  const [rowActionCommentError, setRowActionCommentError] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [commentPopupData, setCommentPopupData] = useState(null);

  // Initial Filter State (Default to 'Pending' in worklist)
  const [activeFilter, setActiveFilter] = useState('Pending');

  // Reset pagination when filter/date/search/module changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeModule, activeFilter, dateFilter, startDate, endDate, searchQuery]);

  const isCustomDateIncomplete = dateFilter === 'custom' && (!startDate || !endDate);

  const { data: worklistData, isLoading } = useQuery({
    queryKey: ['worklist', { activeModule, activeFilter, dateFilter, startDate, endDate, searchQuery, isOrgWorklist, userId: user?.id }],
    queryFn: async () => {
      const params = new URLSearchParams({
        view: 'worklist',
        ...(activeFilter !== 'All' && { status: activeFilter }),
        ...(dateFilter !== 'overall' && { dateFilter }),
        ...(dateFilter === 'custom' && startDate && { startDate }),
        ...(dateFilter === 'custom' && endDate && { endDate }),
        ...(searchQuery && { search: searchQuery }),
        ...(isOrgWorklist && { scope: 'organization' })
      });

      if (activeModule === 'prespend') {
        const res = await apiFetch(`/pre-spend?${params}`);
        if (!res.ok) throw new Error('Failed to fetch pre-spend worklist');
        const body = await res.json();
        const userEmailLower = (user?.email || '').trim().toLowerCase();
        return {
          items: body.data && Array.isArray(body.data) ? body.data.map(i => {
            const isSelf = Boolean(
              (i.requesterId && (String(i.requesterId) === String(user?.id) || String(i.requesterId) === String(user?.userKey))) ||
              (i.requesterEmail && user?.email && i.requesterEmail.trim().toLowerCase() === userEmailLower)
            );
            const isPending = i.status === 'Pending Approval' || (i.status || '').toLowerCase().includes('pending');
            const isStage1 = i.approvalStage === 'manager_review';
            const isManager = Boolean(i.managerEmail && userEmailLower && i.managerEmail.trim().toLowerCase() === userEmailLower);

            let canAct = false;
            if (isPending && !isSelf) {
              if (isStage1) {
                canAct = isManager || isSuperAdmin;
              } else {
                canAct = isBoardUser || isSuperAdmin;
              }
            }
            return {
              ...i,
              canAct
            };
          }) : [],
          statusCounts: body.statusCounts || { All: 0, Pending: 0, Approved: 0, Rejected: 0 },
          metrics: body.metrics || { pending: 0, approved: 0, rejected: 0 }
        };
      }

      if (activeModule === 'travel') {
        const res = await apiFetch(`/travel-desk?${params}`);
        if (!res.ok) throw new Error('Failed to fetch travel worklist');
        const body = await res.json();
        const userEmailLower = (user?.email || '').trim().toLowerCase();
        return {
          items: body.data && Array.isArray(body.data) ? body.data.map(i => {
            const isPending = i.status === 'Pending Approval' || (i.status || '').toLowerCase().includes('pending');
            const isSelf = Boolean(
              (i.requesterId && (String(i.requesterId) === String(user?.id) || String(i.requesterId) === String(user?.userKey))) ||
              (i.travellerEmail && user?.email && i.travellerEmail.trim().toLowerCase() === userEmailLower) ||
              (i.employeeEmail && user?.email && i.employeeEmail.trim().toLowerCase() === userEmailLower)
            );
            const isStage1 = i.approvalStage === 'manager_review';
            const isManager = Boolean(i.managerEmail && userEmailLower && i.managerEmail.trim().toLowerCase() === userEmailLower);

            let canAct = false;
            if (isPending && !isSelf) {
              if (isStage1) {
                canAct = isManager || isSuperAdmin;
              } else {
                if (i.isShortNotice) {
                  canAct = isBoardUser; // strictly Board user only for Stage 2 short-notice flight
                } else {
                  canAct = isTravelAdmin || isBoardUser || isSuperAdmin;
                }
              }
            }
            return {
              ...i,
              canAct
            };
          }) : [],
          statusCounts: body.statusCounts || { All: 0, Pending: 0, Approved: 0, Rejected: 0 },
          metrics: body.metrics || { pending: 0, approved: 0, rejected: 0 }
        };
      }

      const res = await apiFetch(`/worklist?${params}`);
      if (!res.ok) throw new Error('Failed to fetch worklist');
      const body = await res.json();
      return {
        items: body.data && Array.isArray(body.data) ? body.data : [],
        statusCounts: body.statusCounts || { All: 0, Pending: 0, Approved: 0, InProcess: 0, Implemented: 0, Rejected: 0 },
        metrics: body.metrics || { pending: 0, approved: 0, inProcess: 0, rejected: 0, implemented: 0 }
      };
    },
    enabled: !isCustomDateIncomplete && Boolean(activeModule) && allowedModules.includes(activeModule),
  });

  // Dedicated query for status summary counts and metrics (unfiltered by active tab status)
  const { data: summaryData } = useQuery({
    queryKey: ['worklist-summary', { activeModule, dateFilter, startDate, endDate, searchQuery, isOrgWorklist, userId: user?.id }],
    queryFn: async () => {
      const params = new URLSearchParams({
        view: 'worklist',
        ...(dateFilter !== 'overall' && { dateFilter }),
        ...(dateFilter === 'custom' && startDate && { startDate }),
        ...(dateFilter === 'custom' && endDate && { endDate }),
        ...(searchQuery && { search: searchQuery }),
        ...(isOrgWorklist && { scope: 'organization' })
      });

      if (activeModule === 'prespend') {
        const res = await apiFetch(`/pre-spend?${params}`);
        if (!res.ok) return { statusCounts: { All: 0, Pending: 0, Approved: 0, Rejected: 0 }, metrics: { pending: 0, approved: 0, rejected: 0 } };
        const body = await res.json();
        return {
          statusCounts: body.statusCounts || { All: 0, Pending: 0, Approved: 0, Rejected: 0 },
          metrics: body.metrics || { pending: 0, approved: 0, rejected: 0 }
        };
      }

      if (activeModule === 'travel') {
        const res = await apiFetch(`/travel-desk?${params}`);
        if (!res.ok) return { statusCounts: { All: 0, Pending: 0, Approved: 0, Rejected: 0 }, metrics: { pending: 0, approved: 0, rejected: 0 } };
        const body = await res.json();
        return {
          statusCounts: body.statusCounts || { All: 0, Pending: 0, Approved: 0, Rejected: 0 },
          metrics: body.metrics || { pending: 0, approved: 0, rejected: 0 }
        };
      }

      const res = await apiFetch(`/worklist?${params}`);
      if (!res.ok) return { statusCounts: { All: 0, Pending: 0, Approved: 0, InProcess: 0, Implemented: 0, Rejected: 0 }, metrics: { pending: 0, approved: 0, inProcess: 0, rejected: 0, implemented: 0 } };
      const body = await res.json();
      return {
        statusCounts: body.statusCounts || { All: 0, Pending: 0, Approved: 0, InProcess: 0, Implemented: 0, Rejected: 0 },
        metrics: body.metrics || { pending: 0, approved: 0, inProcess: 0, rejected: 0, implemented: 0 }
      };
    },
    enabled: !isCustomDateIncomplete && Boolean(activeModule) && allowedModules.includes(activeModule)
  });

  // Fetch Pending Actionable Counts across modules for dot indicators using shared hook
  const { data: modulePendingCounts } = useWorklistActionableDots({
    user,
    allowedModuleIds: allowedModules
  });

  const [localItems, setLocalItems] = useState(null);
  const items = localItems !== null ? localItems : (worklistData?.items || []);
  const statusCounts = summaryData?.statusCounts || worklistData?.statusCounts || { All: 0, Pending: 0, Approved: 0, InProcess: 0, Implemented: 0, Rejected: 0 };
  const metrics = summaryData?.metrics || worklistData?.metrics || { pending: 0, approved: 0, inProcess: 0, rejected: 0, implemented: 0 };

  useEffect(() => {
    setLocalItems(null);
  }, [worklistData]);

  const handleAction = async (id, action, rejectionReason = '') => {
    try {
      const endpoint = activeModule === 'prespend'
        ? '/pre-spend/action'
        : activeModule === 'travel'
        ? '/travel-desk/action'
        : '/worklist/action';

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, rejectionReason, comment: rejectionReason })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const decision = action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : action === 'implement' ? 'Implemented' : 'Draft';
        const newStatus = action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : action === 'implement' ? 'Implemented' : 'Pending';
        const closedDate = (action === 'implement' || action === 'reject') ? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
        const approvedDate = (action === 'approve' || action === 'implement') ? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

        const actionCommentText = rejectionReason || data?.data?.approvedComment || data?.data?.comment || '';

        const newCommentObj = actionCommentText ? {
          id: `cmt-${Date.now()}`,
          authorName: user?.name || 'Approver',
          authorRole: user?.role || 'Approver',
          text: actionCommentText,
          action: decision,
          createdAt: new Date().toISOString()
        } : null;

        setLocalItems(prev => (prev || items).map(item => {
          if (item.id === id) {
            const updatedComments = newCommentObj ? [...(item.comments || []), newCommentObj] : (item.comments || []);
            return {
              ...item,
              status: newStatus,
              myDecision: decision,
              decidedBy: user?.name || 'Approver',
              approvedBy: action === 'approve' ? (user?.name || 'Approver') : item.approvedBy,
              approvedDate: approvedDate || item.approvedDate,
              approvedComment: action === 'approve' ? actionCommentText : item.approvedComment,
              rejectedComment: action === 'reject' ? actionCommentText : item.rejectedComment,
              rejectionReason: action === 'reject' ? actionCommentText : item.rejectionReason,
              implementedComment: action === 'implement' ? actionCommentText : item.implementedComment,
              comments: updatedComments,
              closedDate: closedDate || item.closedDate,
              canAct: false
            };
          }
          return item;
        }));

        setSelectedCr(prev => {
          if (prev && prev.id === id) {
            const updatedComments = newCommentObj ? [...(prev.comments || []), newCommentObj] : (prev.comments || []);
            return {
              ...prev,
              status: newStatus,
              myDecision: decision,
              decidedBy: user?.name || 'Approver',
              approvedBy: action === 'approve' ? (user?.name || 'Approver') : prev.approvedBy,
              approvedDate: approvedDate || prev.approvedDate,
              approvedComment: action === 'approve' ? actionCommentText : prev.approvedComment,
              rejectedComment: action === 'reject' ? actionCommentText : prev.rejectedComment,
              rejectionReason: action === 'reject' ? actionCommentText : prev.rejectionReason,
              implementedComment: action === 'implement' ? actionCommentText : prev.implementedComment,
              comments: updatedComments,
              closedDate: closedDate || prev.closedDate,
              canAct: false
            };
          }
          return prev;
        });

        // Invalidate react-query cache so fresh metrics & lists update cleanly.
        // These keys must match the actual queryKeys the pages register with —
        // 'change-requests' and 'dashboard_metrics' below matched nothing real
        // and were silent no-ops; the dashboard's summary cards and the
        // sidebar's pending-count dots are the ones that actually need a nudge.
        queryClient.invalidateQueries({ queryKey: ['worklist'] });
        queryClient.invalidateQueries({ queryKey: ['worklist-actionable-dots'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-summary-cards'] });
        queryClient.invalidateQueries({ queryKey: ['prespend-summary-card'] });
        queryClient.invalidateQueries({ queryKey: ['cr-summary-card'] });
        queryClient.invalidateQueries({ queryKey: ['travel-summary-card'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-expanded'] });
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn('Backend action request failed:', errData.message || res.statusText);
        alert(errData.message || `Failed to perform ${action} action.`);
      }
    } catch (err) {
      console.warn('Backend action request failed:', err);
      alert(err.message || `Failed to perform ${action} action.`);
    }
  };

  const getStatus = (r) => (r.status || 'Pending').toLowerCase();

  const approvedCount = statusCounts.Approved ?? statusCounts.InProcess ?? metrics?.approved ?? 0;

  // Domain-specific worklist items
  const displayItems = items;

  const filterTabs = activeModule === 'change_request'
    ? [
        { id: 'All', label: 'All', count: statusCounts.All || 0 },
        { id: 'Pending', label: 'Pending', count: statusCounts.Pending || 0 },
        { id: 'Approved', label: 'Approved', count: approvedCount },
        { id: 'Implemented', label: 'Implemented', count: statusCounts.Implemented || 0 },
        { id: 'Rejected', label: 'Rejected', count: statusCounts.Rejected || 0 }
      ]
    : [
        { id: 'All', label: 'All', count: statusCounts.All || 0 },
        { id: 'Pending', label: 'Pending', count: statusCounts.Pending || 0 },
        { id: 'Approved', label: activeModule === 'travel' ? 'Ticketed & Confirmed' : 'Approved', count: approvedCount },
        { id: 'Rejected', label: 'Rejected', count: statusCounts.Rejected || 0 }
      ];

  // 1. Change Request Worklist Cards
  const crMetricCards = [
    { id: 'pending', title: 'Pending Review', count: metrics?.pending ?? statusCounts.Pending ?? 0, subtext: 'In Queue Right Now', subtextColor: 'var(--text-secondary)', icon: Clock, iconBg: '#FEF3C7', iconColor: '#D97706' },
    { id: 'approved', title: 'Approved', count: approvedCount, subtext: 'Approved Requests', subtextColor: '#7C3AED', icon: Check, iconBg: '#F5F3FF', iconColor: '#7C3AED' },
    { id: 'implemented', title: 'Implemented', count: metrics?.implemented ?? statusCounts.Implemented ?? 0, subtext: 'Last 30 Days', subtextColor: '#059669', icon: RotateCw, iconBg: '#ECFDF5', iconColor: '#059669' },
    { id: 'rejected', title: 'Rejected', count: metrics?.rejected ?? statusCounts.Rejected ?? 0, subtext: 'Last 30 Days', subtextColor: 'var(--text-secondary)', icon: X, iconBg: '#FEE2E2', iconColor: '#DC2626' }
  ];

  // 2. Pre-Spend Worklist Cards
  const prespendMetricCards = [
    { id: 'pending', title: 'Pending Budget Review', count: metrics?.pending ?? statusCounts.Pending ?? 0, subtext: 'Awaiting Sign-off', subtextColor: 'var(--text-secondary)', icon: Clock, iconBg: '#FEF3C7', iconColor: '#D97706' },
    { id: 'approved', title: 'Approved Spend', count: metrics?.approved ?? statusCounts.Approved ?? 0, subtext: 'Approved Budgets', subtextColor: '#7C3AED', icon: Check, iconBg: '#F5F3FF', iconColor: '#7C3AED' },
    { id: 'rejected', title: 'Rejected', count: metrics?.rejected ?? statusCounts.Rejected ?? 0, subtext: 'Declined Requests', subtextColor: 'var(--text-secondary)', icon: X, iconBg: '#FEE2E2', iconColor: '#DC2626' }
  ];

  // 3. Travel Desk Worklist Cards
  const travelMetricCards = [
    { id: 'pending', title: 'Pending Approval', count: metrics?.pending ?? statusCounts.Pending ?? 0, subtext: 'Awaiting Sign-off', subtextColor: 'var(--text-secondary)', icon: Clock, iconBg: '#FEF3C7', iconColor: '#D97706' },
    { id: 'approved', title: 'Ticketed & Confirmed', count: metrics?.approved ?? statusCounts.Approved ?? 0, subtext: 'Confirmed Itineraries', subtextColor: '#7C3AED', icon: Check, iconBg: '#F5F3FF', iconColor: '#7C3AED' },
    { id: 'rejected', title: 'Rejected', count: metrics?.rejected ?? statusCounts.Rejected ?? 0, subtext: 'Declined Bookings', subtextColor: 'var(--text-secondary)', icon: X, iconBg: '#FEE2E2', iconColor: '#DC2626' }
  ];

  const metricCards = activeModule === 'prespend'
    ? prespendMetricCards
    : activeModule === 'travel'
    ? travelMetricCards
    : crMetricCards;

  const moduleSubtitles = {
    change_request: isOrgWorklist ? 'All change requests requiring Change Manager oversight across the organization' : 'Change requests awaiting your review',
    prespend: isOrgWorklist ? 'All departmental pre-spend and capital budget authorization requests' : 'Pre-spend and budget purchase requests awaiting your sign-off',
    travel: isOrgWorklist ? 'All corporate flight, train, and hotel reservations requiring travel desk approval' : 'Travel and accommodation requests awaiting your approval'
  };

  const isInitialLoading = isLoading && !worklistData;

  if (isInitialLoading) {
    return (
      <div className="flex min-h-[60vh] w-full flex-col items-center justify-center">
        <LoadingSpinner size="lg" message="Loading Worklist..." />
      </div>
    );
  }

  if (!isApprover || allowedModules.length === 0) {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center', backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', margin: '2rem 0' }}>
        <CheckCircle2 size={42} style={{ color: 'var(--text-secondary)', margin: '0 auto 1rem auto', opacity: 0.6 }} />
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Worklist Access</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto' }}>
          You do not currently have approval or reviewer responsibilities for any active desk modules.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">

      {/* Header Row: Title & Subtitle with Total Count */}
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="m-0 text-[1.45rem] font-bold leading-[1.2] text-foreground">
            {activeModule === 'prespend' ? 'Pre-Spend Request' : activeModule === 'travel' ? 'Travel Desk' : 'Change Request'}
          </h1>
          <p className="mt-[0.2rem] mb-0 text-[0.85rem] text-muted-foreground">
            {moduleSubtitles[activeModule]}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-[0.85rem] font-semibold text-muted-foreground">
            {displayItems.length} total request{displayItems.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Status & Date Filter Pills (Above Metrics) */}
      <FilterBar
        tabs={filterTabs}
        activeTab={activeFilter}
        onTabChange={setActiveFilter}
        dateValue={dateFilter}
        onDateChange={(val) => {
          setDateFilter(val);
          if (val === 'custom') {
            initCustomDateRange({ startDate, endDate, setStartDate, setEndDate });
          } else {
            setStartDate('');
            setEndDate('');
          }
        }}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      {/* Metric Cards Grid */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        {metricCards.map(card => {
          const IconComp = card.icon;
          return (
            <div
              key={card.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-[1.1rem]"
            >
              <div
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px]"
                style={{ backgroundColor: card.iconBg, color: card.iconColor }}
              >
                <IconComp size={20} />
              </div>
              <div>
                <div className="text-[1.35rem] font-bold leading-[1.1] text-foreground">{card.count}</div>
                <div className="mt-[0.2rem] text-[0.775rem] font-semibold text-muted-foreground">{card.title}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Worklist Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-[0.85rem]">
            <thead>
              <tr className="border-b border-border bg-input text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                <th className="min-w-[100px] whitespace-nowrap px-[1.1rem] py-[0.9rem]">
                  {activeModule === 'travel' ? 'TR ID' : activeModule === 'prespend' ? 'PS ID' : 'CR ID'}
                </th>
                <th className="min-w-[280px] px-[1.1rem] py-[0.9rem]">Title</th>
                <th className="min-w-[180px] px-[1.1rem] py-[0.9rem]">Category</th>
                <th className="min-w-[180px] whitespace-nowrap px-[1.1rem] py-[0.9rem]">Requester Details</th>
                <th className="min-w-[130px] whitespace-nowrap px-[1.1rem] py-[0.9rem]">
                  Requested On
                </th>
                {activeModule === 'travel' && (
                  <th className="min-w-[120px] whitespace-nowrap px-[1.1rem] py-[0.9rem]">
                    Travel Date
                  </th>
                )}
                <th className="min-w-[120px] whitespace-nowrap px-[1.1rem] py-[0.9rem]">Closed Date</th>
                <th className="min-w-[130px] whitespace-nowrap px-[1.1rem] py-[0.9rem]">Approved By</th>
                <th className="min-w-[140px] whitespace-nowrap px-[1.1rem] py-[0.9rem]">Status</th>
                <th className="min-w-[160px] whitespace-nowrap px-[1.1rem] py-[0.9rem] text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayItems.length > 0 ? (
                displayItems.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(item => {
                  const status = getStatus(item);
                  const isItemApproved = status === 'approved' || item.myDecision === 'Approved';
                  const isItemRejected = status === 'rejected' || item.myDecision === 'Rejected';

                  const isSelfRequest = Boolean(
                    (item.requesterId && (String(item.requesterId) === String(user?.id) || String(item.requesterId) === String(user?.userKey))) ||
                    (item.employeeId && user?.employeeId && String(item.employeeId).trim().toLowerCase() === String(user.employeeId).trim().toLowerCase()) ||
                    (item.employeeEmail && user?.email && item.employeeEmail.trim().toLowerCase() === user.email.trim().toLowerCase()) ||
                    (item.requesterEmail && user?.email && item.requesterEmail.trim().toLowerCase() === user.email.trim().toLowerCase())
                  );

                  const emailVal = item.employeeEmail || item.requesterEmail || item.travellerEmail || item.managerEmail || '';
                  const displayName = item.employeeName || item.requester || item.requesterName || item.travellerName || (emailVal ? emailVal.split('@')[0].replace(/[\._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—');

                  const approverName = item.decidedBy || item.approvedBy || (isItemApproved || isItemRejected ? (user?.name || 'Approver') : null);
                  const approverEmail = item.decidedByEmail || item.approvedByEmail || (isItemApproved || isItemRejected ? user?.email : null);

                  const hasComment = Boolean(item.approvedComment || item.rejectedComment || item.rejectionReason || item.implementedComment);

                  const isShortNoticeFlight = activeModule === 'travel' && item.isShortNotice;
                  const isUrgentPreSpend = activeModule === 'prespend' && (item.isUrgent || item.urgent);

                  const statusBadgeLabel = status === 'implemented'
                    ? 'Implemented'
                    : isItemApproved
                    ? 'Approved'
                    : isItemRejected
                    ? 'Rejected'
                    : item.status === 'In Progress'
                    ? 'In Progress'
                    : isShortNoticeFlight
                    ? 'Awaiting Board Approval'
                    : 'Pending';

                  const statusColor = statusBadgeLabel === 'Implemented' ? '#059669' : statusBadgeLabel === 'Approved' ? '#7C3AED' : statusBadgeLabel === 'Rejected' ? '#DC2626' : isShortNoticeFlight ? '#DC2626' : '#D97706';
                  const statusBg = statusBadgeLabel === 'Implemented' ? '#ECFDF5' : statusBadgeLabel === 'Approved' ? '#F5F3FF' : statusBadgeLabel === 'Rejected' ? '#FEF2F2' : isShortNoticeFlight ? '#FEF2F2' : '#FEF3C7';
                  const statusDot = statusBadgeLabel === 'Implemented' ? '#10B981' : statusBadgeLabel === 'Approved' ? '#8B5CF6' : statusBadgeLabel === 'Rejected' ? '#EF4444' : isShortNoticeFlight ? '#EF4444' : '#F59E0B';

                  const requestedOnDate = item.raisedDate || (item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'));

                  return (
                    <tr key={item.id} className="border-b border-border [transition:background-color_0.15s_ease]">
                      <td className="whitespace-nowrap px-[1.1rem] py-4 font-medium text-foreground [font-family:var(--font-mono)]">
                        {item.requestCode || item.id}
                      </td>
                      <td className="min-w-[280px] px-[1.1rem] py-4 font-medium text-foreground">
                        <span className="block leading-[1.4] text-foreground">{item.title}</span>
                      </td>
                      <td className="min-w-[180px] px-[1.1rem] py-4 text-muted-foreground">
                        <div className="font-semibold text-foreground">{item.category}</div>
                        {item.subCategory && <div className="text-[0.775rem] text-muted-foreground">{item.subCategory}</div>}
                      </td>
                      <td className="whitespace-nowrap px-[1.1rem] py-4 text-foreground">
                        <div className="text-[0.85rem] font-semibold text-foreground">
                          {displayName}
                        </div>
                        {emailVal && (
                          <div className="mt-[0.15rem] text-[0.75rem] text-muted-foreground [font-family:var(--font-mono)]">
                            {emailVal}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-[1.1rem] py-4 text-muted-foreground [font-family:var(--font-mono)]">
                        {requestedOnDate}
                      </td>
                      {activeModule === 'travel' && (
                        <td className="whitespace-nowrap px-[1.1rem] py-4 text-muted-foreground [font-family:var(--font-mono)]">
                          {item.departureDate ? new Date(item.departureDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-[1.1rem] py-4 text-muted-foreground [font-family:var(--font-mono)]">
                        {item.closedDate || (item.closedAt ? new Date(item.closedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')}
                      </td>
                      <td className="whitespace-nowrap px-[1.1rem] py-4 text-foreground">
                        {approverName ? (
                          <>
                            <div className="text-[0.85rem] font-semibold text-foreground">
                              {approverName}
                            </div>
                            {approverEmail && (
                              <div className="mt-[0.15rem] text-[0.75rem] text-muted-foreground [font-family:var(--font-mono)]">
                                {approverEmail}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-[1.1rem] py-4">
                        <div className="flex flex-col items-start gap-[0.3rem]">
                          <div
                            className="inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-[var(--radius-lg)] px-[0.65rem] py-[0.2rem] text-[0.775rem] font-medium"
                            style={{ backgroundColor: statusBg, color: statusColor }}
                          >
                            <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: statusDot }} />
                            <span className="whitespace-nowrap">
                              {statusBadgeLabel}
                            </span>
                          </div>
                          {isUrgentPreSpend && (
                            <div className="inline-flex items-center gap-[0.25rem] whitespace-nowrap rounded border border-[#FECACA] bg-[#FEF2F2] px-2 py-[0.15rem] text-[0.7rem] font-bold text-[#DC2626]">
                              <AlertTriangle size={11} strokeWidth={2.5} />
                              <span>Urgent</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-[1.1rem] py-4 text-left">
                        <div className="inline-flex items-center justify-start gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedCr(item)}
                            className="cursor-pointer rounded-md border border-border bg-card px-[0.8rem] py-[0.4rem] text-[0.8rem] font-semibold text-foreground"
                          >
                            View
                          </button>

                          {!isRequester && !isSelfRequest && item.canAct === true && (status === 'pending' || status === 'pending approval') && item.myDecision !== 'Approved' && item.myDecision !== 'Rejected' && (activeModule !== 'change_request' || (isChangeManager || isChangeAdmin || isSuperAdmin)) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setRowActionPrompt({ item, action: 'reject', title: `Reject ${activeModule === 'travel' ? 'Travel Request' : activeModule === 'prespend' ? 'Pre-Spend Request' : 'Change Request'}`, color: '#DC2626' });
                                  setRowActionCommentInput('');
                                  setRowActionCommentError('');
                                }}
                                className="cursor-pointer rounded-md border border-[#FCA5A5] bg-[#FEF2F2] px-[0.8rem] py-[0.4rem] text-[0.8rem] font-bold text-[#DC2626]"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRowActionPrompt({ item, action: 'approve', title: `Approve ${activeModule === 'travel' ? 'Travel Request' : activeModule === 'prespend' ? 'Pre-Spend Request' : 'Change Request'}`, color: '#0D9488' });
                                  setRowActionCommentInput('');
                                  setRowActionCommentError('');
                                }}
                                className="cursor-pointer rounded-md border-none bg-[#0D9488] px-[0.95rem] py-[0.4rem] text-[0.8rem] font-bold text-white shadow-[0_1px_2px_rgba(13,148,136,0.2)]"
                              >
                                Approve
                              </button>
                            </>
                          ) : isShortNoticeFlight && !isBoardUser && status === 'pending' ? (
                            <span className="rounded-[var(--radius-lg)] border border-[#FECACA] bg-[#FEF2F2] px-[0.65rem] py-[0.3rem] text-[0.75rem] font-semibold text-[#DC2626]">
                              Awaiting Board Approval
                            </span>
                          ) : activeModule === 'change_request' && isItemApproved && status !== 'implemented' && (isSuperAdmin || isChangeAdmin || item.canAct === true) && !isSelfRequest ? (
                            <button
                              type="button"
                              onClick={() => {
                                setRowActionPrompt({ item, action: 'implement', title: 'Mark as Implemented', color: '#0D9488' });
                                setRowActionCommentInput('');
                                setRowActionCommentError('');
                              }}
                              className="cursor-pointer rounded-md border-none bg-[#0D9488] px-[0.95rem] py-[0.4rem] text-[0.8rem] font-bold text-white shadow-[0_1px_2px_rgba(13,148,136,0.2)]"
                            >
                              Implement
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : isLoading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center">
                    <LoadingSpinner size="md" message="Loading worklist requests..." />
                  </td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-muted-foreground">
                    {activeModule === 'prespend'
                      ? 'No pre-spend requests found.'
                      : activeModule === 'travel'
                      ? 'No travel bookings found.'
                      : 'No change requests found matching the selected filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Reusable Pagination */}
        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={displayItems.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
        />
      </div>

      {/* Table Row Action Mandatory Comment Modal */}
      {rowActionPrompt && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-[520px] flex-col gap-4 rounded-[14px] border border-border bg-card p-6 shadow-[0_20px_40px_rgba(0,0,0,0.2)]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-[1.1rem] font-extrabold" style={{ color: rowActionPrompt.color }}>
                  {rowActionPrompt.title}
                </h3>
                <span className="whitespace-nowrap rounded-[5px] border border-[#CBD5E1] bg-[#F1F5F9] px-2 py-[0.15rem] text-[0.725rem] font-semibold text-[#64748B]">
                  Visible to all
                </span>
              </div>
              <p className="m-0 text-[0.825rem] text-muted-foreground">
                {rowActionPrompt.action === 'implement'
                  ? 'A comment explaining what has been done'
                  : rowActionPrompt.action === 'reject'
                  ? 'Please provide the reason for rejection.'
                  : 'A comment explaining what has been done'}
              </p>
            </div>

            <textarea
              rows={3}
              placeholder="Enter comment..."
              value={rowActionCommentInput}
              onChange={(e) => {
                setRowActionCommentInput(e.target.value);
                if (rowActionCommentError) setRowActionCommentError('');
              }}
              className={`w-full rounded-lg border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none ${
                rowActionCommentError ? 'border-[#DC2626]' : 'border-border'
              }`}
            />

            {rowActionCommentError && (
              <span className="text-[0.775rem] font-bold text-[#DC2626]">
                {rowActionCommentError}
              </span>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isActionSubmitting}
                onClick={() => {
                  if (isActionSubmitting) return;
                  setRowActionPrompt(null);
                  setRowActionCommentInput('');
                  setRowActionCommentError('');
                }}
                className={`h-[34px] cursor-pointer rounded-md border border-border bg-card px-3.5 py-1.5 text-[0.8rem] font-semibold text-foreground transition-colors hover:bg-accent ${
                  isActionSubmitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer opacity-100'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActionSubmitting}
                onClick={async () => {
                  if (isActionSubmitting) return;
                  if (!rowActionCommentInput.trim()) {
                    setRowActionCommentError('Please enter a comment.');
                    return;
                  }
                  setIsActionSubmitting(true);
                  try {
                    await handleAction(rowActionPrompt.item.id, rowActionPrompt.action, rowActionCommentInput.trim());
                    setRowActionPrompt(null);
                    setRowActionCommentInput('');
                    setRowActionCommentError('');
                  } finally {
                    setIsActionSubmitting(false);
                  }
                }}
                style={{ backgroundColor: rowActionPrompt.color }}
                className={`inline-flex h-[34px] items-center justify-center gap-1.5 rounded-md border-none px-3.5 py-1.5 text-[0.8rem] font-bold text-white shadow-sm transition-opacity ${
                  isActionSubmitting ? 'cursor-not-allowed opacity-75' : 'cursor-pointer opacity-100'
                }`}
              >
                {isActionSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white shrink-0" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>
                    {rowActionPrompt.action === 'approve'
                      ? 'Approve'
                      : rowActionPrompt.action === 'implement'
                      ? 'Implement'
                      : 'Reject'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Domain-Specific Details Modals */}
      {selectedCr && activeModule === 'prespend' && (
        <PreSpendDetailsModal
          item={selectedCr}
          user={user}
          onClose={() => setSelectedCr(null)}
          onApprove={(id, action, comment) => handleAction(id, 'approve', comment)}
          onReject={(id, action, reason) => handleAction(id, 'reject', reason)}
        />
      )}

      {selectedCr && activeModule === 'travel' && (
        <TravelDetailsModal
          item={selectedCr}
          user={user}
          onClose={() => setSelectedCr(null)}
          onApprove={(id, action, comment) => handleAction(id, 'approve', comment)}
          onReject={(id, action, reason) => handleAction(id, 'reject', reason)}
        />
      )}

      {selectedCr && activeModule === 'change_request' && (() => {
        const isSelf = Boolean(
          (selectedCr.requesterId && (String(selectedCr.requesterId) === String(user?.id) || String(selectedCr.requesterId) === String(user?.userKey))) ||
          (selectedCr.employeeId && user?.employeeId && String(selectedCr.employeeId).trim().toLowerCase() === String(user.employeeId).trim().toLowerCase()) ||
          (selectedCr.employeeEmail && user?.email && selectedCr.employeeEmail.trim().toLowerCase() === user.email.trim().toLowerCase()) ||
          (selectedCr.requesterEmail && user?.email && selectedCr.requesterEmail.trim().toLowerCase() === user.email.trim().toLowerCase())
        );
        return (
          <ChangeRequestModal
            cr={selectedCr}
            user={user}
            onClose={() => setSelectedCr(null)}
            onApprove={(isRequester || selectedCr.canAct !== true || isSelf) ? null : (id, comment) => handleAction(id, 'approve', comment)}
            onReject={(isRequester || selectedCr.canAct !== true || isSelf) ? null : (id, reason) => handleAction(id, 'reject', reason)}
            onSendBack={(isRequester || selectedCr.canAct !== true || isSelf) ? null : (id) => handleAction(id, 'sendback')}
            onImplement={isSelf ? null : (id, comment) => handleAction(id, 'implement', comment)}
          />
        );
      })()}

      {/* Pop-up Modal for Decision Comments / Notes */}
      <CommentPopupModal
        isOpen={Boolean(commentPopupData)}
        onClose={() => setCommentPopupData(null)}
        data={commentPopupData}
      />

    </div>
  );
}

export default React.memo(MyWorklistPage);
