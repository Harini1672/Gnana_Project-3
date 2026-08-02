import React, { useState, useEffect } from 'react';
import { supabase, navigateTo } from '../services/auth';
import { Bot, Mail, Lock, Loader2, LogIn, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

interface LoginProps {
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Rate limiting failed attempts
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  
  const { toast } = useToast();

  // Restore lockout status on load
  useEffect(() => {
    const savedLockout = localStorage.getItem('login_lockout_until');
    if (savedLockout) {
      const remaining = Math.ceil((parseInt(savedLockout) - Date.now()) / 1000);
      if (remaining > 0) {
        setLockoutTime(parseInt(savedLockout));
        setCooldownRemaining(remaining);
      } else {
        localStorage.removeItem('login_lockout_until');
      }
    }
  }, []);

  // Lockdown countdown interval
  useEffect(() => {
    if (!lockoutTime) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutTime(null);
        setCooldownRemaining(0);
        setFailedAttempts(0);
        localStorage.removeItem('login_lockout_until');
        clearInterval(interval);
      } else {
        setCooldownRemaining(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutTime]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    if (lockoutTime && Date.now() < lockoutTime) {
      setErrorMsg(`Too many failed attempts. Try again in ${cooldownRemaining} seconds.`);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    // Save remember preference for the storage policy
    localStorage.setItem('remember_me', rememberMe ? 'true' : 'false');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        throw error;
      }

      if (data?.user) {
        toast('success', 'Welcome Back!', `Logged in as ${data.user.email}`);
        setFailedAttempts(0);
        onLoginSuccess();
      }
    } catch (err: any) {
      console.error(err);
      
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      
      if (newAttempts >= 5) {
        const lockoutDuration = 60 * 1000; // 60 seconds
        const lockoutUntil = Date.now() + lockoutDuration;
        localStorage.setItem('login_lockout_until', lockoutUntil.toString());
        setLockoutTime(lockoutUntil);
        setCooldownRemaining(60);
        setErrorMsg('Too many failed login attempts. Locked out for 60 seconds.');
        toast('error', 'Rate Limited', 'Too many failed login attempts. Locked out for 60 seconds.');
      } else {
        setErrorMsg(err.message || 'Incorrect email or password.');
        toast('error', 'Login Failed', err.message || 'Incorrect credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Google Authentication failed.');
      toast('error', 'OAuth Error', err.message || 'Could not verify Google account.');
      setIsGoogleLoading(false);
    }
  };

  const isLockedOut = lockoutTime !== null && cooldownRemaining > 0;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Visual background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      {/* Login Card */}
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl z-10 border border-slate-800 shadow-2xl flex flex-col gap-6">
        
        {/* Brand visual header */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-3.5 rounded-2xl text-white shadow-xl">
            <Bot className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-display bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">
              AI-Powered Chatbot
            </h1>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              WhatsApp RAG Admin Portal Panel.
            </p>
          </div>
        </div>

        {/* Error notification banner */}
        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
          
          {/* Email field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                disabled={isLoading || isGoogleLoading || isLockedOut}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.com"
                className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-800 bg-slate-950/40 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={isLoading || isGoogleLoading || isLockedOut}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-slate-800 bg-slate-950/40 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={isLoading || isGoogleLoading || isLockedOut}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-350 cursor-pointer disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between text-xs mt-1">
            <label className="flex items-center gap-2 font-medium text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                disabled={isLoading || isGoogleLoading || isLockedOut}
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950/40 text-indigo-600 focus:ring-0 focus:ring-offset-0 focus:outline-none disabled:opacity-50"
              />
              <span>Remember me</span>
            </label>
            <button
              type="button"
              disabled={isLoading || isGoogleLoading}
              onClick={() => navigateTo('/forgot-password')}
              className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors disabled:opacity-50"
            >
              Forgot Password?
            </button>
          </div>

          {/* Email Sign In Button */}
          <button
            type="submit"
            disabled={isLoading || isGoogleLoading || isLockedOut}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50 disabled:active:scale-100"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isLockedOut ? (
              <span>Locked out ({cooldownRemaining}s)</span>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center justify-center gap-3 py-1">
          <div className="h-[1px] bg-slate-800 flex-1"></div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Or continue with</span>
          <div className="h-[1px] bg-slate-800 flex-1"></div>
        </div>

        {/* Google Sign-in Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading || isGoogleLoading || isLockedOut}
          className="w-full py-2.5 bg-transparent hover:bg-slate-800/40 text-slate-350 border border-slate-800 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer disabled:opacity-50"
        >
          {isGoogleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {/* Google custom SVG */}
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  fill="#EA4335"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        {/* Signup Link */}
        <div className="text-center text-xs text-slate-500 font-medium mt-1">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={() => navigateTo('/signup')}
            className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors disabled:opacity-50"
          >
            Sign Up
          </button>
        </div>

      </div>
    </div>
  );
};
