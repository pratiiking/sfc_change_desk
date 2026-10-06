import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useOutletContext, useLocation, useParams } from 'react-router-dom';
import LoginPage from './pages/login.page';
import AppLayout from './components/layout/app.layout';
import DashboardPage from './pages/dashboard.page';
import ChangeCatalogPage from './pages/catalog.page';
import ChangeRequestFormPage from './pages/changeRequestForm.page';
import MyWorklistPage from './pages/worklist.page';
import SettingsPage from './pages/settings.page';
import ComingSoonPage from './pages/comingSoon.page';
import PreSpendPage from './pages/preSpend.page';
import TravelDeskPage from './pages/travelDesk.page';
import VisitorAppointmentPage from './pages/visitorAppointment.page';
import ApprovalActionPage from './pages/approvalAction.page';
import { getSession, saveSession, clearSession, fetchMe } from './lib/auth.lib';
import { ROLE } from './lib/permissions.lib';

/* ── Route Wrapper Helpers ───────────────────────────────────── */
function DashboardRoute({ isOrg = false }) {
  const { user, searchQuery, onNavigate } = useOutletContext();
  const location = useLocation();

  const canViewOrgDashboard = Array.isArray(user?.permissions) && user.permissions.includes('dashboard.org.view');

  if (isOrg && !canViewOrgDashboard) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardPage
      user={user}
      searchQuery={searchQuery}
      onNavigate={onNavigate}
      initialData={location.state}
      isOrgDashboard={isOrg}
    />
  );
}

function CatalogRoute() {
  const { user, searchQuery, onNavigate } = useOutletContext();
  const location = useLocation();
  return (
    <ChangeCatalogPage
      user={user}
      searchQuery={searchQuery}
      onNavigate={onNavigate}
      initialData={location.state}
    />
  );
}

function ChangeRequestRoute() {
  const { user, searchQuery, onNavigate } = useOutletContext();
  const location = useLocation();
  const params = useParams();
  const initialData = location.state || (params.id ? { id: params.id } : null);

  return (
    <ChangeRequestFormPage
      user={user}
      searchQuery={searchQuery}
      onNavigate={onNavigate}
      initialData={initialData}
    />
  );
}

function WorklistRoute() {
  const { user, searchQuery, onNavigate } = useOutletContext();
  const location = useLocation();

  const roleName = (user?.role || '').toLowerCase();
  const roleId = user?.roleId || '';
  const isSuperAdmin = roleId === ROLE.SUPER_ADMIN || roleName.includes('super');
  const isBoardUser = roleId === 'role-board' || roleName.includes('board');
  const isTravelAdmin = roleId === ROLE.TRAVEL_ADMIN || (roleName.includes('admin') && roleName.includes('travel'));
  const isPreSpendAdmin = roleId === ROLE.PRESPEND_ADMIN || (roleName.includes('admin') && (roleName.includes('spend') || roleName.includes('prespend')));
  const isChangeAdmin = roleId === ROLE.CHANGE_ADMIN || (roleName.includes('admin') && !isTravelAdmin && !isPreSpendAdmin && !isSuperAdmin);
  const isAdmin = isSuperAdmin || isTravelAdmin || isPreSpendAdmin || isChangeAdmin || roleId === ROLE.ADMIN_LEGACY || roleName.includes('admin');
  const isChangeManager = roleId === ROLE.CHANGE_MANAGER || roleName.includes('manager');
  const isChangeImplementer = roleId === ROLE.CHANGE_IMPLEMENTER || roleName.includes('implementer');
  const isApprover = isSuperAdmin || isBoardUser || isAdmin || isChangeManager || isChangeImplementer;

  if (!isApprover) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <MyWorklistPage
      user={user}
      searchQuery={searchQuery}
      onNavigate={onNavigate}
      initialData={location.state}
    />
  );
}

function SettingsRoute() {
  const { user, searchQuery, onNavigate } = useOutletContext();
  const canManageUsers = Array.isArray(user?.permissions) && user.permissions.includes('settings.users.manage');

  if (!canManageUsers) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <SettingsPage
      user={user}
      searchQuery={searchQuery}
      onNavigate={onNavigate}
    />
  );
}

function PreSpendRoute() {
  const { user, searchQuery, onNavigate } = useOutletContext();
  return <PreSpendPage user={user} searchQuery={searchQuery} onNavigate={onNavigate} />;
}

function TravelDeskRoute() {
  const { user, searchQuery, onNavigate } = useOutletContext();
  return <TravelDeskPage user={user} searchQuery={searchQuery} onNavigate={onNavigate} />;
}

function VisitorAppointmentRoute() {
  const { user, onNavigate } = useOutletContext();
  return <VisitorAppointmentPage user={user} onNavigate={onNavigate} />;
}

/* ── Main App Router ─────────────────────────────────────────── */
export default function App() {
  const [session, setSession] = useState(() => getSession());

  // Check for external approval token in URL (strictly on approval-action routes)
  const isApprovalAction =
    typeof window !== 'undefined' &&
    (window.location.pathname.includes('approval-action') ||
      (window.location.pathname.includes('approval') && new URLSearchParams(window.location.search).has('token')));

  useEffect(() => {
    if (!session || isApprovalAction) return;
    fetchMe().then((user) => {
      if (user) {
        const next = { ...getSession(), user };
        saveSession(next);
        setSession(next);
      }
    });
  }, [isApprovalAction]);

  const handleLogin = (nextSession) => {
    saveSession(nextSession);
    setSession(nextSession);
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
  };

  if (isApprovalAction) {
    return <ApprovalActionPage />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Unauthenticated Login Route */}
        <Route
          path="/login"
          element={session ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={handleLogin} />}
        />

        {/* Authenticated Layout Shell */}
        <Route
          element={session ? <AppLayout user={session.user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route path="/my-requests" element={<DashboardRoute />} />
          <Route path="/org-dashboard" element={<DashboardRoute isOrg={true} />} />
          <Route path="/catalog" element={<CatalogRoute />} />
          <Route path="/change-requests/new" element={<ChangeRequestRoute />} />
          <Route path="/change-requests/:id" element={<ChangeRequestRoute />} />
          <Route path="/worklist" element={<WorklistRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/pre-spend" element={<PreSpendRoute />} />
          <Route path="/travel-desk" element={<TravelDeskRoute />} />
          <Route path="/visitor-appointment" element={<VisitorAppointmentRoute />} />
        </Route>

        {/* Catch-All Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
