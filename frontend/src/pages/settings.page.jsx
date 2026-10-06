import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Download, AlertTriangle } from 'lucide-react';
import FilterBar from '../components/ui/filterBar.component';
import { ExportButtonGroup, LoadingSpinner, Pagination } from '../components/ui/primitives.component';
import { apiFetch } from '../lib/apiFetch.lib';
import { useToast } from '../context/ToastContext';
import { ROLE } from '../lib/permissions.lib';

/** Cleanly format raw SQL/ISO timestamps into '21 Sep 2026, 12:48 PM' (showing date, hour, and minute only) */
const formatAuditTimestamp = (raw) => {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) {
      // If it's already a formatted string like '26 Aug 2026, 10:42 AM', return as-is or strip milliseconds
      return String(raw).replace(/\.\d{3}\s*\+00:00/i, '').replace(/:\d{2}\.\d{3}/i, '');
    }
    const day = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${day}, ${time}`;
  } catch {
    return String(raw);
  }
};

function SettingsPage({ user }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isSuperAdmin = user?.roleId === ROLE.SUPER_ADMIN || (user?.role || '').toLowerCase() === 'super admin';
  const isRequester = !isSuperAdmin && (user?.roleId === ROLE.REQUESTER || user?.role === 'Requester');
  const canManageUsers = Array.isArray(user?.permissions) && user.permissions.includes('settings.users.manage');

  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const defaultUsers = [];

  const [activeTab, setActiveTab] = useState(() => {
    const hash = (window.location.hash || '').replace('#', '').toLowerCase();
    return ['users', 'audit'].includes(hash) ? hash : 'users';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = (window.location.hash || '').replace('#', '').toLowerCase();
      if (['users', 'audit'].includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
  };
  const [auditFilter, setAuditFilter] = useState('All activity');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);

  // Pagination states
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(10);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  useEffect(() => {
    setUsersPage(1);
  }, [activeTab]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditFilter, activeTab]);

  const defaultCategoriesList = [
    { id: 'cat-asset', name: 'IT Asset' },
    { id: 'cat-o365', name: 'Office 365 & Collaboration' },
    { id: 'cat-acc', name: 'Access & Security' },
    { id: 'cat-net', name: 'Network & Connectivity' },
    { id: 'cat-sec', name: 'Security Tools & Policies' },
    { id: 'cat-srv', name: 'Server & Infra' }
  ];

  const [newUserCmCategories, setNewUserCmCategories] = useState([]);
  const [newUserCiCategories, setNewUserCiCategories] = useState([]);
  const [editingUserCmCategories, setEditingUserCmCategories] = useState([]);
  const [editingUserCiCategories, setEditingUserCiCategories] = useState([]);

  const { data: categoriesData } = useQuery({
    queryKey: ['settings-categories'],
    enabled: activeTab === 'users',
    queryFn: async () => {
      const res = await apiFetch('/catalog/categories');
      if (!res.ok) return null;
      const body = await res.json();
      return body.data && Array.isArray(body.data) ? body.data : null;
    }
  });
  const categories = categoriesData || defaultCategoriesList;

  const { data: rolesData } = useQuery({
    queryKey: ['settings-roles'],
    enabled: activeTab === 'users',
    queryFn: async () => {
      const res = await apiFetch('/settings/roles');
      if (!res.ok) return null;
      const body = await res.json();
      return body.data && Array.isArray(body.data) ? body.data : null;
    }
  });
  const roles = rolesData || [];

  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['settings-users'],
    enabled: activeTab === 'users',
    queryFn: async () => {
      const res = await apiFetch('/settings/users');
      if (!res.ok) return null;
      const body = await res.json();
      return body.data && Array.isArray(body.data) ? body.data : null;
    }
  });
  const users = usersData || defaultUsers;

  const { data: auditLogsData, isLoading: isLoadingAuditLogs } = useQuery({
    queryKey: ['settings-audit-logs', auditFilter, auditPage, auditPageSize],
    enabled: activeTab === 'audit',
    queryFn: async () => {
      const params = new URLSearchParams({ page: auditPage, limit: auditPageSize });
      if (auditFilter && auditFilter !== 'All activity') params.set('filter', auditFilter);
      const res = await apiFetch(`/settings/audit-logs?${params}`);
      if (!res.ok) return { data: [], total: 0 };
      const body = await res.json();
      return {
        data: body.data && Array.isArray(body.data) ? body.data : [],
        total: typeof body.total === 'number' ? body.total : 0
      };
    }
  });
  const auditLogs = auditLogsData?.data || [];
  const auditLogsTotal = auditLogsData?.total || 0;
  const ROLE_TO_ID = {
    'Super Admin': ROLE.SUPER_ADMIN,
    'Admin': ROLE.ADMIN_LEGACY,
    'Change Desk Admin': ROLE.CHANGE_ADMIN,
    'Pre-Spend Admin': ROLE.PRESPEND_ADMIN,
    'Travel Desk Admin': ROLE.TRAVEL_ADMIN,
    'Change Manager': ROLE.CHANGE_MANAGER,
    'Change Implementer': ROLE.CHANGE_IMPLEMENTER,
    'Board Member': ROLE.BOARD
  };

  const ALL_ASSIGNABLE_ROLES = [
    'Admin',
    'Change Desk Admin',
    'Pre-Spend Admin',
    'Travel Desk Admin',
    'Change Manager',
    'Change Implementer',
    'Board Member',
    'Super Admin'
  ];

  // Lower rank = higher authority (hot_desk_roles.rank). A user can only ever
  // be assigned a role strictly below their own rank — never their own level
  // or above, so those options are hidden from the dropdown entirely.
  const roleRankById = new Map(roles.map(r => [r.id, r.rank]));
  const actorRank = roleRankById.get(user?.roleId) ?? -Infinity;
  const ASSIGNABLE_ROLES = ALL_ASSIGNABLE_ROLES
    .filter((name) => {
      const rank = roleRankById.get(ROLE_TO_ID[name]);
      return rank !== undefined && rank > actorRank;
    })
    .sort((a, b) => roleRankById.get(ROLE_TO_ID[a]) - roleRankById.get(ROLE_TO_ID[b]));

  const handleOpenManageUser = async (targetUser) => {
    if (isRequester) return;
    
    // Extract existing roles
    const existingRoles = Array.isArray(targetUser.roles) && targetUser.roles.length > 0
      ? targetUser.roles.map(r => typeof r === 'string' ? r : r.roleName || r.name).filter(Boolean)
      : [targetUser.role || 'Change Desk Admin'];

    setEditingUser({
      id: targetUser.id,
      name: targetUser.name || '',
      email: targetUser.email || '',
      empId: targetUser.empId || targetUser.employeeId || '',
      roles: existingRoles,
      selectedRoleToAdd: ''
    });
    setEditingUserCmCategories([]);
    setEditingUserCiCategories([]);
    setIsLoadingCategories(true);
    try {
      const [cmRes, ciRes] = await Promise.all([
        apiFetch(`/settings/change-manager-categories/${targetUser.id}`).catch(() => null),
        apiFetch(`/settings/change-implementer-categories/${targetUser.id}`).catch(() => null)
      ]);

      if (cmRes && cmRes.ok) {
        const body = await cmRes.json();
        if (body.data && Array.isArray(body.data)) {
          setEditingUserCmCategories(body.data.map(d => d.categoryId));
        }
      }

      if (ciRes && ciRes.ok) {
        const body = await ciRes.json();
        if (body.data && Array.isArray(body.data)) {
          setEditingUserCiCategories(body.data.map(d => d.categoryId));
        }
      }
    } catch (err) {
      console.warn('Failed to fetch user categories:', err);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleSaveManageUser = async (e) => {
    if (e) e.preventDefault();
    if (!editingUser || isSavingUser) return;

    const assignedRoles = editingUser.roles && editingUser.roles.length > 0
      ? editingUser.roles
      : ['Change Desk Admin'];

    setIsSavingUser(true);

    const primaryRoleName = assignedRoles[0];
    const roleId = ROLE_TO_ID[primaryRoleName] || ROLE.CHANGE_ADMIN;
    const hasCM = assignedRoles.includes('Change Manager');
    const hasCI = assignedRoles.includes('Change Implementer');

    const updatedUserObj = {
      name: editingUser.name,
      empId: editingUser.empId,
      role: primaryRoleName,
      roleId,
      roles: assignedRoles,
      categoryIds: Array.from(new Set([...editingUserCmCategories, ...editingUserCiCategories])),
      cmCategoryIds: hasCM ? editingUserCmCategories : [],
      ciCategoryIds: hasCI ? editingUserCiCategories : []
    };

    try {
      const res = await apiFetch(`/settings/users/${editingUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updatedUserObj)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Failed to update user (${res.status})`);
      }

      if (hasCM) {
        await apiFetch(`/settings/change-manager-categories/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({ categoryIds: editingUserCmCategories })
        }).catch(err => console.warn('Failed to update CM categories:', err));
      } else {
        await apiFetch(`/settings/change-manager-categories/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({ categoryIds: [] })
        }).catch(() => {});
      }

      if (hasCI) {
        await apiFetch(`/settings/change-implementer-categories/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({ categoryIds: editingUserCiCategories })
        }).catch(err => console.warn('Failed to update CI categories:', err));
      } else {
        await apiFetch(`/settings/change-implementer-categories/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({ categoryIds: [] })
        }).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
      toast.success('User changes saved successfully');
      setEditingUser(null);
    } catch (err) {
      console.error('Failed to update user via API:', err);
      toast.error(`Error updating user: ${err.message}`);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteManageUser = () => {
    if (!editingUser || isSavingUser) return;
    setUserToDelete(editingUser);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete || isSavingUser) return;

    setIsSavingUser(true);
    try {
      const res = await apiFetch(`/settings/users/${userToDelete.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Failed to deactivate user (${res.status})`);
      }

      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
      toast.success('User deactivated and roles revoked successfully');
      setUserToDelete(null);
      setEditingUser(null);
    } catch (err) {
      console.error('Failed to deactivate user via API:', err);
      toast.error(`Error deactivating user: ${err.message}`);
    } finally {
      setIsSavingUser(false);
    }
  };

  // Invite User Modal Form State
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    empId: '',
    roles: [],
    selectedRoleToAdd: ''
  });

  const handleSaveInviteUser = async (e) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email) return;

    const assignedRoles = (newUser.roles && newUser.roles.length > 0) ? newUser.roles : [];

    const primaryRoleName = assignedRoles.length > 0 ? assignedRoles[0] : 'Requester';
    const roleId = ROLE_TO_ID[primaryRoleName] || ROLE.REQUESTER;
    const hasCM = assignedRoles.includes('Change Manager') || newUser.selectedRoleToAdd === 'Change Manager';
    const hasCI = assignedRoles.includes('Change Implementer') || newUser.selectedRoleToAdd === 'Change Implementer';
    const allCategoryIds = Array.from(new Set([...(hasCM ? newUserCmCategories : []), ...(hasCI ? newUserCiCategories : [])]));

    const invitePayload = {
      name: newUser.name,
      email: newUser.email,
      empId: newUser.empId || undefined,
      employeeId: newUser.empId || undefined,
      role: primaryRoleName,
      roleId,
      roles: assignedRoles,
      categoryIds: allCategoryIds,
      cmCategoryIds: hasCM ? newUserCmCategories : [],
      ciCategoryIds: hasCI ? newUserCiCategories : [],
      status: newUser.status
    };

    try {
      const res = await apiFetch('/settings/users', {
        method: 'POST',
        body: JSON.stringify(invitePayload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Failed to invite user (${res.status})`);
      }

      const body = await res.json();
      const savedUser = body.data;
      const savedUserId = savedUser?.id || savedUser?.userKey;

      if (hasCM && savedUserId && newUserCmCategories.length > 0) {
        await apiFetch(`/settings/change-manager-categories/${savedUserId}`, {
          method: 'PUT',
          body: JSON.stringify({ categoryIds: newUserCmCategories })
        }).catch(() => {});
      }
      if (hasCI && savedUserId && newUserCiCategories.length > 0) {
        await apiFetch(`/settings/change-implementer-categories/${savedUserId}`, {
          method: 'PUT',
          body: JSON.stringify({ categoryIds: newUserCiCategories })
        }).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
      toast.success('User invited successfully');
      setIsInviteModalOpen(false);
      setNewUser({
        name: '',
        email: '',
        empId: '',
        roles: [],
        selectedRoleToAdd: ''
      });
      setNewUserCmCategories([]);
      setNewUserCiCategories([]);
    } catch (err) {
      console.error('Failed to invite user via API:', err);
      toast.error(`Error inviting user: ${err.message}`);
    }
  };

  const handleExportAuditExcel = async () => {
    try {
      const res = await apiFetch('/settings/audit-logs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'excel', filter: auditFilter })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${auditFilter.toLowerCase().replace(/\s+/g, '_')}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) {
      console.error('Failed to export audit logs to Excel:', err);
    }
  };

  const handleExportAuditPDF = async () => {
    try {
      const res = await apiFetch('/settings/audit-logs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'pdf', filter: auditFilter })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${auditFilter.toLowerCase().replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) {
      console.error('Failed to export audit logs to PDF:', err);
    }
  };

  const auditFilters = [
    'All activity',
    'Change requests',
    'Pre-Spend requests',
    'Travel requests',
    'Approvals',
    'Rejected',
    'User & role changes'
  ];

  if (!canManageUsers) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="mb-2 text-xl font-medium text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">Settings and user management are not accessible to your role.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.45rem] font-bold leading-[1.2] text-foreground">
            Settings
          </h1>
          <p className="mt-[0.2rem] text-[0.85rem] text-muted-foreground">
            Users and system-wide audit history
          </p>
        </div>

        {/* Right Header Actions */}
        {canManageUsers && activeTab === 'users' && (
          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="inline-flex cursor-pointer items-center gap-[0.4rem] rounded-lg border-0 bg-primary px-[1.1rem] py-[0.55rem] text-[0.85rem] font-medium text-[#FFFFFF] shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
          >
            <Plus size={16} />
            <span>Invite user</span>
          </button>
        )}
        {activeTab === 'audit' && (
          <ExportButtonGroup
            onExportCsv={handleExportAuditExcel}
            onExportPdf={handleExportAuditPDF}
            csvLabel="Export CSV"
            pdfLabel="Export PDF"
          />
        )}
      </div>

      {/* Main Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {[
          { id: 'users', label: 'Users' },
          { id: 'audit', label: 'Audit Logs' }
        ].map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`cursor-pointer rounded-[var(--radius-lg)] border-0 px-[1.1rem] py-[0.45rem] text-[0.85rem] font-medium ${
                isActive ? 'bg-[#10172A] text-[#FFFFFF]' : 'bg-transparent text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
            <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[650px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-input text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="whitespace-nowrap px-[0.85rem] py-[0.75rem]">USER</th>
                    <th className="whitespace-nowrap px-[0.85rem] py-[0.75rem]">EMAIL ID</th>
                    <th className="whitespace-nowrap px-[0.85rem] py-[0.75rem]">ROLE</th>
                    <th className="whitespace-nowrap px-[0.85rem] py-[0.75rem] text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingUsers ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center">
                        <LoadingSpinner size="md" message="Loading users..." />
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.slice((usersPage - 1) * usersPageSize, usersPage * usersPageSize).map((u, idx, arr) => (
                      <tr key={u.id} className={idx === arr.length - 1 ? '' : 'border-b border-border'}>
                        <td className="whitespace-nowrap px-[0.85rem] py-[0.75rem] text-sm font-medium text-foreground">{u.name}</td>
                        <td className="whitespace-nowrap px-[0.85rem] py-[0.75rem] font-[var(--font-mono)] text-[0.825rem] text-muted-foreground">{u.email}</td>
                        <td className="whitespace-nowrap px-[0.85rem] py-[0.75rem]">
                          <div className="flex flex-wrap items-center gap-[0.35rem]">
                            {(Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [{ roleName: u.role || 'Change Desk Admin' }]).map((r, rIdx) => {
                              const rName = typeof r === 'string' ? r : (r.roleName || r.name);
                              return (
                                <span
                                  key={rIdx}
                                  className="rounded-[5px] border border-border bg-input px-[0.55rem] py-[0.2rem] text-xs font-medium text-foreground"
                                >
                                  {rName}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-[0.85rem] py-[0.75rem] text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenManageUser(u)}
                            disabled={isRequester}
                            className={`whitespace-nowrap border-0 bg-transparent text-[0.8rem] font-semibold ${
                              isRequester ? 'cursor-not-allowed text-muted-foreground opacity-40' : 'cursor-pointer text-info opacity-100'
                            }`}
                          >
                            Manage user
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Users Pagination */}
          {!isLoadingUsers && users.length > 0 && (
            <Pagination
              currentPage={usersPage}
              pageSize={usersPageSize}
              totalItems={users.length}
              onPageChange={setUsersPage}
              onPageSizeChange={(size) => {
                setUsersPageSize(size);
                setUsersPage(1);
              }}
            />
          )}
        </div>
      )}

      {/* TAB 2: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div className="flex flex-col gap-4">

          {/* Audit Sub-Filter Pills Bar */}
          <FilterBar
            variant="inline"
            tabs={auditFilters.map((af) => ({ id: af, label: af }))}
            activeTab={auditFilter}
            onTabChange={setAuditFilter}
          />

          {/* Audit Logs Table */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(16,21,30,0.04)]">
            <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[780px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-input text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-4 py-3">TIMESTAMP</th>
                    <th className="px-4 py-3">ACTOR</th>
                    <th className="px-4 py-3">ACTION</th>
                    <th className="px-4 py-3">REFERENCE</th>
                    <th className="px-4 py-3">EMPLOYEE EMAIL</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingAuditLogs ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <LoadingSpinner size="md" message={`Loading audit records for "${auditFilter}"...`} />
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No audit records found for "{auditFilter}".
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log, idx, arr) => (
                      <tr key={log.id} className={idx === arr.length - 1 ? '' : 'border-b border-border'}>
                        <td className="px-4 py-[0.85rem] font-[var(--font-mono)] text-[0.825rem] text-muted-foreground">
                          {formatAuditTimestamp(log.timestamp)}
                        </td>
                        <td className="px-4 py-[0.85rem] text-sm font-medium text-foreground">
                          {log.actor}
                        </td>
                        <td className="px-4 py-[0.85rem] text-[0.835rem] font-semibold text-foreground">
                          {log.action}
                        </td>
                        <td className="px-4 py-[0.85rem] font-[var(--font-mono)] text-[0.825rem] text-muted-foreground">
                          {log.reference}
                        </td>
                        <td className="px-4 py-[0.85rem] font-[var(--font-mono)] text-[0.825rem] text-muted-foreground">
                          {log.employeeEmail || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Logs Pagination */}
          {!isLoadingAuditLogs && auditLogs.length > 0 && (
            <Pagination
              currentPage={auditPage}
              pageSize={auditPageSize}
              totalItems={auditLogsTotal}
              onPageChange={setAuditPage}
              onPageSizeChange={(size) => {
                setAuditPageSize(size);
                setAuditPage(1);
              }}
            />
          )}

        </div>
      )}

      {/* Invite User Modal Dialog */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="flex w-full max-w-[560px] max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_40px_rgba(0,0,0,0.2)]">

            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border px-7 pb-3 pt-5">
              <div>
                <h2 className="m-0 text-xl font-medium leading-[1.3] text-foreground">
                  Invite User
                </h2>
                <p className="m-0 mt-1 text-[0.825rem] text-muted-foreground">
                  Map this user to a defined role
                </p>
              </div>
              <button onClick={() => setIsInviteModalOpen(false)} className="cursor-pointer border-0 bg-transparent p-[0.2rem] text-muted-foreground">
                <X size={20} />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveInviteUser} className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-5">

              {/* Full name & Email ID 2-Col Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-[0.4rem] block text-[0.825rem] font-medium text-foreground">
                    Full name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Neha Kapoor"
                    value={newUser.name}
                    onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none"
                  />
                </div>

                <div>
                  <label className="mb-[0.4rem] block text-[0.825rem] font-medium text-foreground">
                    Email ID
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. neha.kapoor@stfox.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none"
                  />
                </div>
              </div>

              {/* Multi-Role Tag Builder */}
              <div>
                <label className="mb-[0.4rem] block text-[0.825rem] font-medium text-foreground">
                  Assigned Roles
                </label>

                {/* Role Selector + Add Role Button */}
                <div className="mb-[0.6rem] flex gap-2">
                  <select
                    value={newUser.selectedRoleToAdd || ''}
                    onChange={(e) => setNewUser(prev => ({ ...prev, selectedRoleToAdd: e.target.value }))}
                    className="flex-1 rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none"
                  >
                    <option value="" disabled>Select a role</option>
                    {ASSIGNABLE_ROLES.map(r => (
                      <option key={r} value={r} disabled={newUser.roles?.includes(r)}>{r}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      const roleToAdd = newUser.selectedRoleToAdd;
                      if (roleToAdd && !newUser.roles?.includes(roleToAdd)) {
                        setNewUser(prev => ({
                          ...prev,
                          roles: [...(prev.roles || []), roleToAdd],
                          selectedRoleToAdd: ''
                        }));
                      }
                    }}
                    disabled={!newUser.selectedRoleToAdd}
                    className={`inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-lg border-0 px-4 py-[0.65rem] text-[0.825rem] font-semibold ${
                      !newUser.selectedRoleToAdd ? 'cursor-not-allowed bg-input text-muted-foreground' : 'cursor-pointer bg-primary text-[#FFFFFF]'
                    }`}
                  >
                    <Plus size={15} />
                    <span>Add Role</span>
                  </button>
                </div>

                {/* Active Role Tags with Cross Icon to Delete */}
                <div className="flex min-h-[34px] flex-wrap gap-[0.45rem] rounded-lg border border-border bg-input p-[0.45rem]">
                  {newUser.roles && newUser.roles.length > 0 ? (
                    newUser.roles.map(rName => (
                      <span
                        key={rName}
                        className="inline-flex items-center gap-[0.35rem] rounded-[6px] border border-[#CBD5E1] bg-[#FFFFFF] px-[0.6rem] py-1 text-[0.8rem] font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      >
                        <span>{rName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewUser(prev => ({
                              ...prev,
                              roles: prev.roles.filter(r => r !== rName)
                            }));
                          }}
                          className="flex cursor-pointer items-center border-0 bg-transparent p-[0.1rem] text-[#94A3B8]"
                          onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="self-center p-[0.2rem] text-[0.8rem] text-muted-foreground">
                      No extra roles assigned. User will be created as standard Requester.
                    </span>
                  )}
                </div>
              </div>

              {/* Category Assignment Box for Change Manager */}
              {(newUser.roles?.includes('Change Manager') || newUser.selectedRoleToAdd === 'Change Manager') && (
                <div className="mb-2">
                  <label className="mb-[0.4rem] block text-[0.825rem] font-semibold text-foreground">
                    Appointed Change Manager Categories
                  </label>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-input p-3">
                    {categories.map((cat) => {
                      const isChecked = newUserCmCategories.includes(cat.id);
                      return (
                        <label key={cat.id} className="flex cursor-pointer items-center gap-[0.4rem] text-[0.825rem] text-foreground">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewUserCmCategories(prev => [...prev, cat.id]);
                              } else {
                                setNewUserCmCategories(prev => prev.filter(c => c !== cat.id));
                              }
                            }}
                          />
                          <span>{cat.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Category Assignment Box for Change Implementer */}
              {(newUser.roles?.includes('Change Implementer') || newUser.selectedRoleToAdd === 'Change Implementer') && (
                <div className="mb-2">
                  <label className="mb-[0.4rem] block text-[0.825rem] font-semibold text-foreground">
                    Appointed Change Implementer Categories
                  </label>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-input p-3">
                    {categories.map((cat) => {
                      const isChecked = newUserCiCategories.includes(cat.id);
                      return (
                        <label key={cat.id} className="flex cursor-pointer items-center gap-[0.4rem] text-[0.825rem] text-foreground">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewUserCiCategories(prev => [...prev, cat.id]);
                              } else {
                                setNewUserCiCategories(prev => prev.filter(c => c !== cat.id));
                              }
                            }}
                          />
                          <span>{cat.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="cursor-pointer rounded-lg border border-border bg-card px-5 py-[0.65rem] text-[0.85rem] font-semibold text-foreground"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!newUser.roles || newUser.roles.length === 0 || Boolean(newUser.selectedRoleToAdd)}
                  className={`rounded-lg border-0 px-[1.35rem] py-[0.65rem] text-[0.85rem] font-medium ${
                    (!newUser.roles || newUser.roles.length === 0 || Boolean(newUser.selectedRoleToAdd))
                      ? 'cursor-not-allowed bg-input text-muted-foreground shadow-none'
                      : 'cursor-pointer bg-primary text-[#FFFFFF] shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
                  }`}
                >
                  Save user
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(15,23,42,0.65)] p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-[540px] max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border px-7 pb-3 pt-5">
              <div>
                <h2 className="m-0 text-[1.35rem] font-medium text-foreground">
                  Edit User
                </h2>
                <p className="mt-1 text-[0.85rem] text-muted-foreground">
                  Map this user to a defined role
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="cursor-pointer border-0 bg-transparent p-[0.2rem] text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveManageUser} className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-5">
              {/* Row 1: Full name & Employee ID */}
              <div className="cd-responsive-inner-grid">
                <div>
                  <label className="mb-[0.4rem] block text-[0.825rem] font-medium text-foreground">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none"
                  />
                </div>
                <div>
                  <label className="mb-[0.4rem] block text-[0.825rem] font-medium text-foreground">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    value={editingUser.empId}
                    onChange={(e) => setEditingUser(prev => ({ ...prev, empId: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none"
                  />
                </div>
              </div>

              {/* Multi-Role Tag Builder for Edit Modal */}
              <div>
                <div className="mb-[0.4rem] flex items-baseline gap-[0.35rem]">
                  <label className="text-[0.825rem] font-medium text-foreground">
                    Assigned Roles *
                  </label>
                  <span className="text-[0.725rem] text-muted-foreground">(Add one or more roles)</span>
                </div>

                {/* Role Selector + Add Role Button */}
                <div className="mb-[0.6rem] flex gap-2">
                  <select
                    value={editingUser.selectedRoleToAdd || ''}
                    onChange={(e) => setEditingUser(prev => ({ ...prev, selectedRoleToAdd: e.target.value }))}
                    className="flex-1 rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none"
                  >
                    <option value="" disabled>Select a role</option>
                    {ASSIGNABLE_ROLES.map(r => (
                      <option key={r} value={r} disabled={editingUser.roles?.includes(r)}>{r}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      const roleToAdd = editingUser.selectedRoleToAdd;
                      if (roleToAdd && !editingUser.roles?.includes(roleToAdd)) {
                        setEditingUser(prev => ({
                          ...prev,
                          roles: [...(prev.roles || []), roleToAdd],
                          selectedRoleToAdd: ''
                        }));
                      }
                    }}
                    disabled={!editingUser.selectedRoleToAdd}
                    className={`inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-lg border-0 px-4 py-[0.65rem] text-[0.825rem] font-semibold ${
                      !editingUser.selectedRoleToAdd ? 'cursor-not-allowed bg-input text-muted-foreground' : 'cursor-pointer bg-primary text-[#FFFFFF]'
                    }`}
                  >
                    <Plus size={15} />
                    <span>Add Role</span>
                  </button>
                </div>

                {/* Active Role Tags with Cross Icon to Delete */}
                <div className="flex min-h-[34px] flex-wrap gap-[0.45rem] rounded-lg border border-border bg-input p-[0.45rem]">
                  {editingUser.roles && editingUser.roles.length > 0 ? (
                    editingUser.roles.map(rName => (
                      <span
                        key={rName}
                        className="inline-flex items-center gap-[0.35rem] rounded-[6px] border border-[#CBD5E1] bg-[#FFFFFF] px-[0.6rem] py-1 text-[0.8rem] font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      >
                        <span>{rName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (editingUser.roles.length <= 1) {
                              toast.error('User must have at least one assigned role.');
                              return;
                            }
                            setEditingUser(prev => ({
                              ...prev,
                              roles: prev.roles.filter(r => r !== rName)
                            }));
                          }}
                          className="flex cursor-pointer items-center border-0 bg-transparent p-[0.1rem] text-[#94A3B8]"
                          onMouseEnter={(e) => e.currentTarget.style.color = '#DC2626'}
                          onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="self-center p-[0.2rem] text-[0.8rem] text-muted-foreground">
                      No roles added yet. Please select a role above and click "+ Add Role".
                    </span>
                  )}
                </div>
              </div>

              {/* Category Assignment Box for Change Manager */}
              {(editingUser.roles?.includes('Change Manager') || editingUser.selectedRoleToAdd === 'Change Manager') && (
                <div className="mb-2">
                  <label className="mb-[0.4rem] block text-[0.825rem] font-semibold text-foreground">
                    Appointed Change Manager Categories
                  </label>
                  {isLoadingCategories ? (
                    <div className="flex justify-center rounded-lg border border-border bg-input p-4">
                      <LoadingSpinner size="xs" message="Loading categories..." />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-input p-3">
                      {categories.map((cat) => {
                        const isChecked = editingUserCmCategories.includes(cat.id);
                        return (
                          <label key={cat.id} className="flex cursor-pointer items-center gap-[0.4rem] text-[0.825rem] text-foreground">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isSavingUser}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditingUserCmCategories(prev => [...prev, cat.id]);
                                } else {
                                  setEditingUserCmCategories(prev => prev.filter(c => c !== cat.id));
                                }
                              }}
                            />
                            <span>{cat.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Category Assignment Box for Change Implementer */}
              {(editingUser.roles?.includes('Change Implementer') || editingUser.selectedRoleToAdd === 'Change Implementer') && (
                <div className="mb-2">
                  <label className="mb-[0.4rem] block text-[0.825rem] font-semibold text-foreground">
                    Appointed Change Implementer Categories
                  </label>
                  {isLoadingCategories ? (
                    <div className="flex justify-center rounded-lg border border-border bg-input p-4">
                      <LoadingSpinner size="xs" message="Loading categories..." />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-input p-3">
                      {categories.map((cat) => {
                        const isChecked = editingUserCiCategories.includes(cat.id);
                        return (
                          <label key={cat.id} className="flex cursor-pointer items-center gap-[0.4rem] text-[0.825rem] text-foreground">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isSavingUser}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditingUserCiCategories(prev => [...prev, cat.id]);
                                } else {
                                  setEditingUserCiCategories(prev => prev.filter(c => c !== cat.id));
                                }
                              }}
                            />
                            <span>{cat.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Actions Footer */}
              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  disabled={isSavingUser}
                  className={`rounded-lg border border-border bg-input px-5 py-[0.6rem] text-[0.85rem] font-semibold text-foreground ${
                    isSavingUser ? 'cursor-not-allowed opacity-60' : 'cursor-pointer opacity-100'
                  }`}
                >
                  Cancel
                </button>

                <div className="flex items-center gap-2">
                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={handleDeleteManageUser}
                    disabled={isSavingUser}
                    className={`rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-5 py-[0.6rem] text-[0.85rem] font-bold text-[#DC2626] transition-colors hover:bg-[#FEE2E2] ${
                      isSavingUser ? 'cursor-not-allowed opacity-60' : 'cursor-pointer opacity-100'
                    }`}
                  >
                    Delete
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingUser || !editingUser.roles || editingUser.roles.length === 0 || Boolean(editingUser.selectedRoleToAdd)}
                    className={`inline-flex items-center gap-2 rounded-lg border-0 px-5 py-[0.6rem] text-[0.85rem] font-medium ${
                      (isSavingUser || !editingUser.roles || editingUser.roles.length === 0 || Boolean(editingUser.selectedRoleToAdd))
                        ? 'cursor-not-allowed bg-input text-muted-foreground'
                        : 'cursor-pointer bg-primary text-[#FFFFFF]'
                    } ${isSavingUser ? 'opacity-80' : 'opacity-100'}`}
                  >
                    {isSavingUser ? (
                      <>
                        <LoadingSpinner size="xs" color="#FFFFFF" center={false} />
                        <span>Saving changes...</span>
                      </>
                    ) : (
                      <span>Save user</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Centered on Screen) */}
      {userToDelete && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-[rgba(15,23,42,0.65)] p-4 backdrop-blur-sm animate-fade-in">
          <div className="flex w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#FEE2E2] text-[#DC2626]">
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1">
                <h3 className="m-0 text-[1.15rem] font-bold text-foreground">
                  Deactivate User Account?
                </h3>
                <p className="mt-2 text-[0.875rem] leading-[1.5] text-muted-foreground">
                  Are you sure you want to deactivate <strong className="text-foreground font-semibold">{userToDelete.name || userToDelete.email}</strong>?
                </p>
                <p className="mt-1 text-[0.825rem] text-[#DC2626] font-medium">
                  This will revoke all assigned roles and prevent this user from accessing the system.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={isSavingUser}
                className="cursor-pointer rounded-lg border border-border bg-card px-[1.15rem] py-[0.6rem] text-[0.85rem] font-semibold text-foreground hover:bg-input transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={isSavingUser}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-0 bg-[#DC2626] px-[1.25rem] py-[0.6rem] text-[0.85rem] font-semibold text-white hover:bg-[#B91C1C] transition-colors shadow-[0_1px_3px_rgba(220,38,38,0.3)] disabled:cursor-not-allowed disabled:opacity-75"
              >
                {isSavingUser ? (
                  <>
                    <LoadingSpinner size="xs" color="#FFFFFF" center={false} />
                    <span>Deactivating...</span>
                  </>
                ) : (
                  <span>Yes, Deactivate User</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default React.memo(SettingsPage);
