import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '../api';
import { MirrorAxis, MirrorLockup, MirrorMark } from '../components/brand';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" aria-label="MIRROR home" className="w-fit">
          <MirrorLockup height={32} />
        </Link>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto my-auto w-full max-w-[380px] py-12">
          <h1 className="font-display text-[40px] leading-none">{title}</h1>
          <p className="mt-3 text-[13.5px] text-fg-2">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-[13px] text-fg-3">{footer}</div>
        </motion.div>
        <p className="text-[11.5px] text-fg-3">Sessions use a secure, HTTP-only cookie. Passwords are stored as salted scrypt hashes.</p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-line bg-surface lg:block">
        <div className="grid-paper absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_75%)]" aria-hidden />
        <MirrorAxis className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2" background="linear-gradient(180deg, transparent, rgb(var(--accent) / 0.8) 35%, rgb(var(--info) / 0.6) 65%, transparent)" />
        <div className="relative flex h-full flex-col items-center justify-center px-12 text-center">
          <div className="float-slow"><MirrorMark size={150} /></div>
          <p className="mt-10 font-display text-[34px] leading-tight">
            One website. Multiple realities.
            <br />
            <span className="italic text-fg-2">One reproducible record.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="hint">{hint}</p>
      ) : null}
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        className="input pr-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        required
      />
      <button type="button" className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-fg-3 hover:text-fg" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiRequestError) || !err.details) return {};
  return Object.fromEntries(err.details.map((d) => [d.path, d.message]));
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      const next = new URLSearchParams(location.search).get('next');
      navigate(next && next.startsWith('/app') ? next : '/app', { replace: true });
    }
  });
  const errs = fieldErrors(login.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your investigations, findings and evidence."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="email" label="Email" error={errs.email}>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus aria-invalid={Boolean(errs.email)} />
        </Field>
        <Field id="password" label="Password" error={errs.password}>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" invalid={Boolean(errs.password)} />
        </Field>
        {login.error && !Object.keys(errs).length && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[13px] text-danger">
            {(login.error as Error).message}
          </p>
        )}
        <button type="submit" className="btn-primary btn-lg w-full" disabled={login.isPending || !email || !password}>
          {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ['auth-config'], queryFn: api.authConfig });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const register = useMutation({
    mutationFn: () => api.register(name, email, password),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      navigate('/app', { replace: true });
    }
  });
  const errs = fieldErrors(register.error);
  const strength = [password.length >= 10, /[A-Za-z]/.test(password) && /\d/.test(password), password.length >= 14 || /[^A-Za-z0-9]/.test(password)];

  return (
    <AuthLayout
      title="Create account"
      subtitle="Your investigations and evidence are private to your account."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {config.data && !config.data.registrationEnabled ? (
        <p className="rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[13px] text-warning">Registration is disabled on this deployment. Ask an administrator for an account.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate();
          }}
          className="space-y-4"
          noValidate
        >
          <Field id="name" label="Name" error={errs.name}>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required autoFocus aria-invalid={Boolean(errs.name)} />
          </Field>
          <Field id="email" label="Email" error={errs.email}>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required aria-invalid={Boolean(errs.email)} />
          </Field>
          <Field id="password" label="Password" error={errs.password} hint="At least 10 characters, with letters and a number.">
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" invalid={Boolean(errs.password)} />
            <div className="mt-2 flex gap-1" aria-hidden>
              {strength.map((ok, i) => (
                <span key={i} className={ok ? 'h-1 flex-1 rounded bg-accent' : 'h-1 flex-1 rounded bg-line-strong'} />
              ))}
            </div>
          </Field>
          {register.error && !Object.keys(errs).length && (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[13px] text-danger">
              {(register.error as Error).message}
            </p>
          )}
          <button type="submit" className="btn-primary btn-lg w-full" disabled={register.isPending || !name || !email || password.length < 10}>
            {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
