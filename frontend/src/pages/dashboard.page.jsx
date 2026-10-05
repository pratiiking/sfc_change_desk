import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Clock, RotateCw, XCircle, Layers, PieChart,
  TrendingUp, TrendingDown, Minus, Sunrise, Sun, Moon, Plus,
  Check, ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react';
import FilterBar, { initCustomDateRange } from '../components/ui/filterBar.component';
import ChangeRequestModal from '../components/ui/changeRequestModal.component';
import PreSpendDetailsModal from '../components/ui/PreSpendDetailsModal.component';
import TravelDetailsModal from '../components/ui/TravelDetailsModal.component';
import { Pagination, ExportButtonGroup, LoadingSpinner } from '../components/ui/primitives.component';
import { apiFetch } from '../lib/apiFetch.lib';

const METRIC_STYLES = [
  { id: 'total', match: (m) => m?.isTotal || m?.title?.includes('Total'), icon: FileText, color: '#2563EB', tint: '#EFF6FF', filterKey: 'All' },
  { id: 'pending', match: (m) => m?.isPending || m?.title?.includes('Pending') || m?.title?.includes('Requested'), icon: Clock, color: '#D97706', tint: '#FEF3C7', filterKey: 'Pending' },
  { id: 'approved', match: (m) => m?.id === 'approved' || m?.isApproved || m?.title === 'Approved' || m?.title === 'In Process' || m?.title?.includes('Ticketed'), icon: Check, color: '#7C3AED', tint: '#F5F3FF', filterKey: 'Approved' },
  { id: 'implemented', match: (m) => m?.isInProgress || m?.isImplemented || m?.title?.includes('Progress') || m?.title?.includes('Implemented') || m?.title?.includes('Processed') || m?.title?.includes('Completed'), icon: RotateCw, color: '#059669', tint: '#ECFDF5', filterKey: 'Implemented' },
  { id: 'rejected', match: () => true, icon: XCircle, color: '#DC2626', tint: '#FEF2F2', filterKey: 'Rejected' }
];
const getMetricStyle = (m) => METRIC_STYLES.find((s) => s.match(m)) || METRIC_STYLES[METRIC_STYLES.length - 1];

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good Morning', Icon: Sunrise };
  if (h < 16) return { text: 'Good Afternoon', Icon: Sun };
  return { text: 'Good Evening', Icon: Moon };
};

const PRESPEND_CANONICAL_CATEGORIES = [
  { category: 'IT Hardware', label: 'IT Hardware', count: 0, color: '#2563EB', percentage: 0 },
  { category: 'Software & SaaS', label: 'Software & SaaS', count: 0, color: '#7C3AED', percentage: 0 },
  { category: 'Professional Services', label: 'Professional Services', count: 0, color: '#0D9488', percentage: 0 },
  { category: 'Marketing & Event', label: 'Marketing & Event', count: 0, color: '#D97706', percentage: 0 },
  { category: 'Facilities & Housekeeping', label: 'Facilities & Housekeeping', count: 0, color: '#475569', percentage: 0 },
  { category: 'Employee Welfare', label: 'Employee Welfare', count: 0, color: '#DC2626', percentage: 0 }
];

const TRAVEL_CANONICAL_CATEGORIES = [
  { category: 'Flight', label: 'Flight', count: 0, color: '#2563EB', percentage: 0 },
  { category: 'Hotel', label: 'Hotel Room', count: 0, color: '#7C3AED', percentage: 0 },
  { category: 'Cab', label: 'Cab', count: 0, color: '#D97706', percentage: 0 },
  { category: 'Train', label: 'Train', count: 0, color: '#0D9488', percentage: 0 },
  { category: 'Bus', label: 'Bus', count: 0, color: '#475569', percentage: 0 }
];

const CANONICAL_CATEGORIES = [
  { category: 'IT Asset', label: 'IT Asset', count: 0, color: '#D97706', percentage: 0 },
  { category: 'Office 365 & Collaboration', label: 'Office 365 & Collaboration', count: 0, color: '#475569', percentage: 0 },
  { category: 'Access & Security', label: 'Access & Security', count: 0, color: '#7C3AED', percentage: 0 },
  { category: 'Network & Connectivity', label: 'Network & Connectivity', count: 0, color: '#0D9488', percentage: 0 },
  { category: 'Security Tools & Policies', label: 'Security Tools & Policies', count: 0, color: '#DC2626', percentage: 0 },
  { category: 'Server & Infra', label: 'Server & Infra', count: 0, color: '#2563EB', percentage: 0 }
];

const CANONICAL_STATUSES = [
  { status: 'Pending', label: 'Pending Approvals', count: 0, color: '#D97706' },
  { status: 'Approved', label: 'Approved', count: 0, color: '#7C3AED' },
  { status: 'Implemented', label: 'Implemented', count: 0, color: '#059669' },
  { status: 'Rejected', label: 'Rejected', count: 0, color: '#DC2626' }
];

