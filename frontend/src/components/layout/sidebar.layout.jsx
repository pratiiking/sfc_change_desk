import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutGrid,
  Menu,
  FileText,
  CheckCircle2,
  Settings,
  X,
  IndianRupee,
  Plane,
  CalendarDays,
  Users,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Plus,
  ScrollText
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useWorklistActionableDots } from '../../queries/worklist.queries';
import { getAllowedWorklistModules, ROLE } from '../../lib/permissions.lib';

function Sidebar({
  activeItem,
  onItemSelect,
  user,
  isMobile = false,
  mobileOpen = false,
  onCloseMobile,
  onHoverChange
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [worklistExpanded, setWorklistExpanded] = useState(true);
  const location = useLocation();
  const { theme } = useTheme();
  const faviconSrc = theme === 'dark' ? '/images/white-favicon.png' : '/images/black-favicon.png';

  const roleName = (user?.role || '').toLowerCase();
  const roleId = user?.roleId || '';
  const rawRoleIds = Array.isArray(user?.rolesList) ? user.rolesList : [];
  const isSuperAdmin = Boolean(user?.isSuperAdmin || roleId === ROLE.SUPER_ADMIN || rawRoleIds.includes(ROLE.SUPER_ADMIN) || roleName.includes('super'));
  const isBoardUser = Boolean(user?.isBoardMember || roleId === 'role-board' || roleId === ROLE.BOARD || rawRoleIds.includes(ROLE.BOARD) || rawRoleIds.includes('role-board') || roleName.includes('board'));

  const allowedWorklistModuleIds = getAllowedWorklistModules(user);
  const isApprover = allowedWorklistModuleIds.length > 0;

  const { data: pendingDots } = useWorklistActionableDots({
    user,
    allowedModuleIds: allowedWorklistModuleIds
  });

  const handleMouseEnter = () => {
    if (!isMobile) {
      setIsHovered(true);
      onHoverChange?.(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile) {
      setIsHovered(false);
      onHoverChange?.(false);
    }
  };

  const topNavItems = [
    { id: 'Dashboard', path: '/dashboard', label: 'My Dashboard', icon: LayoutGrid },
    { id: 'Change Request', path: '/change-requests/new', label: 'Change Request', icon: FileText, showPlus: true },
    { id: 'Pre-Spend Request', path: '/pre-spend', label: 'Pre-Spend Request', icon: IndianRupee, showPlus: true },
    { id: 'Travel Desk', path: '/travel-desk', label: 'Travel Desk', icon: Plane, showPlus: true },
    { id: 'Visitor Appointment', path: '/visitor-appointment', label: 'Visitor Appointment', icon: CalendarDays, showPlus: true },
    { id: 'Tribe CRM', label: 'Tribe CRM', icon: Users, externalUrl: 'https://tribe.stfox.com/jsp/iamlogin.jsp' },
    { id: 'Reimbursement', label: 'Reimbursement', icon: ScrollText, externalUrl: 'https://expense.stfox.com/login?serviceurl=%2Fhome' }
  ];

  // On desktop: compact rail by default, expands to full width on hover.
  // On mobile: slides in/out full width.
  const isExpanded = isMobile || isHovered;
  const mini = !isExpanded;
  const width = isMobile ? 270 : isHovered ? 270 : 68;

  const handleSelect = (item) => {
    if (item?.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
      if (isMobile) onCloseMobile?.();
      return;
    }
    onItemSelect?.(item.path || item.id || item);
    if (isMobile) onCloseMobile?.();
  };

  const NavButton = ({ item }) => {
    const Icon = item.icon;
    const isActive = activeItem === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleSelect(item)}
        title={mini ? item.label : undefined}
        className={`cd-nav-item relative flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-0 text-[0.85rem] ${
          mini ? 'justify-center py-[0.45rem]' : 'justify-start px-[0.65rem] py-[0.45rem]'
        } ${
          isActive
            ? 'cd-nav-item--active bg-primary font-semibold text-primary-foreground shadow-[var(--shadow-card)]'
            : 'font-medium text-sidebar-foreground'
        }`}
      >
        <Icon
          size={18}
          strokeWidth={isActive ? 2.25 : 2}
          className={`shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`}
        />
        {!mini && (
          <span className="flex-1 flex items-center justify-between gap-2 min-w-0 text-left">
            <span className="truncate">{item.label}</span>
            {item.hasPending && (
              <span
                title={`${item.pendingCount || ''} pending request${item.pendingCount > 1 ? 's' : ''}`}
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-sm"
              />
            )}
            {item.showPlus && (
              <Plus
                size={13}
                strokeWidth={2.5}
                className={`shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`}
              />
            )}
          </span>
        )}
        {mini && item.hasPending && (
          <span
            title={`${item.pendingCount || ''} pending`}
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-sidebar"
          />
        )}
        {!mini && item.externalUrl && (
          <ExternalLink size={13} className="ml-auto shrink-0 text-muted-foreground" />
        )}
        {!mini && item.comingSoon && (
          <span className="whitespace-nowrap rounded-[4px] border border-sidebar-border bg-sidebar-border px-[0.45rem] py-[0.15rem] text-[0.625rem] font-semibold leading-tight tracking-[0.02em] text-muted-foreground">
            Coming Soon
          </span>
        )}
      </button>
    );
  };

  const aside = (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`fixed top-0 left-0 flex h-screen min-h-screen shrink-0 select-none flex-col overflow-y-auto overflow-x-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[transform,width,box-shadow] duration-200 ${
        isMobile ? (mobileOpen ? 'translate-x-0' : '-translate-x-[110%]') : 'translate-x-0'
      } ${width === 270 ? 'w-[270px]' : 'w-[68px]'} ${isMobile ? 'z-[120]' : 'z-[100]'} ${
        !isMobile && isHovered ? 'shadow-[var(--shadow-pop)]' : 'shadow-none'
      } ${mini ? 'px-0 py-5' : 'px-[0.85rem] py-5'}`}
    >
      {/* Brand Header */}
      <div
        className={`flex w-full items-center ${mini ? 'justify-center gap-0 px-0 pt-1 pb-5' : 'justify-between gap-2 pt-1 pr-[0.2rem] pb-6 pl-[0.4rem]'}`}
      >
        <div className={`flex items-center ${mini ? 'w-full flex-none min-w-0 justify-center gap-0' : 'w-auto flex-1 min-w-0 justify-start gap-[0.85rem]'}`}>
          <img
            src={faviconSrc}
            alt="Logo"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/images/Favicon.png';
            }}
            className={`block h-8 w-8 shrink-0 object-contain ${mini ? 'mx-auto' : ''}`}
          />
          {!mini && (
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[1.05rem] font-bold leading-[1.15] tracking-[-0.01em] text-sidebar-foreground">
                Hot Desk
              </span>
            </div>
          )}
        </div>

        {isMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-sidebar-border bg-sidebar text-muted-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className={`cd-sidebar-nav${mini ? ' cd-sidebar-nav--mini' : ''}`}>
        {topNavItems.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </nav>

      {(() => {
        if (!isApprover || allowedWorklistModuleIds.length === 0) return null;

        const allWorklistModuleDefinitions = [
          { id: 'change_request', path: '/worklist?module=change_request', label: 'Change Request', icon: FileText },
          { id: 'prespend', path: '/worklist?module=prespend', label: 'Pre-Spend Request', icon: IndianRupee },
          { id: 'travel', path: '/worklist?module=travel', label: 'Travel Desk', icon: Plane }
        ];

        const allowedWorklistModules = allWorklistModuleDefinitions.filter(m => allowedWorklistModuleIds.includes(m.id));
        const hasMultipleWorklistSub = allowedWorklistModules.length > 1;

        const visibleMgmtItems = [];

        if (isSuperAdmin || isBoardUser) {
          visibleMgmtItems.push({ id: 'Organization Dashboard', path: '/org-dashboard', label: 'Organization Dashboard', icon: LayoutGrid });
        }

        if (isSuperAdmin) {
          visibleMgmtItems.push({ id: 'Settings', path: '/settings', label: 'Settings', icon: Settings });
        }

        const isWorklistActive = activeItem === 'My Worklist' || activeItem === 'Worklist';
        const singleMod = allowedWorklistModules[0];
        const singlePending = singleMod ? (pendingDots?.[singleMod.id] ?? (Number(pendingDots?.prespend || 0) + Number(pendingDots?.change_request || 0) + Number(pendingDots?.travel || 0))) : 0;
        const totalPendingAcrossAll = Number(pendingDots?.prespend || 0) + Number(pendingDots?.change_request || 0) + Number(pendingDots?.travel || 0);
        const effectivePending = (singlePending > 0) ? singlePending : totalPendingAcrossAll;

        const singleWorklistItem = {
          id: 'My Worklist',
          path: singleMod?.path || '/worklist',
          label: 'My Worklist',
          icon: CheckCircle2,
          hasPending: effectivePending > 0,
          pendingCount: effectivePending
        };

        return (
          <>
            <div
              className={`text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground ${
                mini ? 'mt-5 mb-2 mx-0 text-center' : 'mt-6 mb-2 mr-0 ml-[0.85rem] text-left'
              }`}
            >
              {mini ? '•••' : 'MANAGEMENT'}
            </div>

            <nav className={`cd-sidebar-nav cd-sidebar-nav--fill${mini ? ' cd-sidebar-nav--mini' : ''}`}>
              {/* My Worklist with module dropdown */}
              {!hasMultipleWorklistSub ? (
                <NavButton item={singleWorklistItem} />
              ) : (
                <div className="flex flex-col gap-[0.2rem]">
                  <button
                    type="button"
                    onClick={() => {
                      if (mini) {
                        handleSelect({ path: '/worklist' });
                      } else {
                        setWorklistExpanded(prev => !prev);
                      }
                    }}
                    title={mini ? 'My Worklist' : undefined}
                    className={`cd-nav-item relative flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-0 text-[0.85rem] ${
                      mini ? 'justify-center px-[0.5rem] py-[0.45rem]' : 'justify-start px-[0.65rem] py-[0.45rem]'
                    } ${
                      isWorklistActive
                        ? 'cd-nav-item--active bg-primary font-semibold text-primary-foreground shadow-[var(--shadow-card)]'
                        : 'bg-transparent font-medium text-sidebar-foreground'
                    }`}
                  >
                    <CheckCircle2
                      size={18}
                      strokeWidth={isWorklistActive ? 2.25 : 2}
                      className={`shrink-0 ${isWorklistActive ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                    />
                    {!mini && (
                      <>
                        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                          My Worklist
                        </span>
                        {worklistExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                      </>
                    )}
                  </button>

                  {!mini && worklistExpanded && (
                    <div className="mt-[0.2rem] ml-[1.1rem] flex flex-col gap-[0.15rem] border-l-[1.5px] border-sidebar-border pl-[0.85rem]">
                      {allowedWorklistModules.map(subItem => {
                        const SubIcon = subItem.icon;
                        const isSubActive = location.pathname.startsWith('/worklist') && (
                          (subItem.id === 'change_request' && (!location.search || location.search.includes('module=change_request'))) ||
                          location.search.includes(`module=${subItem.id}`)
                        );

                        const hasPending = Boolean(pendingDots && pendingDots[subItem.id] > 0);

                        return (
                          <button
                            key={subItem.id}
                            type="button"
                            onClick={() => handleSelect(subItem)}
                            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] border-0 px-2.5 py-2 text-left text-[0.785rem] transition-all duration-150 ${
                              isSubActive
                                ? 'bg-info/10 font-semibold text-info'
                                : 'bg-transparent font-medium text-sidebar-foreground'
                            }`}
                          >
                            <SubIcon size={14} className={`shrink-0 ${isSubActive ? 'text-info' : 'text-muted-foreground'}`} />
                            <span className="inline-flex flex-1 items-center gap-[0.35rem] overflow-hidden text-ellipsis whitespace-nowrap">
                              {subItem.label}
                              {hasPending && (
                                <span
                                  title={`${pendingDots[subItem.id]} pending request${pendingDots[subItem.id] > 1 ? 's' : ''}`}
                                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                                />
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {visibleMgmtItems.map((item) => (
                <NavButton key={item.id} item={item} />
              ))}
            </nav>
          </>
        );
      })()}
    </aside>
  );

  if (!isMobile) return aside;

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-[110] bg-black/50"
        />
      )}
      {aside}
    </>
  );
}

export default React.memo(Sidebar);
