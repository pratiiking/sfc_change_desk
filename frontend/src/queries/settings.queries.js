import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/apiFetch.lib';
import { ROLE } from '../lib/permissions.lib';

export function useSettingsUsers() {
  return useQuery({
    queryKey: ['settings-users'],
    queryFn: async () => {
      const res = await apiFetch('/settings/users');
      if (!res.ok) throw new Error('Failed to load users');
      const body = await res.json();
      return body.data && Array.isArray(body.data) ? body.data : [];
    },
  });
}

export function useAuditLogs(auditFilter) {
  return useQuery({
    queryKey: ['audit-logs', auditFilter],
    queryFn: async () => {
      const queryParam = auditFilter && auditFilter !== 'All activity' ? `?filter=${encodeURIComponent(auditFilter)}` : '';
      const res = await apiFetch(`/settings/audit-logs${queryParam}`);
      if (!res.ok) throw new Error('Failed to load audit logs');
      const body = await res.json();
      return body.data && Array.isArray(body.data) ? body.data : [];
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ newUser, newUserCategories, roleToIdMap }) => {
      const roleId = roleToIdMap[newUser.role] || ROLE.CHANGE_ADMIN;
      const res = await apiFetch('/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          empId: newUser.empId,
          role: newUser.role,
          roleId: roleId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create user');
      }

      const body = await res.json();
      const savedUserId = body.data?.id;

      if (savedUserId && (newUser.role === 'Change Manager' || newUser.role === 'Change Implementer') && newUserCategories.length > 0) {
        if (newUser.role === 'Change Manager') {
          await apiFetch(`/settings/change-manager-categories/${savedUserId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryIds: newUserCategories }),
          });
        } else {
          await apiFetch(`/settings/change-implementer-categories/${savedUserId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ categoryIds: newUserCategories }),
          });
        }
      }

      return body.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ editingUser, editingUserCategories, roleToIdMap }) => {
      const roleId = roleToIdMap[editingUser.role] || ROLE.CHANGE_ADMIN;
      const res = await apiFetch(`/settings/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingUser.name,
          empId: editingUser.empId,
          role: editingUser.role,
          roleId: roleId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update user');
      }

      if (editingUser.role === 'Change Manager') {
        await apiFetch(`/settings/change-manager-categories/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryIds: editingUserCategories }),
        });
      } else if (editingUser.role === 'Change Implementer') {
        await apiFetch(`/settings/change-implementer-categories/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryIds: editingUserCategories }),
        });
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
    },
  });
}
