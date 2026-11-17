import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError, setUnauthenticatedHandler, type User } from './api';
import { FullScreenLoader } from './components/brand';

interface AuthState {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, signOut: async () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me().catch((e) => (e instanceof ApiRequestError && e.status === 401 ? null : Promise.reject(e))),
    staleTime: 60_000,
    retry: false
  });

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      if (queryClient.getQueryData(['me'])) {
        queryClient.setQueryData(['me'], null);
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      }
    });
  }, [queryClient]);

  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      queryClient.setQueryData(['me'], null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
      navigate('/login', { replace: true });
    }
  });

  return (
    <AuthContext.Provider value={{ user: me.data ?? null, loading: me.isLoading, signOut: () => logout.mutateAsync() }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/** Gate for the workstation: unauthenticated users go to sign-in and come back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (user) {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={next && next.startsWith('/app') ? next : '/app'} replace />;
  }
  return <>{children}</>;
}
