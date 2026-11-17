import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileBarChart2,
  FlaskConical,
  FolderSearch,
  Fingerprint,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Route,
  ScanSearch,
  Search,
  Server,
  Settings,
  Store,
  User as UserIcon,
  X
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { MirrorLogo, MirrorMark } from './brand';
import { Modal, Popover, SeverityBadge, StatusGlyph, Tooltip, cx, formatRelative, humanize, shortId } from './ui';
import { EventStreamContext, useEventStreamConnection } from './useMirrorEvents';

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------

export interface Crumb {
  label: string;
  to?: string;
}
const CrumbContext = createContext<(c: Crumb[]) => void>(() => undefined);

export function useBreadcrumbs(crumbs: Crumb[]) {
  const set = useContext(CrumbContext);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(crumbs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const PRIMARY = [
  { to: '/app', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/app/investigations', label: 'Investigations', icon: FolderSearch },
  { to: '/app/experiments', label: 'Experiments', icon: FlaskConical },
  { to: '/app/findings', label: 'Findings', icon: ScanSearch },
  { to: '/app/evidence', label: 'Evidence', icon: Fingerprint },
  { to: '/app/reports', label: 'Reports', icon: FileBarChart2 }
];

function NavItem({ to, label, icon: Icon, end, collapsed, badge, external, onNavigate }: {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  end?: boolean;
  collapsed: boolean;
  badge?: number;
  external?: boolean;
  onNavigate?: () => void;
}) {
  const content = (active: boolean) => (
    <>
      {active && <motion.span layoutId="nav-active" className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent" transition={{ duration: 0.2 }} />}
      <Icon className={cx('h-[17px] w-[17px] shrink-0 transition-transform duration-200 group-hover:scale-110', active ? 'text-fg' : 'text-fg-3 group-hover:text-fg-2')} strokeWidth={1.75} aria-hidden />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && <span className="rounded bg-danger/15 px-1.5 font-mono text-[10.5px] text-danger">{badge}</span>}
    </>
  );
  const cls = (active: boolean) =>
    cx(
      'group relative flex h-9 items-center gap-3 rounded-md text-[13px] transition-colors duration-150',
      collapsed ? 'justify-center px-0' : 'px-3',
      active ? 'bg-hover text-fg' : 'text-fg-2 hover:bg-raised hover:text-fg'
    );
  const link = external ? (
    <a href={to} target="_blank" rel="noreferrer" className={cls(false)} aria-label={collapsed ? label : undefined}>
      {content(false)}
    </a>
  ) : (
    <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => cls(isActive)} aria-label={collapsed ? label : undefined}>
      {({ isActive }) => content(isActive)}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip label={label}>
      <div className="w-full">{link}</div>
    </Tooltip>
  ) : (
    link
  );
}

function Sidebar({ collapsed, onToggle, mobile, onNavigate }: { collapsed: boolean; onToggle?: () => void; mobile?: boolean; onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings, staleTime: 300_000 });
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  const high = overview.data?.totals.highFindings;
  const initials = (user?.name ?? user?.email ?? '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex h-full flex-col">
      <div className={cx('flex h-14 items-center border-b border-line', collapsed ? 'justify-center' : 'justify-between px-4')}>
        <Link to="/app" aria-label="MIRROR overview" onClick={onNavigate}>
          <MirrorLogo collapsed={collapsed} />
        </Link>
        {mobile && (
          <button className="icon-btn" onClick={onNavigate} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className={cx('pt-4', collapsed ? 'px-2.5' : 'px-3')}>
        {collapsed ? (
          <Tooltip label="New investigation">
            <Link to="/app/investigations/new" className="btn-primary h-9 w-full px-0" aria-label="New investigation">
              <Plus className="h-4 w-4" />
            </Link>
          </Tooltip>
        ) : (
          <Link to="/app/investigations/new" onClick={onNavigate} className="btn-primary h-9 w-full">
            <Plus className="h-4 w-4" aria-hidden /> New investigation
          </Link>
        )}
      </div>

      <nav aria-label="Workspace" className={cx('mt-4 flex flex-col gap-0.5', collapsed ? 'px-2.5' : 'px-3')}>
        {PRIMARY.map((item) => (
          <NavItem key={item.to} {...item} collapsed={collapsed} badge={item.label === 'Findings' ? high : undefined} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className={cx('mt-5', collapsed ? 'px-2.5' : 'px-3')}>
        {!collapsed && <div className="eyebrow mb-1.5 px-3">Tools</div>}
        <div className="flex flex-col gap-0.5">
          <NavItem to="/app/investigations/new?step=journey" label="Journey builder" icon={Route} collapsed={collapsed} onNavigate={onNavigate} />
          {settings.data?.demoStoreUrl && <NavItem to={`${settings.data.demoStoreUrl}/product`} label="Demo store" icon={Store} collapsed={collapsed} external />}
        </div>
      </div>

      <div className={cx('mt-auto flex flex-col gap-0.5 border-t border-line pt-3', collapsed ? 'px-2.5' : 'px-3')}>
        <NavItem to="/app/docs" label="Documentation" icon={BookOpen} collapsed={collapsed} onNavigate={onNavigate} />
        <NavItem to="/app/settings" label="Settings" icon={Settings} collapsed={collapsed} onNavigate={onNavigate} />
      </div>

      <div className={cx('border-t border-line', collapsed ? 'p-2.5' : 'p-3')}>
        <Popover
          label="Account"
          align="left"
          side="top"
          width={230}
          trigger={({ toggle, open }) => (
            <button
              onClick={toggle}
              aria-expanded={open}
              className={cx('flex w-full items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-raised', collapsed && 'justify-center')}
              aria-label="Account menu"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/40 bg-accent/15 font-mono text-[11px] font-semibold text-accent">{initials}</span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{user?.name ?? 'Investigator'}</span>
                  <span className="block truncate text-[11px] text-fg-3">{user?.email}</span>
                </span>
              )}
            </button>
          )}
        >
          {(close) => (
            <div className="p-1.5">
              <Link to="/app/settings" onClick={close} className="flex h-8 items-center gap-2 rounded px-2 text-[13px] text-fg-2 hover:bg-hover hover:text-fg">
                <UserIcon className="h-4 w-4" aria-hidden /> Account settings
              </Link>
              <button onClick={() => void signOut()} className="flex h-8 w-full items-center gap-2 rounded px-2 text-[13px] text-fg-2 hover:bg-hover hover:text-danger">
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </div>
          )}
        </Popover>
        {onToggle && (
          <button onClick={onToggle} className={cx('mt-2 flex h-7 w-full items-center gap-2 rounded px-2 text-[11.5px] text-fg-3 hover:bg-raised hover:text-fg-2', collapsed && 'justify-center px-0')} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Topbar widgets
// ---------------------------------------------------------------------------

function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  const results = useQuery({ queryKey: ['search', debounced], queryFn: () => api.search(debounced), enabled: open && debounced.length >= 2 });
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  const r = results.data;
  const empty = r && !r.investigations.length && !r.findings.length && !r.runs.length;

  return (
    <Modal open={open} onClose={onClose} labelledBy="search-title" width={620} align="top">
      <h2 id="search-title" className="sr-only">
        Search
      </h2>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="h-4 w-4 text-fg-3" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search investigations, findings, or a run ID…"
          className="h-12 flex-1 bg-transparent text-[14px] text-fg placeholder:text-fg-3 focus:outline-none"
          aria-label="Search"
        />
        <kbd className="chip">Esc</kbd>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        {debounced.length < 2 && <p className="px-3 py-6 text-center text-[13px] text-fg-3">Type at least two characters.</p>}
        {results.isFetching && <p className="px-3 py-3 text-[13px] text-fg-3">Searching…</p>}
        {empty && <p className="px-3 py-6 text-center text-[13px] text-fg-3">No matches for “{debounced}”.</p>}
        {r && r.investigations.length > 0 && (
          <SearchGroup title="Investigations">
            {r.investigations.map((i) => (
              <SearchItem key={i.id} onSelect={() => go(`/app/investigations/${i.id}`)} icon={<FolderSearch className="h-4 w-4" />} title={i.title} meta={i.targetUrl} />
            ))}
          </SearchGroup>
        )}
        {r && r.findings.length > 0 && (
          <SearchGroup title="Findings">
            {r.findings.map((f) => (
              <SearchItem key={f.id} onSelect={() => go(`/app/findings/${f.id}`)} icon={<ScanSearch className="h-4 w-4" />} title={f.description} meta={humanize(f.type)} trailing={<SeverityBadge severity={f.severity} />} />
            ))}
          </SearchGroup>
        )}
        {r && r.runs.length > 0 && (
          <SearchGroup title="Runs">
            {r.runs.map((run) => (
              <SearchItem key={run.id} onSelect={() => go(`/app/runs/${run.id}`)} icon={<StatusGlyph status={run.status} />} title={`Run ${shortId(run.id)}`} meta={formatRelative(run.createdAt)} />
            ))}
          </SearchGroup>
        )}
      </div>
    </Modal>
  );
}

function SearchGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <div className="eyebrow px-3 py-1.5">{title}</div>
      <ul>{children}</ul>
    </div>
  );
}

function SearchItem({ onSelect, icon, title, meta, trailing }: { onSelect: () => void; icon: ReactNode; title: string; meta?: string; trailing?: ReactNode }) {
  return (
    <li>
      <button onClick={onSelect} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-hover focus:bg-hover focus:outline-none">
        <span className="text-fg-3">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px]">{title}</span>
          {meta && <span className="block truncate font-mono text-[11px] text-fg-3">{meta}</span>}
        </span>
        {trailing}
      </button>
    </li>
  );
}

function Notifications() {
  const notes = useQuery({ queryKey: ['notifications'], queryFn: api.notifications, refetchInterval: 60_000 });
  const [seen, setSeen] = useState(() => localStorage.getItem('mirror.notifications.seen') ?? '');
  const unread = (notes.data ?? []).filter((n) => n.timestamp > seen).length;
  return (
    <Popover
      label="Notifications"
      width={360}
      trigger={({ toggle, open }) => (
        <button
          className="icon-btn relative"
          aria-label={`Notifications${unread ? `, ${unread} new` : ''}`}
          aria-expanded={open}
          onClick={() => {
            toggle();
            const latest = notes.data?.[0]?.timestamp;
            if (latest) {
              localStorage.setItem('mirror.notifications.seen', latest);
              setTimeout(() => setSeen(latest), 1500);
            }
          }}
        >
          <Bell className="h-[17px] w-[17px]" strokeWidth={1.75} />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded bg-accent px-1 font-mono text-[9.5px] font-semibold leading-4 text-[#120a24]">{unread}</span>}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="panel-head">
            <span className="panel-title">Run notifications</span>
            <span className="text-[11px] text-fg-3">In-app only</span>
          </div>
          {!notes.data?.length ? (
            <p className="px-4 py-8 text-center text-[13px] text-fg-3">Run completions and failures appear here.</p>
          ) : (
            <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
              {notes.data.map((n) => {
                const status = n.eventType.replace('run.', '');
                const runId = (n.metadata?.runId as string) ?? '';
                return (
                  <li key={n.id}>
                    <Link to={runId ? `/app/runs/${runId}` : '/app'} onClick={close} className={cx('flex gap-3 px-4 py-3 hover:bg-raised', n.timestamp > seen && 'bg-accent/[0.04]')}>
                      <StatusGlyph status={status} className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{n.investigation?.title ?? 'Investigation'}</span>
                        <span className="block text-[11.5px] text-fg-3">
                          Run {status}
                          {typeof n.metadata?.findingCount === 'number' ? ` · ${n.metadata.findingCount} findings` : ''} · {formatRelative(n.timestamp)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}

function SystemStatus({ stream }: { stream: string }) {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30_000 });
  const ok = health.data?.status === 'ok';
  const label = health.isLoading ? 'Checking' : ok ? 'Operational' : health.data?.status === 'unreachable' ? 'API unreachable' : 'Degraded';
  return (
    <Popover
      label="System status"
      width={260}
      trigger={({ toggle, open }) => (
        <button onClick={toggle} aria-expanded={open} className={cx('hidden h-8 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors sm:inline-flex', ok ? 'border-line-strong text-fg-2 hover:text-fg' : 'border-warning/40 text-warning')}>
          <Server className="h-3.5 w-3.5" aria-hidden />
          {label}
        </button>
      )}
    >
      {() => (
        <div className="p-4">
          <div className="panel-title mb-3">System status</div>
          <dl className="kv">
            {Object.entries(health.data?.checks ?? {}).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="capitalize">{k}</dt>
                <dd className={cx('flex items-center gap-1.5 font-mono text-[12px]', v === 'ok' ? 'text-success' : 'text-danger')}>
                  <StatusGlyph status={v === 'ok' ? 'completed' : 'failed'} /> {v}
                </dd>
              </div>
            ))}
            <dt>Event stream</dt>
            <dd className={cx('flex items-center gap-1.5 font-mono text-[12px]', stream === 'open' ? 'text-success' : 'text-warning')}>
              <StatusGlyph status={stream === 'open' ? 'completed' : 'running'} /> {stream}
            </dd>
          </dl>
        </div>
      )}
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export function AppShell() {
  const { user } = useAuth();
  const stream = useEventStreamConnection(Boolean(user));
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mirror.sidebar') === 'collapsed');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      localStorage.setItem('mirror.sidebar', c ? 'expanded' : 'collapsed');
      return !c;
    });

  return (
    <EventStreamContext.Provider value={stream}>
      <CrumbContext.Provider value={setCrumbs}>
        <div className="flex h-full">
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-[#120a24]">
            Skip to content
          </a>
          <motion.aside
            className="hidden shrink-0 border-r border-line bg-surface md:block"
            animate={{ width: collapsed ? 64 : 236 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            aria-label="Sidebar"
          >
            <Sidebar collapsed={collapsed} onToggle={toggle} />
          </motion.aside>

          <AnimatePresence>
            {mobileOpen && (
              <div className="fixed inset-0 z-40 md:hidden">
                <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
                <motion.aside
                  className="absolute inset-y-0 left-0 w-[260px] border-r border-line bg-surface"
                  initial={{ x: -260 }}
                  animate={{ x: 0 }}
                  exit={{ x: -260 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <Sidebar collapsed={false} mobile onNavigate={() => setMobileOpen(false)} />
                </motion.aside>
              </div>
            )}
          </AnimatePresence>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-sm lg:px-6">
              <button className="icon-btn md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                <Menu className="h-[18px] w-[18px]" />
              </button>
              <Link to="/app" className="md:hidden" aria-label="MIRROR">
                <MirrorMark size={24} />
              </Link>
              <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] sm:flex">
                {crumbs.map((c, i) => (
                  <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden />}
                    {c.to && i < crumbs.length - 1 ? (
                      <Link to={c.to} className="truncate text-fg-3 hover:text-fg">
                        {c.label}
                      </Link>
                    ) : (
                      <span className={cx('truncate', i === crumbs.length - 1 ? 'text-fg' : 'text-fg-3')} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>
                        {c.label}
                      </span>
                    )}
                  </span>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setSearchOpen(true)}
                  className="flex h-8 w-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-xs text-fg-3 transition-colors hover:border-[rgb(var(--text-muted))] hover:text-fg-2 lg:w-72"
                  aria-label="Search (Ctrl+K)"
                >
                  <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="hidden flex-1 text-left lg:inline">Search investigations, findings…</span>
                  <kbd className="hidden rounded border border-line-strong px-1 font-mono text-[10px] lg:inline">Ctrl K</kbd>
                </button>
                <SystemStatus stream={stream.state} />
                <Notifications />
              </div>
            </header>
            <main id="main" className="min-w-0 flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </div>
        <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </CrumbContext.Provider>
    </EventStreamContext.Provider>
  );
}
