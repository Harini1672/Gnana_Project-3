import React, { useState } from 'react';
import { supabase, logout, navigateTo } from '../services/auth';
import { Lock, Loader2, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { toast } = useToast();

  const getPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length === 0) return { label: '', color: 'bg-slate-800', width: 'w-0' };
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    switch (score) {
      case 1:
      case 2:
        return { label: 'Weak', color: 'bg-rose-500', width: 'w-1/4' };
      case 3:
        return { label: 'Fair', color: 'bg-amber-500', width: 'w-2/4' };
      case 4:
        return { label: 'Good', color: 'bg-yellow-500', width: 'w-3/4' };
      case 5:
        return { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
      default:
        return { label: 'Weak', color: 'bg-rose-500', width: 'w-1/4' };
    }
  };

  const strength = getPasswordStrength(password);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast('success', 'Password Updated', 'Your password has been successfully reset. Please sign in.');
      
      // Explicitly log out to end recovery session and require login with new password
      await logout();
      navigateTo('/login');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to update password. Link may have expired.');
      toast('error', 'Update Failed', err.message || 'Error updating password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      {/* Reset Card */}
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl z-10 border border-slate-800 shadow-2xl flex flex-col gap-6">
        {/* Visual header */}
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-3.5 rounded-2xl text-white shadow-xl">
            <KeyRound className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-display bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">
              Reset Password
            </h1>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              Enter your new credentials below.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
          {/* New Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                disabled={isLoading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-slate-800 bg-slate-950/40 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={isLoading}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-350 cursor-pointer disabled:opacity-50"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Strength meter */}
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

          {/* Confirm Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-400">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                disabled={isLoading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-slate-800 bg-slate-950/40 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="button"
                tabIndex={-1}
                disabled={isLoading}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-350 cursor-pointer disabled:opacity-50"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span>Update Password</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
