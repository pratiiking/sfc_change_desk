import React, { useState, useEffect, useRef } from 'react';
import { Search, Menu } from 'lucide-react';
import { ROLE } from '../../lib/permissions.lib';

function Header({
  activeRoute = 'Dashboard',
  user,
  onLogout,
  isMobile = false,
  onMenuClick,
  onNavigate,
  searchQuery = '',
  onSearchChange
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);

  // Click outside to close profile dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = user?.initials || 'U';

  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearchChange && localSearch !== searchQuery) {
        onSearchChange(localSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange, searchQuery]);

  const squareBtnClass = 'flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-input text-foreground';

  return (
    <header
      className={`sticky top-0 z-40 flex h-[60px] w-full items-center justify-between gap-3 border-b border-border bg-card ${
        isMobile ? 'px-4' : 'px-6'
      }`}
    >
      {/* Left: menu (mobile) + breadcrumb */}
      <div className="flex min-w-0 items-center gap-[0.6rem]">
        {isMobile && (
          <button type="button" onClick={onMenuClick} aria-label="Open menu" className={squareBtnClass}>
            <Menu size={18} />
          </button>
        )}
        <div className="flex min-w-0 items-center gap-[0.4rem] text-sm">
          {!isMobile && (
            <>
              <span className="font-medium text-muted-foreground">Workspace</span>
              <span className="text-[0.75rem] text-muted-foreground">/</span>
            </>
          )}
          {(() => {
            if (activeRoute === 'My Worklist' || activeRoute === 'Worklist') {
              const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
              const mod = urlParams.get('module');
              const moduleLabel = mod === 'prespend'
                ? 'Pre-Spend Request'
                : mod === 'travel'
                ? 'Travel Desk'
                : 'Change Request';

              return (
                <div className="inline-flex items-center gap-[0.4rem]">
                  <span className="font-medium text-muted-foreground">My Worklist</span>
                  <span className="text-[0.75rem] text-muted-foreground">/</span>
                  <span className="font-semibold text-foreground">{moduleLabel}</span>
                </div>
              );
            }

            return (
              <span className="font-medium text-foreground">
                {activeRoute === 'Dashboard' ? 'My Dashboard' : activeRoute}
              </span>
            );
          })()}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {!isMobile && activeRoute !== 'Dashboard' && !activeRoute?.includes('Change Request') && !['Pre-Spend Request', 'Travel Desk', 'Visitor Appointment', 'Tribe CRM', 'Settings'].includes(activeRoute) && (
          <div className="relative w-[280px]">
            <div className="absolute top-1/2 left-[0.85rem] flex -translate-y-1/2 items-center text-muted-foreground">
              <Search size={14} />
            </div>
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search CR-ID, title, requester..."
              className="w-full rounded-lg border border-border bg-input py-[0.45rem] pr-[0.85rem] pl-[2.2rem] text-[0.8rem] text-foreground outline-none"
            />
          </div>
        )}

        {/* Profile Menu */}
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setShowProfileMenu((v) => !v)}
            className="flex cursor-pointer items-center gap-[0.6rem] rounded-lg border-none bg-transparent py-[0.2rem] pr-[0.3rem] pl-[0.6rem]"
          >
            {!isMobile && (
              <div className="flex flex-col items-end leading-tight">
                <span className="whitespace-nowrap text-[0.825rem] font-semibold text-foreground">
                  {user?.name || user?.displayName || 'User'}
                </span>
                <span className="whitespace-nowrap text-[0.7rem] text-muted-foreground">
                  {user?.email || ''}
                </span>
              </div>
            )}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-[0.85rem] font-semibold text-primary-foreground">
              {initials}
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[200px] rounded-lg border border-border bg-card px-0 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
              <div className="border-b border-border px-4 py-2">
                <strong className="block text-[0.825rem] text-foreground">
                  {user?.name || 'Unknown user'}
                </strong>
                {(() => {
                  const roleStr = (user?.role || user?.applicationRole || '').trim().toLowerCase();
                  const isRequester = roleStr === 'requester' || user?.roleId === ROLE.REQUESTER;
                  if (isRequester || !user?.role) return null;
                  return (
                    <span className="mt-[0.15rem] block text-[0.7rem] text-muted-foreground">
                      {user.role}
                    </span>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  onLogout?.();
                }}
                className="w-full cursor-pointer border-none bg-transparent px-4 py-2 text-left text-[0.8rem] font-semibold text-red-600"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default React.memo(Header);
