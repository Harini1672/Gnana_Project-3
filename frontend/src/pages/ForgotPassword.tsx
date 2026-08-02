import React, { useState } from 'react';
import { supabase, navigateTo } from '../services/auth';
import { Mail, Loader2, KeyRound, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const { toast } = useToast();

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setErrorMsg(null);
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setIsSuccess(true);
      toast('success', 'Reset Link Sent', 'Please check your email inbox.');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Could not send recovery email. Try again.');
      toast('error', 'Request Failed', err.message || 'Error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      {/* Card Container */}
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl z-10 border border-slate-800 shadow-2xl flex flex-col gap-6">
        {/* Logo and title */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-3.5 rounded-2xl text-white shadow-xl">
            <KeyRound className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-display bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">
              Recover Password
            </h1>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              We'll send you instructions to reset your password.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="bg-emerald-500/10 p-3.5 rounded-full text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-semibold text-white">Check Your Inbox</h2>
              <p className="text-slate-400 text-xs leading-relaxed max-w-[300px] mx-auto">
                We've sent a password reset link to <strong className="text-indigo-300 font-semibold">{email}</strong>. Please follow the instructions to secure your account.
              </p>
            </div>
            <button
              onClick={() => navigateTo('/login')}
              className="mt-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Return to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleRequestReset} className="flex flex-col gap-4">
            {/* Email Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  disabled={isLoading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-800 bg-slate-950/40 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span>Send Reset Link</span>
              )}
            </button>

            {/* Back to login */}
            <button
              type="button"
              onClick={() => navigateTo('/login')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-400 flex items-center justify-center gap-2 transition-colors mt-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
