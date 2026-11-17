import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Monitor } from 'lucide-react';
import { api, ApiRequestError } from '../api';
import { useAuth } from '../auth';
import { useBreadcrumbs } from '../components/shell';
import { ErrorState, Notice, Page, PageHeader, Skeleton, cx, formatDate, formatRelative } from '../components/ui';

const SECTIONS = [
  ['account', 'Account'],
  ['security', 'Security'],
  ['workspace', 'Workspace'],
  ['browser', 'Browser defaults'],
  ['limits', 'Execution limits'],
  ['ai', 'AI provider'],
  ['retention', 'Evidence retention'],
  ['notifications', 'Notifications'],
  ['audit', 'Audit log']
] as const;

function Block({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-b border-line py-7 last:border-0">
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div>
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {description && <p className="mt-1 text-[12.5px] text-fg-3">{description}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function ReadOnly({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="panel divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]">
          <dt className="text-fg-2">{k}</dt>
          <dd className="font-mono text-[12.5px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function AccountForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  useEffect(() => setName(user?.name ?? ''), [user?.name]);
  const save = useMutation({ mutationFn: () => api.updateAccount(name), onSuccess: (u) => queryClient.setQueryData(['me'], (prev: object) => ({ ...prev, ...u })) });
  return (
    <form
      className="panel space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="acc-name" className="label">
            Name
          </label>
          <input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="acc-email" className="label">
            Email
          </label>
          <input id="acc-email" className="input text-fg-3" value={user?.email ?? ''} readOnly aria-readonly />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={save.isPending || !name.trim() || name === user?.name}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
        {save.isSuccess && <span className="text-[12.5px] text-success" role="status">Saved.</span>}
        {save.error && <span className="text-[12.5px] text-danger" role="alert">{(save.error as Error).message}</span>}
      </div>
    </form>
  );
}

function PasswordForm() {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const change = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      void queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });
    }
  });
  const err = change.error instanceof ApiRequestError ? change.error : null;
  const mismatch = confirm.length > 0 && confirm !== next;
  return (
    <form
      className="panel space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        change.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="pw-current" className="label">
            Current password
          </label>
          <input id="pw-current" type="password" autoComplete="current-password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pw-new" className="label">
            New password
          </label>
          <input id="pw-new" type="password" autoComplete="new-password" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pw-confirm" className="label">
            Confirm new password
          </label>
          <input id="pw-confirm" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
          {mismatch && <p className="field-error">Passwords do not match.</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-secondary" disabled={change.isPending || !current || next.length < 10 || mismatch || !confirm}>
          {change.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Change password
        </button>
        {change.isSuccess && <span className="text-[12.5px] text-success" role="status">Password changed. Other sessions were signed out.</span>}
        {err && <span className="text-[12.5px] text-danger" role="alert">{err.details?.[0]?.message ?? err.message}</span>}
      </div>
    </form>
  );
}

function SessionsList() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['auth-sessions'], queryFn: api.sessions });
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeSession(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth-sessions'] }) });
  if (sessions.isLoading) return <Skeleton className="h-24 w-full" />;
  if (sessions.error) return <ErrorState error={sessions.error} compact />;
  return (
    <ul className="panel divide-y divide-line">
      {sessions.data!.map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-4 py-3">
          <Monitor className="h-4 w-4 shrink-0 text-fg-3" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px]">{s.userAgent?.replace(/\(.*?\)/g, '').slice(0, 80) ?? 'Unknown client'}</div>
            <div className="font-mono text-[11px] text-fg-3">
              {s.ipAddress ?? '—'} · signed in {formatRelative(s.createdAt)} · active {formatRelative(s.lastUsedAt)}
            </div>
          </div>
          {s.current ? (
            <span className="chip border-accent/40 text-accent">this device</span>
          ) : (
            <button className="btn-ghost btn-sm hover:text-danger" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
              Revoke
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function SettingsPage() {
  useBreadcrumbs([{ label: 'Settings' }]);
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const audit = useQuery({ queryKey: ['audit'], queryFn: api.audit });
  const [active, setActive] = useState<string>('account');

  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-20% 0px -70% 0px' });
    els.forEach((el) => observer.observe(el));
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    return () => observer.disconnect();
  }, [settings.data]);

  const s = settings.data;
  return (
    <Page>
      <PageHeader title="Settings" description="Account, security and the server-enforced limits that govern browser execution and evidence." />
      <div className="grid gap-8 px-6 lg:grid-cols-[180px_1fr] lg:px-8">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-4 space-y-0.5">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className={cx('block rounded px-2.5 py-1.5 text-[13px] transition-colors', active === id ? 'bg-hover text-fg' : 'text-fg-3 hover:text-fg-2')}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Block id="account" title="Account" description="Your profile within this MIRROR deployment.">
            <AccountForm />
          </Block>
          <Block id="security" title="Security" description="Password and active sign-in sessions. Changing your password signs out every other session.">
            <div className="space-y-4">
              <PasswordForm />
              <SessionsList />
            </div>
          </Block>
          {settings.isLoading && <Skeleton className="h-40 w-full" />}
          {settings.error && <ErrorState error={settings.error} compact />}
          {s && (
            <>
              <Block id="workspace" title="Workspace" description="Deployment-level configuration. Set through server environment variables.">
                <ReadOnly
                  rows={[
                    ['Self-service registration', s.registrationEnabled ? 'enabled' : 'disabled'],
                    ['Evidence storage driver', s.storageDriver],
                    ['Demo store', s.demoStoreUrl ?? 'not configured'],
                    ['Local test hosts', s.allowedTestHosts.join(', ') || 'none']
                  ]}
                />
              </Block>
              <Block id="browser" title="Browser defaults" description="Defaults applied to new sessions when a value is not specified.">
                <ReadOnly rows={[['Engine', 'Chromium (Playwright)'], ['Locale', 'en-US'], ['Timezone', 'America/New_York'], ['Viewport', '1280×800 @1x'], ['Storage', 'empty (isolated context per session)']]} />
                <div className="mt-3">
                  <Notice tone="info">Editable per-workspace defaults are not available yet: they need workspace settings storage on the server. Configure each session in the investigation wizard.</Notice>
                </div>
              </Block>
              <Block id="limits" title="Execution limits" description="Enforced by the worker regardless of what the browser requests.">
                <ReadOnly
                  rows={[
                    ['Concurrent sessions per run', s.limits.maxConcurrency],
                    ['Step timeout ceiling', `${s.limits.stepTimeoutMs.toLocaleString()} ms`],
                    ['Maximum screenshot size', `${s.limits.maxScreenshotMb} MB`],
                    ['Maximum DOM snapshot size', `${s.limits.maxDomSnapshotMb} MB`],
                    ['Form submissions', 'non-GET page submissions and payment paths blocked']
                  ]}
                />
              </Block>
              <Block id="ai" title="AI provider" description="Optional, read-only interpretation layer.">
                <ReadOnly rows={[['Provider', s.aiProvider ?? 'none'], ['Status', s.aiProvider ? 'configured; interpretation not yet implemented' : 'disabled']]} />
                <p className="mt-3 text-[12.5px] text-fg-3">API keys are configured on the server and are never sent to the browser. All findings are deterministic with or without AI.</p>
              </Block>
              <Block id="retention" title="Evidence retention" description="How long captured artifacts are intended to be kept.">
                <ReadOnly rows={[['Retention period', `${s.limits.evidenceRetentionDays} days`], ['Automatic cleanup', 'not implemented yet']]} />
                <div className="mt-3">
                  <Notice tone="warning">The retention cleanup job is not implemented yet, so artifacts are currently kept until removed manually.</Notice>
                </div>
              </Block>
              <Block id="notifications" title="Notifications" description="How MIRROR tells you about run outcomes.">
                <ReadOnly rows={[['In-app notifications', 'enabled (run completed, partial, failed, blocked)'], ['Email delivery', 'not available']]} />
              </Block>
            </>
          )}
          <Block id="audit" title="Audit log" description="Security- and evidence-relevant actions on your account and investigations.">
            {audit.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ul className="panel max-h-[420px] divide-y divide-line overflow-y-auto">
                {audit.data?.map((e) => (
                  <li key={e.id} className="grid grid-cols-[170px_190px_1fr] gap-3 px-4 py-2 text-[12px]">
                    <span className="font-mono text-fg-3">{formatDate(e.timestamp)}</span>
                    <span className="font-mono text-accent">{e.eventType}</span>
                    <span className="truncate font-mono text-[11px] text-fg-3">{e.metadata ? JSON.stringify(e.metadata) : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </div>
      </div>
    </Page>
  );
}
