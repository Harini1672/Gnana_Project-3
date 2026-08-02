import { useState, useEffect } from 'react';
import { supabase, mapSupabaseUser, navigateTo } from './services/auth';
import type { AuthUser } from './services/auth';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { VerifyEmail } from './pages/VerifyEmail';
import { Dashboard } from './pages/Dashboard';
import { ToastProvider } from './components/ui/Toast';

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Synchronize route pathname changes
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Initialize session and subscribe to auth changes
  useEffect(() => {
    // 1. Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(mapSupabaseUser(session?.user || null));
      setIsInitializing(false);
    });

    // 2. Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(mapSupabaseUser(session?.user || null));
        setIsInitializing(false);

        // If recovery event, direct to reset password path
        if (event === 'PASSWORD_RECOVERY') {
          navigateTo('/reset-password');
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Enforce route protection and redirection rules
  useEffect(() => {
    if (isInitializing) return;

    const publicPaths = ['/login', '/signup', '/forgot-password', '/reset-password'];
    
    if (user) {
      // Determine if email needs verification (Google OAuth bypasses verification)
      const isEmailVerified = user.emailConfirmedAt !== null || user.provider === 'google';
      
      if (!isEmailVerified) {
        if (currentPath !== '/verify-email') {
          navigateTo('/verify-email');
        }
      } else {
        // Authenticated and verified
        if (publicPaths.includes(currentPath) || currentPath === '/verify-email' || currentPath === '/') {
          navigateTo('/dashboard');
        }
      }
    } else {
      // Unauthenticated users
      if (!publicPaths.includes(currentPath)) {
        navigateTo('/login');
      }
    }
  }, [user, currentPath, isInitializing]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">
            Initializing Session...
          </span>
        </div>
      </div>
    );
  }

  // Render components based on path route mapping
  const renderRoute = () => {
    // Redirect logic for rendering
    if (user) {
      const isEmailVerified = user.emailConfirmedAt !== null || user.provider === 'google';
      if (!isEmailVerified) {
        return <VerifyEmail />;
      }
      return <Dashboard userEmail={user.email} onLogout={() => setUser(null)} />;
    } else {
      // Unauthenticated state
      switch (currentPath) {
        case '/signup':
          return <SignUp />;
        case '/forgot-password':
          return <ForgotPassword />;
        case '/reset-password':
          return <ResetPassword />;
        case '/login':
        default:
          return <Login onLoginSuccess={() => {
            // Retrieve session and set user
            supabase.auth.getUser().then(({ data: { user } }) => {
              setUser(mapSupabaseUser(user));
            });
          }} />;
      }
    }
  };

  return (
    <ToastProvider>
      {renderRoute()}
    </ToastProvider>
  );
}

export default App;
