import React, { useState, useEffect } from 'react';
import { supabase, logout, navigateTo } from '../services/auth';
import { Mail, Loader2, AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const VerifyEmail: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [isChecking, setIsChecking] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { toast } = useToast();

  // Retrieve user's email on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) {
        setEmail(user.email);
      }
    });
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Manually check verification status
  const checkVerificationStatus = async () => {
    setIsChecking(true);
    setErrorMsg(null);
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;

      if (user && (user.email_confirmed_at || user.confirmed_at)) {
        toast('success', 'Email Verified!', 'Your account has been verified. Welcome to the dashboard.');
        navigateTo('/dashboard');
      } else {
        toast('info', 'Verification Pending', 'Your email is still unverified. Please check your inbox or resend the link.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error checking verification status.');
    } finally {
      setIsChecking(false);
    }
  };

  // Trigger verification email resend
  const handleResendEmail = async () => {
    if (cooldown > 0 || !email) return;

    setIsResending(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        }
      });

      if (error) throw error;

      toast('success', 'Email Sent', 'A new verification link has been sent to your email.');
      setCooldown(60);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Could not resend verification email.');
      toast('error', 'Resend Failed', err.message || 'Error occurred.');
    } finally {
      setIsResending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      navigateTo('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      {/* Verify Card */}
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl z-10 border border-slate-800 shadow-2xl flex flex-col gap-6">
        
        {/* Brand visual header */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-3.5 rounded-2xl text-white shadow-xl">
            <Mail className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-display bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">
              Verify Your Email
            </h1>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              We sent a verification link to your email address.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col gap-4 py-2">
          <div className="text-center text-xs leading-relaxed text-slate-350">
            Please click on the link in the email sent to <strong className="text-indigo-300 font-semibold">{email || 'your email'}</strong> to activate your account.
          </div>

          <div className="h-[1px] bg-slate-800"></div>

          {/* Manual refresh verification status button */}
          <button
            onClick={checkVerificationStatus}
            disabled={isChecking || isResending}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50"
          >
            {isChecking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                I've Verified My Email
              </>
            )}
          </button>

          {/* Resend button */}
          <button
            onClick={handleResendEmail}
            disabled={isChecking || isResending || cooldown > 0}
            className="w-full py-2.5 bg-transparent hover:bg-slate-850 border border-slate-800 text-slate-350 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isResending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : cooldown > 0 ? (
              <span>Resend in {cooldown}s</span>
            ) : (
              <span>Resend Verification Email</span>
            )}
          </button>

          {/* Log out */}
          <button
            onClick={handleSignOut}
            className="w-full py-2.5 bg-transparent hover:bg-rose-500/5 text-rose-500 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-transparent hover:border-rose-500/10"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
