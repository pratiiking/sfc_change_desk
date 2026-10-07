import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { FormLabel } from './primitives.component';

const TRIGGER_CLASS =
  'box-border flex w-full cursor-pointer select-none items-center justify-between rounded-lg border border-border bg-input px-[0.85rem] py-[0.65rem] text-[0.85rem] text-foreground outline-none';

function ManagerCombobox({
  label = 'Manager Name',
  required = true,
  managerName,
  managerEmail,
  onSelect,
  users = [],
  loading = false,
  excludeEmail = ''
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);

  const excludeEmailLower = (excludeEmail || '').trim().toLowerCase();
  const selectableUsers = excludeEmailLower
    ? users.filter((u) => (u.email || '').trim().toLowerCase() !== excludeEmailLower)
    : users;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const term = searchTerm.trim().toLowerCase();
  const filteredUsers = term
    ? selectableUsers.filter((u) => {
        const nameMatch = (u.name || '').toLowerCase().includes(term);
        const emailMatch = (u.email || '').toLowerCase().includes(term);
        const empIdMatch = (u.empId || '').toLowerCase().includes(term);
        return nameMatch || emailMatch || empIdMatch;
      })
    : selectableUsers;

  const handleSelect = (user) => {
    onSelect?.(user);
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className="relative">
      <FormLabel required={required}>{label}</FormLabel>
      <div
        tabIndex={0}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
        className={TRIGGER_CLASS}
      >
        <span className={managerName ? 'text-foreground' : 'text-muted-foreground'}>
          {managerName || (loading ? 'Loading employees...' : 'Select Reporting Manager...')}
        </span>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-[0.35rem] flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          <div className="border-b border-border bg-input p-[0.65rem]">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-[0.65rem] text-muted-foreground" />
              <input
                type="text"
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search manager by name or email..."
                className="box-border w-full rounded-md border border-border bg-card py-[0.45rem] pl-8 pr-[0.65rem] text-[0.8rem] text-foreground outline-none"
              />
            </div>
          </div>

          <div className="max-h-[200px] overflow-y-auto">
            {filteredUsers.map((u) => {
              const isSelected = managerEmail === u.email;
              return (
                <div
                  key={u.id || u.email}
                  onClick={() => handleSelect(u)}
                  className={`flex cursor-pointer flex-col gap-[0.15rem] border-b border-border px-[0.85rem] py-[0.6rem] transition-colors duration-150 last:border-b-0 ${
                    isSelected ? 'bg-input' : 'bg-transparent'
                  }`}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--input-bg)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span className="text-[0.825rem] font-semibold text-foreground">{u.name}</span>
                  <span className="text-[0.725rem] text-muted-foreground">
                    {u.email}{u.empId ? ` • ${u.empId}` : ''}
                  </span>
                </div>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="p-[0.85rem] text-center text-[0.8rem] text-muted-foreground">
                No employees found matching "{searchTerm}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(ManagerCombobox);
