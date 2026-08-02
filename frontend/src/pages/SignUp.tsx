import React, { useState } from 'react';
import { supabase, navigateTo } from '../services/auth';
import { Bot, Mail, Lock, User, Loader2, UserPlus, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const SignUp: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { toast } = useToast();

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length === 0) return { label: '', color: 'bg-slate-800', width: 'w-0', percent: 0 };
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    switch (score) {
      case 1:
      case 2:
        return { label: 'Weak', color: 'bg-rose-500', width: 'w-1/4', percent: 25 };
      case 3:
        return { label: 'Fair', color: 'bg-amber-500', width: 'w-2/4', percent: 50 };
      case 4:
        return { label: 'Good', color: 'bg-yellow-500', width: 'w-3/4', percent: 75 };
      case 5:
        return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full', percent: 100 };
      default:
        return { label: 'Weak', color: 'bg-rose-500', width: 'w-1/4', percent: 25 };
    }
  };

  const strength = getPasswordStrength(password);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validation
    const cleanFullName = fullName.trim();
    const cleanEmail = email.trim();

    if (!cleanFullName) {
      setErrorMsg('Full Name is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (!acceptTerms) {
      setErrorMsg('You must accept the Terms & Privacy Policy.');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            full_name: cleanFullName,
          },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) throw error;

      if (data?.user) {
        toast(
          'success',
          'Account Created Successfully!',
          'A verification link has been sent to your email.'
        );
        navigateTo('/verify-email');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during registration.');
      toast('error', 'Registration Failed', err.message || 'Could not register account.');
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
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Google Authentication failed.');
      toast('error', 'OAuth Error', err.message || 'Could not verify Google account.');
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      {/* SignUp Card */}
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl z-10 border border-slate-800 shadow-2xl flex flex-col gap-5">
        {/* Brand visual header */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-3.5 rounded-2xl text-white shadow-xl">
            <Bot className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-display bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">
              Create Account
            </h1>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              Start setting up your AI RAG Portal.
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
        <form onSubmit={handleSignUp} className="flex flex-col gap-3.5">
          {/* Full Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Full Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                required
                disabled={isLoading || isGoogleLoading}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-800 bg-slate-950/40 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Email field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                disabled={isLoading || isGoogleLoading}
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
                disabled={isLoading || isGoogleLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-slate-800 bg-slate-950/40 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={isLoading || isGoogleLoading}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-350 cursor-pointer disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Password strength meter */}
            {password.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center justify-between text-[10px] font-semibold">
                  <span className="text-slate-500">Password Strength:</span>
                  <span
                    className={
                      strength.label === 'Weak' ? 'text-rose-400' :
                      strength.label === 'Fair' ? 'text-amber-400' :
                      strength.label === 'Good' ? 'text-yellow-400' :
                      'text-emerald-400'
                    }
                  >
                    {strength.label}
                  </span>
                </div>
                <div className="h-1 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color} ${strength.width}`}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                disabled={isLoading || isGoogleLoading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-slate-800 bg-slate-950/40 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={isLoading || isGoogleLoading}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-350 cursor-pointer disabled:opacity-50"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Accept Terms Checkbox */}
          <label className="flex items-start gap-2.5 text-[11px] font-medium text-slate-400 cursor-pointer select-none py-1">
            <input
              type="checkbox"
              required
              disabled={isLoading || isGoogleLoading}
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 rounded border-slate-800 bg-slate-950/40 text-indigo-600 focus:ring-0 focus:ring-offset-0 focus:outline-none disabled:opacity-50"
            />
            <span>
              I accept the{' '}
              <a href="#" className="text-indigo-400 hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-indigo-400 hover:underline">
                Privacy Policy
              </a>
            </span>
          </label>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50 disabled:active:scale-100"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Create Account
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center justify-center gap-3 py-1">
          <div className="h-[1px] bg-slate-800 flex-1"></div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Or</span>
          <div className="h-[1px] bg-slate-800 flex-1"></div>
        </div>

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading || isGoogleLoading}
          className="w-full py-2.5 bg-transparent hover:bg-slate-800/40 text-slate-350 border border-slate-800 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2.5 active:scale-95 cursor-pointer disabled:opacity-50"
        >
          {isGoogleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
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

        {/* Login Link */}
        <div className="text-center text-xs text-slate-500 font-medium mt-1">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => navigateTo('/login')}
            className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors disabled:opacity-50"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
