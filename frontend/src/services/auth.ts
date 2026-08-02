import { createClient, type User } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Custom storage wrapper to handle Remember Me preference dynamically
const customStorage = {
  getItem: (key: string): string | null => {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    const remember = localStorage.getItem('remember_me') !== 'false';
    if (remember) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

// Initialize Supabase Client with dynamic storage policy
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: customStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Custom reactive navigation helper
export const navigateTo = (path: string) => {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
  fullName?: string;
  avatarUrl?: string;
  provider?: string;
  createdAt?: string;
  emailConfirmedAt?: string | null;
}

// Convert Supabase User object into local App AuthUser structure
export const mapSupabaseUser = (user: User | null): AuthUser | null => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || '',
    role: user.user_metadata?.role || 'admin',
    fullName: user.user_metadata?.full_name || '',
    avatarUrl: user.user_metadata?.avatar_url || '',
    provider: user.app_metadata?.provider || user.identities?.[0]?.provider || 'email',
    createdAt: user.created_at,
    emailConfirmedAt: user.email_confirmed_at || null,
  };
};

export const getAuthUser = async (): Promise<AuthUser | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  return mapSupabaseUser(user);
};

export const logout = async (): Promise<void> => {
  await supabase.auth.signOut();
};