function DashboardPage({ onNavigate, user, isOrgDashboard = false, searchQuery = '' }) {
  // Expanded module: null means all collapsed; 'prespend' | 'change_request' | 'travel'
  const [expandedModule, setExpandedModule] = useState(null);
  const [hoveredStatus, setHoveredStatus] = useState(null);

  // Unified Filter State
  const [activeFilter, setActiveFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('last_30_days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset pagination when filters, module or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [expandedModule, activeFilter, dateFilter, startDate, endDate, searchQuery]);

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const isCustomDateIncomplete = dateFilter === 'custom' && (!startDate || !endDate);
  const scopeParam = isOrgDashboard ? 'scope=org' : 'scope=my';

  // 1. Fetch summary metrics for all 3 cards simultaneously (filtered by global date/search filter)
  const summaryFilterParams = new URLSearchParams({
    ...(isOrgDashboard ? { scope: 'organization' } : { scope: 'my' }),
    ...(dateFilter !== 'overall' && { dateFilter }),
    ...(dateFilter === 'custom' && startDate && { startDate }),
    ...(dateFilter === 'custom' && endDate && { endDate }),
    ...(searchQuery && { search: searchQuery })
  }).toString();

  // One request per domain, but one shared query/cache-entry/refetch-interval instead
  // of three independent ones — the three cards always render together, so there's
  // no reason for each to poll on its own clock.
  const { data: summaryCardsData } = useQuery({
    queryKey: ['dashboard-summary-cards', isOrgDashboard, user?.id, dateFilter, startDate, endDate, searchQuery],
    queryFn: async () => {
      const [psRes, mRes, rRes, trRes] = await Promise.all([
        apiFetch(`/pre-spend?${summaryFilterParams}`).catch(() => null),
        apiFetch(`/metrics?${summaryFilterParams}`).catch(() => null),
        apiFetch(`/my-requests?${summaryFilterParams}`).catch(() => null),
        apiFetch(`/travel-desk?${summaryFilterParams}`).catch(() => null)
      ]);

      const psData = psRes && psRes.ok ? await psRes.json() : null;
      const mData = mRes && mRes.ok ? await mRes.json() : {};
      const rData = rRes && rRes.ok ? await rRes.json() : {};
      const trData = trRes && trRes.ok ? await trRes.json() : null;

      return {
        prespendSummary: psData,
        crSummary: {
          metrics: mData.data && Array.isArray(mData.data) ? mData.data : [],
          statusCounts: rData.statusCounts || {}
        },
        travelSummary: trData
      };
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 1000 * 60 * 5 // 5 minutes
  });

  const prespendSummary = summaryCardsData?.prespendSummary || null;
  const crSummary = summaryCardsData?.crSummary || null;
  const travelSummary = summaryCardsData?.travelSummary || null;

  // 2. Fetch full detailed charts + requests only when a card is expanded
  const commonParams = new URLSearchParams({
    ...(isOrgDashboard && { scope: 'organization' }),
    ...(dateFilter !== 'overall' && { dateFilter }),
    ...(dateFilter === 'custom' && startDate && { startDate }),
    ...(dateFilter === 'custom' && endDate && { endDate }),
    ...(searchQuery && { search: searchQuery })
  }).toString();

  const requestParams = new URLSearchParams({
    ...(isOrgDashboard && { scope: 'organization' }),
    ...(activeFilter !== 'All' && { status: activeFilter }),
    ...(dateFilter !== 'overall' && { dateFilter }),
    ...(dateFilter === 'custom' && startDate && { startDate }),
    ...(dateFilter === 'custom' && endDate && { endDate }),
    ...(searchQuery && { search: searchQuery })
  }).toString();

  const metricsParams = new URLSearchParams({
    ...(isOrgDashboard && { scope: 'organization' }),
    ...(activeFilter !== 'All' && { status: activeFilter }),
    ...(dateFilter !== 'overall' && { dateFilter }),
    ...(dateFilter === 'custom' && startDate && { startDate }),
    ...(dateFilter === 'custom' && endDate && { endDate }),
    ...(searchQuery && { search: searchQuery })
  }).toString();

  const { data: expandedDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['dashboard-expanded', isOrgDashboard, expandedModule, activeFilter, dateFilter, startDate, endDate, searchQuery, user?.id],
    queryFn: async () => {
      if (!expandedModule) return null;

      if (expandedModule === 'prespend') {
        const [psSummaryRes, psReqRes] = await Promise.all([
          apiFetch(`/pre-spend?${commonParams}`),
          activeFilter === 'All' ? null : apiFetch(`/pre-spend?${requestParams}`)
        ]);
        const psSummaryData = psSummaryRes.ok ? await psSummaryRes.json() : {};
        const psReqData = psReqRes && psReqRes.ok ? await psReqRes.json() : psSummaryData;

        return {
          categories: Array.isArray(psSummaryData.categories) && psSummaryData.categories.length > 0 ? psSummaryData.categories : PRESPEND_CANONICAL_CATEGORIES,
          statusBreakdown: Array.isArray(psSummaryData.statusBreakdown) && psSummaryData.statusBreakdown.length > 0 ? psSummaryData.statusBreakdown : [],
          requests: psReqData.data && Array.isArray(psReqData.data) ? psReqData.data : [],
          statusCounts: psSummaryData.statusCounts || { All: 0, Pending: 0, Approved: 0, Implemented: 0, Rejected: 0 }
        };
      }

      if (expandedModule === 'travel') {
        const [trSummaryRes, trReqRes] = await Promise.all([
          apiFetch(`/travel-desk?${commonParams}`),
          activeFilter === 'All' ? null : apiFetch(`/travel-desk?${requestParams}`)
        ]);
        const trSummaryData = trSummaryRes.ok ? await trSummaryRes.json() : {};
        const trReqData = trReqRes && trReqRes.ok ? await trReqRes.json() : trSummaryData;

        return {
          categories: Array.isArray(trSummaryData.categories) && trSummaryData.categories.length > 0 ? trSummaryData.categories : TRAVEL_CANONICAL_CATEGORIES,
          statusBreakdown: Array.isArray(trSummaryData.statusBreakdown) && trSummaryData.statusBreakdown.length > 0 ? trSummaryData.statusBreakdown : [],
          requests: trReqData.data && Array.isArray(trReqData.data) ? trReqData.data : [],
          statusCounts: trSummaryData.statusCounts || { All: 0, Pending: 0, Approved: 0, Implemented: 0, Rejected: 0 }
        };
      }

      // change_request
      const [cRes, sRes, rRes] = await Promise.all([
        apiFetch(`/categories?${commonParams}`),
        apiFetch(`/status-breakdown?${commonParams}`),
        apiFetch(`/my-requests?${requestParams}`)
      ]);
      const cData = cRes.ok ? await cRes.json() : {};
      const sData = sRes.ok ? await sRes.json() : {};
      const rData = rRes.ok ? await rRes.json() : {};

      return {
        categories: cData.data && Array.isArray(cData.data) ? cData.data : [],
        statusBreakdown: sData.data && Array.isArray(sData.data) ? sData.data : [],
        requests: rData.data && Array.isArray(rData.data) ? rData.data : [],
        statusCounts: rData.statusCounts ? {
          All: rData.statusCounts.All || 0,
          Pending: rData.statusCounts.Pending || 0,
          InProcess: rData.statusCounts.InProcess ?? rData.statusCounts.Approved ?? 0,
          Implemented: rData.statusCounts.Implemented || 0,
          Rejected: rData.statusCounts.Rejected || 0
        } : { All: 0, Pending: 0, InProcess: 0, Implemented: 0, Rejected: 0 }
      };
    },
    enabled: Boolean(expandedModule) && !isCustomDateIncomplete,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 1000 * 60 * 5 // 5 minutes
  });

  const handleToggleExpand = (modKey) => {
    if (expandedModule === modKey) {
      setExpandedModule(null);
    } else {
      setExpandedModule(modKey);
      setActiveFilter('All');
    }
  };

  const handleExport = async (format) => {
    if (isExporting || !expandedModule) return;
    setIsExporting(true);
    try {
      const exportParams = new URLSearchParams({
        scope: 'organization',
        module: expandedModule,
        format,
        ...(activeFilter !== 'All' && { status: activeFilter }),
        ...(dateFilter !== 'overall' && { dateFilter }),
        ...(dateFilter === 'custom' && startDate && { startDate }),
        ...(dateFilter === 'custom' && endDate && { endDate }),
        ...(searchQuery && { search: searchQuery })
      });

      const res = await apiFetch(`/export?${exportParams}`);
      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      const prefix = expandedModule === 'prespend' ? 'prespend' : expandedModule === 'travel' ? 'travel_desk' : 'change_desk';
      link.download = `${prefix}_organization_dashboard_${dateStr}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export dashboard data. Please check network and permissions.');
    } finally {
      setIsExporting(false);
    }
  };

  // Build metric definitions for the 3 summary cards
  const psM = prespendSummary?.metrics || {};
  const psStatusCounts = prespendSummary?.statusCounts || {};
  const prespendCardMetrics = [
    { id: 'total', title: 'Total', count: psM.total ?? psStatusCounts.All ?? 0, isTotal: true },
    { id: 'pending', title: 'Pending', count: psM.pending ?? psStatusCounts.Pending ?? 0, isPending: true },
    { id: 'approved', title: 'Approved', count: psM.approved ?? psStatusCounts.Approved ?? 0, isApproved: true },
    { id: 'rejected', title: 'Rejected', count: psM.rejected ?? psStatusCounts.Rejected ?? 0, isRejected: true }
  ];

  const crM = crSummary?.metrics || [];
  const crStatusCounts = crSummary?.statusCounts || {};
  const crTotal = crM.find(m => m.id === 'total')?.value ?? crStatusCounts.All ?? 0;
  const crPending = crM.find(m => m.id === 'pending')?.value ?? crStatusCounts.Pending ?? 0;
  const crInProcess = crM.find(m => m.id === 'in_process' || m.id === 'approved')?.value ?? crStatusCounts.InProcess ?? crStatusCounts.Approved ?? 0;
  const crImplemented = crM.find(m => m.id === 'implemented')?.value ?? crStatusCounts.Implemented ?? 0;
  const crRejected = crM.find(m => m.id === 'rejected')?.value ?? crStatusCounts.Rejected ?? 0;
  const changeRequestCardMetrics = [
    { id: 'total', title: 'Total', count: crTotal, isTotal: true },
    { id: 'pending', title: 'Pending', count: crPending, isPending: true },
    { id: 'in_process', title: 'In Process', count: crInProcess, isApproved: true },
    { id: 'implemented', title: 'Implemented', count: crImplemented, isImplemented: true },
    { id: 'rejected', title: 'Rejected', count: crRejected, isRejected: true }
  ];

  const trM = travelSummary?.metrics || {};
  const trStatusCounts = travelSummary?.statusCounts || {};
  const travelCardMetrics = [
    { id: 'total', title: 'Total', count: trM.total ?? trStatusCounts.All ?? 0, isTotal: true },
    { id: 'pending', title: 'Pending', count: trM.pending ?? trStatusCounts.Pending ?? 0, isPending: true },
    { id: 'approved', title: 'Approved', count: trM.approved ?? trStatusCounts.Approved ?? 0, isApproved: true },
    { id: 'rejected', title: 'Rejected', count: trM.rejected ?? trStatusCounts.Rejected ?? 0, isRejected: true }
  ];

  const { text: greetingText } = getGreeting();
  const firstName = (user?.name || '').split(' ')[0] || '';

  // Data helpers for expanded section
  const categoryData = expandedDetails?.categories || [];
  const statusBreakdown = expandedDetails?.statusBreakdown || [];
  const requests = expandedDetails?.requests || [];
  const statusCounts = expandedDetails?.statusCounts || { All: 0, Pending: 0, InProcess: 0, Implemented: 0, Rejected: 0 };

  const canonicalCategoriesList = expandedModule === 'prespend'
    ? PRESPEND_CANONICAL_CATEGORIES
    : expandedModule === 'travel'
    ? TRAVEL_CANONICAL_CATEGORIES
    : CANONICAL_CATEGORIES;

  const displayCategories = canonicalCategoriesList.map((def) => {
    const found = categoryData.find(
      (c) => (c.name || c.category || c.label || '').trim().toLowerCase() === def.category.toLowerCase()
    );
    return found ? { ...def, count: found.count || 0 } : def;
  });
  const totalCategoryCount = displayCategories.reduce((sum, c) => sum + (c.count || 0), 0);

  const displayStatuses = CANONICAL_STATUSES.map((def) => {
    const found = statusBreakdown.find(
      (s) => (s.status || s.label || '').trim().toLowerCase() === def.status.toLowerCase()
    );
    const fallbackCount = def.status === 'Pending'
      ? statusCounts.Pending
      : def.status === 'Approved'
      ? (statusCounts.Approved ?? statusCounts.InProcess)
      : def.status === 'Implemented'
      ? statusCounts.Implemented
      : def.status === 'Rejected'
      ? statusCounts.Rejected
      : 0;

    return found ? { ...def, count: found.count ?? fallbackCount ?? 0 } : { ...def, count: fallbackCount ?? 0 };
  });
  const totalCRs = statusCounts.All || displayStatuses.reduce((sum, item) => sum + (item.count || 0), 0);

  const filterTabs = [
    { id: 'All', label: 'All', count: statusCounts.All || 0 },
    { id: 'Pending', label: 'Pending Approvals', count: statusCounts.Pending || 0 },
    { id: 'Approved', label: 'Approved', count: statusCounts.Approved ?? statusCounts.InProcess ?? 0 },
    { id: 'Implemented', label: expandedModule === 'travel' ? 'Completed' : expandedModule === 'prespend' ? 'Processed' : 'Implemented', count: statusCounts.Implemented || 0 },
    { id: 'Rejected', label: 'Rejected', count: statusCounts.Rejected || 0 }
  ];

  // Definition of the 3 cards in vertical order: Change Request, Pre-Spend Request, Travel Desk
  const moduleCards = [
    {
      key: 'change_request',
      title: 'Change Request',
      newButtonLabel: 'New Change Request',
      newButtonNav: 'Change Catalog',
      metrics: changeRequestCardMetrics
    },
    {
      key: 'prespend',
      title: 'Pre-Spend Request',
      newButtonLabel: 'New Pre-Spend Request',
      newButtonNav: 'Pre-Spend Request',
      metrics: prespendCardMetrics
    },
    {
      key: 'travel',
      title: 'Travel Desk',
      newButtonLabel: 'Book Travel / Stay',
      newButtonNav: 'Travel Desk',
      metrics: travelCardMetrics
    }
  ];

  const isInitialSummaryLoading = !prespendSummary && !crSummary && !travelSummary;

  if (isInitialSummaryLoading) {
    return (
      <div className="flex min-h-[60vh] w-full flex-col items-center justify-center">
        <LoadingSpinner
          size="lg"
          message={isOrgDashboard ? 'Loading Organization Dashboard...' : 'Loading Dashboard...'}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5">

      {/* Top Header */}
      <div className="w-full">
        <h1 className="m-0 text-[1.55rem] font-bold leading-[1.2] text-foreground">
          {isOrgDashboard ? 'Organization Dashboard' : `${greetingText}${firstName ? `, ${firstName}` : ''}`}
        </h1>
        <p className="mt-1 mb-0 text-[0.85rem] text-muted-foreground">
          {isOrgDashboard ? 'Company-wide requests and analytics across all modules' : 'Your requests across all modules'}
        </p>
      </div>

      {/* Global Date Filter above all cards */}
      <FilterBar
        dateValue={dateFilter}
        onDateChange={setDateFilter}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      {/* 3 Vertically Stacked Module Cards */}
      <div className="flex w-full flex-col gap-5">
        {moduleCards.map((card) => {
          const isExpanded = expandedModule === card.key;

          return (
            <div
              key={card.key}
              className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-border bg-card px-6 py-5 shadow-[var(--shadow-card)] [transition:all_0.2s_ease]"
            >
              {/* Card Header: Title on Left, Action Button (optional) on Right */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="m-0 text-base font-semibold text-foreground">
                  {card.title}
                </h3>

                <div className="flex items-center gap-3">
                  {isOrgDashboard && isExpanded && (
                    <ExportButtonGroup
                      onExportCsv={() => handleExport('csv')}
                      onExportPdf={() => handleExport('pdf')}
                      isExporting={isExporting}
                      csvLabel={isExporting ? 'Exporting...' : 'Export CSV'}
                      pdfLabel={isExporting ? 'Exporting...' : 'Export PDF'}
                    />
                  )}
                </div>
              </div>

              {/* Horizontal Metric Badges */}
              <div
                className="grid gap-[0.85rem]"
                style={{ gridTemplateColumns: `repeat(${card.metrics.length}, minmax(0, 1fr))` }}
              >
                {card.metrics.map((m, idx) => {
                  const style = getMetricStyle(m);
                  const Icon = style.icon;

                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-[0.85rem] rounded-[var(--radius-md)] border border-border bg-card px-4 py-[0.85rem] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    >
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: style.tint }}
                      >
                        <Icon size={18} color={style.color} />
                      </div>

                      <div className="flex min-w-0 flex-col">
                        <span className="text-xs font-medium leading-[1.2] text-muted-foreground">
                          {m.title}
                        </span>
                        <span className="mt-[0.15rem] text-[1.35rem] font-bold leading-[1.2] text-foreground">
                          {m.count ?? 0}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* View / Hide Details Toggle Button at Bottom Right */}
              <div className={`flex justify-end ${isExpanded ? 'pt-0' : 'pt-1'}`}>
                <button
                  type="button"
                  onClick={() => handleToggleExpand(card.key)}
                  className={`inline-flex cursor-pointer items-center gap-[0.35rem] rounded-[var(--radius-md)] border border-primary px-[0.85rem] py-[0.4rem] text-[0.825rem] font-semibold text-primary [transition:all_0.15s_ease] ${
                    isExpanded ? 'bg-[#EFF6FF]' : 'bg-white'
                  }`}
                >
                  <span>{isExpanded ? 'Hide details' : 'View details'}</span>
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {/* EXPANDED CONTENT: FilterBar, Charts, and Table */}
              {isExpanded && (
                <div className="mt-2 flex flex-col gap-5 border-t border-border pt-5">

                  {/* Filter Bar */}
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

                  {/* Side-by-Side Charts */}
                  <div className="cd-responsive-2col items-stretch">

                    {/* Chart 1: Tickets/Spend/Travel by Category */}
                    <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-border bg-card px-6 py-[1.35rem] shadow-[var(--shadow-card)]">
                      <div>
                        <div className="mb-5 flex items-center justify-between">
                          <div className="flex items-center gap-[0.55rem]">
                            <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-input">
                              <Layers size={15} className="text-foreground" />
                            </div>
                            <h3 className="m-0 text-[1.05rem] font-medium text-foreground">
                              {expandedModule === 'prespend' ? 'Spend by Category' : expandedModule === 'travel' ? 'Travel by Mode' : 'Tickets by Category'}
                            </h3>
                          </div>
                          <span className="text-[0.8rem] font-semibold text-muted-foreground">
                            {totalCategoryCount} Total
                          </span>
                        </div>

                        <div className="flex flex-col gap-[1.1rem]">
                          {displayCategories.map((cat, catIdx) => {
                            const labelText = cat.category || cat.label || cat.name || cat.title || `Category ${catIdx + 1}`;
                            const count = cat.count || 0;
                            const pct = (count > 0 && totalCategoryCount > 0)
                              ? Math.round((count / totalCategoryCount) * 100)
                              : 0;
                            const barWidth = count > 0 ? Math.max(pct, 5) : 0;
                            return (
                              <div key={labelText} className="grid grid-cols-[200px_1fr_80px] items-center gap-4">
                                <span
                                  title={labelText}
                                  className="truncate text-sm font-medium text-foreground"
                                >
                                  {labelText}
                                </span>

                                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                                  <div
                                    className="h-full rounded-full [transition:width_0.5s_ease]"
                                    style={{ width: `${barWidth}%`, backgroundColor: cat.color || '#2563EB' }}
                                  />
                                </div>

                                <span className="whitespace-nowrap text-right text-sm font-semibold text-foreground">
                                  {count} <span className="text-[0.8rem] font-medium text-muted-foreground">({pct}%)</span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Chart 2: Status Breakdown */}
                    <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-border bg-card px-6 py-[1.35rem] shadow-[var(--shadow-card)]">
                      <div>
                        <div className="mb-4 flex items-center justify-between">
                          <div className="flex items-center gap-[0.55rem]">
                            <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-input">
                              <PieChart size={15} className="text-foreground" />
                            </div>
                            <h3 className="m-0 text-[1.05rem] font-medium text-foreground">
                              Status Breakdown
                            </h3>
                          </div>
                          <span className="text-[0.8rem] font-semibold text-muted-foreground">
                            {totalCRs} Total
                          </span>
                        </div>

                        {/* Donut Chart and Legend */}
                        <div className="cd-responsive-breakdown mt-[0.85rem]">
                          <div className="relative flex size-[140px] shrink-0 items-center justify-center">
                            <svg width="140" height="140" viewBox="0 0 42 42">
                              <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="var(--border-color)" strokeWidth="4.5" />
                              {(() => {
                                let accumPercent = 0;
                                return displayStatuses.map((sb) => {
                                  const statusKey = sb.status || sb.label;
                                  const pct = totalCRs > 0 ? (sb.count / totalCRs) * 100 : 0;
                                  if (pct === 0) return null;
                                  const offset = 100 - accumPercent + 25;
                                  accumPercent += pct;
                                  const isHovered = hoveredStatus === statusKey;
                                  const isDimmed = hoveredStatus && !isHovered;
                                  return (
                                    <circle
                                      key={statusKey}
                                      cx="21"
                                      cy="21"
                                      r="15.91549430918954"
                                      fill="transparent"
                                      stroke={sb.color || 'var(--brand-primary)'}
                                      strokeDasharray={`${pct} ${100 - pct}`}
                                      strokeDashoffset={offset}
                                      strokeWidth={isHovered ? 6.5 : 4.5}
                                      className={`[transition:stroke-width_0.15s_ease,opacity_0.15s_ease] ${isDimmed ? 'opacity-35' : 'opacity-100'}`}
                                    />
                                  );
                                });
                              })()}
                            </svg>

                            <div className="absolute text-center">
                              <div className="text-[1.45rem] font-bold leading-none text-foreground">{totalCRs}</div>
                              <div className="mt-[0.15rem] text-[0.7rem] font-medium text-muted-foreground">
                                {expandedModule === 'travel' ? 'Total Trips' : expandedModule === 'prespend' ? 'Total Reqs' : 'Total CRs'}
                              </div>
                            </div>
                          </div>

                          <div className="flex min-w-0 flex-1 flex-col gap-3">
                            {displayStatuses.map((sb, sbIdx) => {
                              const statusText = sb.label || sb.status || sb.name || `Status ${sbIdx + 1}`;
                              const pct = totalCRs > 0 ? Math.round((sb.count / totalCRs) * 100) : 0;
                              return (
                                <div
                                  key={statusText}
                                  onMouseEnter={() => setHoveredStatus(sb.status || sb.label)}
                                  onMouseLeave={() => setHoveredStatus(null)}
                                  onClick={() => setActiveFilter(sb.status)}
                                  className={`grid cursor-pointer grid-cols-[14px_1fr_auto] items-center gap-[0.65rem] rounded-[var(--radius-md)] px-2 py-[0.35rem] [transition:background-color_0.15s_ease] ${
                                    hoveredStatus === (sb.status || sb.label) ? 'bg-input' : 'bg-transparent'
                                  }`}
                                >
                                  <div
                                    className="size-2.5 shrink-0 rounded-[3px]"
                                    style={{ backgroundColor: sb.color || 'var(--brand-primary)' }}
                                  />
                                  <span className="truncate text-[0.85rem] font-medium text-foreground">
                                    {statusText}
                                  </span>
                                  <span className="whitespace-nowrap text-right text-[0.85rem] font-semibold text-foreground">
                                    {sb.count} <span className="text-[0.775rem] font-medium text-muted-foreground">({pct}%)</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Requests Table */}
                  <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-[var(--shadow-card)]">
                    <div className="flex items-center justify-between border-b border-border px-5 py-4">
                      <div>
                        <h3 className="m-0 text-base font-semibold text-foreground">
                          {expandedModule === 'prespend'
                            ? (isOrgDashboard ? 'Organization Pre-Spend Requests' : 'My Pre-Spend Requests')
                            : expandedModule === 'travel'
                            ? (isOrgDashboard ? 'Organization Travel Bookings' : 'My Travel Bookings')
                            : (isOrgDashboard ? 'Organization Change Requests' : 'My Change Requests')}
                        </h3>
                        <p className="mt-[0.2rem] mb-0 text-[0.8rem] text-muted-foreground">
                          Showing {requests.length} {expandedModule === 'travel' ? 'booking' : 'request'}{requests.length === 1 ? '' : 's'} matching current filters
                        </p>
                      </div>
                    </div>

                    <div className="w-full overflow-x-auto">
                      <table className={`w-full border-collapse text-left text-[0.85rem] ${isOrgDashboard ? 'min-w-[1060px]' : 'min-w-[920px]'}`}>
                        <thead>
                          <tr className="border-b border-border bg-input">
                            <th className="w-[90px] min-w-[90px] whitespace-nowrap px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                              {expandedModule === 'travel' ? 'TR ID' : expandedModule === 'prespend' ? 'PS ID' : 'CR ID'}
                            </th>
                            <th className="min-w-[220px] px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                              {expandedModule === 'travel' ? 'Route / Location' : expandedModule === 'prespend' ? 'Item / Description' : 'Title'}
                            </th>
                            <th className="w-[160px] min-w-[140px] px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                              {expandedModule === 'travel' ? 'Mode' : 'Category'}
                            </th>
                            {isOrgDashboard && (
                              <th className="w-[180px] min-w-[160px] px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Requester Details</th>
                            )}
                            <th className="w-[110px] min-w-[110px] whitespace-nowrap px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                              Requested On
                            </th>
                            {expandedModule === 'travel' && (
                              <th className="w-[110px] min-w-[110px] whitespace-nowrap px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                                Travel Date
                              </th>
                            )}
                            <th className="w-[110px] min-w-[110px] whitespace-nowrap px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Closed Date</th>
                            {isOrgDashboard && (
                              <th className="w-[150px] min-w-[140px] px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Approved By</th>
                            )}
                            <th className="w-[130px] min-w-[130px] whitespace-nowrap px-4 py-[0.85rem] text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Status</th>
                            <th className="w-[90px] min-w-[90px] whitespace-nowrap px-4 py-[0.85rem] text-right text-[0.725rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {requests.length > 0 ? (
                            requests.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(cr => {
                              const requesterEmail = cr.employeeEmail || cr.requesterEmail || cr.managerEmail || '';
                              const requesterName = cr.employeeName || cr.requester || cr.requesterName || (requesterEmail ? requesterEmail.split('@')[0].replace(/[\._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—');
                              const approverEmail = cr.status === 'Rejected'
                                ? (cr.rejectedByEmail || cr.decidedByEmail || cr.approvedByEmail || '')
                                : (cr.approvedByEmail || cr.decidedByEmail || '');
                              const approverDisplayName = cr.status === 'Rejected'
                                ? (cr.rejectedBy || cr.decidedBy || cr.approvedBy || '')
                                : (cr.approvedBy || cr.decidedBy || (['Approved', 'Implemented'].includes(cr.status) ? (approverEmail ? approverEmail.split('@')[0].replace(/[\._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Approver') : ''));

                              const isUrgentPreSpend = expandedModule === 'prespend' && (cr.isUrgent || cr.urgent);
                              const requestedOnDate = cr.raisedDate || (cr.submittedAt ? new Date(cr.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (cr.createdAt ? new Date(cr.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'));

                              return (
                                <tr key={cr.id} className="border-b border-border">
                                  <td className="whitespace-nowrap px-4 py-[0.85rem] font-medium text-foreground [font-family:var(--font-mono)]">{cr.requestCode || cr.id}</td>
                                  <td className="min-w-[260px] px-4 py-[0.85rem] font-medium leading-[1.4] text-foreground">{cr.title}</td>
                                  <td className="min-w-[160px] px-4 py-[0.85rem] text-muted-foreground">{cr.category}</td>
                                  {isOrgDashboard && (
                                    <td className="min-w-[180px] px-4 py-[0.85rem]">
                                      <div className="flex flex-col gap-[0.15rem]">
                                        <span className="text-[0.825rem] font-semibold text-foreground">
                                          {requesterName}
                                        </span>
                                        {requesterEmail && (
                                          <span className="text-[0.725rem] text-muted-foreground">
                                            {requesterEmail}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  )}
                                  <td className="whitespace-nowrap px-4 py-[0.85rem] text-muted-foreground">{requestedOnDate}</td>
                                  {expandedModule === 'travel' && (
                                    <td className="whitespace-nowrap px-4 py-[0.85rem] text-muted-foreground">
                                      {cr.departureDate ? new Date(cr.departureDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                    </td>
                                  )}
                                  <td className="whitespace-nowrap px-4 py-[0.85rem] text-muted-foreground">{cr.closedDate || '—'}</td>
                                  {isOrgDashboard && (
                                    <td className="min-w-[140px] px-4 py-[0.85rem]">
                                      {approverDisplayName ? (
                                        <div className="flex flex-col gap-[0.15rem]">
                                          <span className="text-[0.825rem] font-semibold text-foreground">
                                            {approverDisplayName}
                                          </span>
                                          {approverEmail && approverEmail !== approverDisplayName && (
                                            <span className="text-[0.725rem] text-muted-foreground">
                                              {approverEmail}
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </td>
                                  )}
                                  <td className="whitespace-nowrap px-4 py-[0.85rem]">
                                    <div className="flex flex-col items-start gap-[0.3rem]">
                                      <div
                                        className="inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-[var(--radius-lg)] px-[0.65rem] py-[0.2rem] text-[0.775rem] font-medium"
                                        style={{ backgroundColor: cr.statusBg || '#FEF3C7', color: cr.statusColor || '#D97706' }}
                                      >
                                        <span
                                          className="size-1.5 rounded-full"
                                          style={{ backgroundColor: cr.statusDot || '#D97706' }}
                                        />
                                        <span className="whitespace-nowrap">
                                          {(cr.status || '').toLowerCase() === 'pending' ? 'Pending Approvals' : cr.status}
                                        </span>
                                      </div>
                                      {isUrgentPreSpend && (
                                        <div className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-[#FECACA] bg-[#FEF2F2] px-2 py-[0.15rem] text-[0.7rem] font-bold text-[#DC2626]">
                                          <AlertTriangle size={11} strokeWidth={2.5} />
                                          <span>Urgent</span>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-[0.85rem] text-right">
                                    <div className="flex items-center justify-end gap-[0.6rem]">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedRequest(cr)}
                                        className="cursor-pointer border-0 bg-transparent text-[0.825rem] font-medium text-info"
                                      >
                                        Details
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : isLoadingDetails ? (
                            <tr>
                              <td colSpan={10} className="p-12 text-center">
                                <LoadingSpinner size="md" message="Loading requests..." />
                              </td>
                            </tr>
                          ) : (
                            <tr>
                              <td colSpan={10} className="p-10 text-center text-muted-foreground">
                                <span className="text-sm">
                                  {expandedModule === 'prespend'
                                    ? 'No pre-spend requests found.'
                                    : expandedModule === 'travel'
                                    ? 'No travel bookings found.'
                                    : 'No change requests found.'}
                                </span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    <Pagination
                      currentPage={currentPage}
                      pageSize={pageSize}
                      totalItems={requests.length}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={(size) => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                    />
                  </div>

                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* Domain-Specific Details Modals */}
      {selectedRequest && expandedModule === 'prespend' && (
        <PreSpendDetailsModal
          item={selectedRequest}
          user={user}
          onClose={() => setSelectedRequest(null)}
        />
      )}

      {selectedRequest && expandedModule === 'travel' && (
        <TravelDetailsModal
          item={selectedRequest}
          user={user}
          onClose={() => setSelectedRequest(null)}
        />
      )}

      {selectedRequest && expandedModule === 'change_request' && (
        <ChangeRequestModal
          cr={selectedRequest}
          user={user}
          onClose={() => setSelectedRequest(null)}
          onApprove={null}
          onReject={null}
          onSendBack={null}
          onImplement={null}
        />
      )}

    </div>
  );
}

export default React.memo(DashboardPage);
