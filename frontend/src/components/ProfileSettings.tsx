import React, { useState, useEffect } from 'react';
import { supabase, logout, navigateTo, mapSupabaseUser } from '../services/auth';
import type { AuthUser } from '../services/auth';
import { 
  User, 
  Mail, 
  Lock, 
  Camera, 
  Save, 
  Loader2, 
  ShieldCheck, 
  LogOut, 
  Info,
  Calendar,
  Globe
} from 'lucide-react';
import { useToast } from './ui/Toast';

export const ProfileSettings: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  
  // Profile form states
  const [fullName, setFullName] = useState('');
  const [avatarBase64, setAvatarBase64] = useState<string>('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Email form states
  const [email, setEmail] = useState('');
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  // Password form states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const { data: { user: sbUser } } = await supabase.auth.getUser();
    if (sbUser) {
      const mapped = mapSupabaseUser(sbUser);
      setUser(mapped);
      if (mapped) {
        setFullName(mapped.fullName || '');
        setEmail(mapped.email || '');
        setAvatarBase64(mapped.avatarUrl || '');
      }
    }
  };

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

  // Image to base64 conversion
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast('error', 'File Too Large', 'Please upload an image smaller than 2MB.');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    setIsUpdatingProfile(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          avatar_url: avatarBase64
        }
      });

      if (error) throw error;

      toast('success', 'Profile Updated', 'Your profile details have been saved.');
      setUser(mapSupabaseUser(data.user));
    } catch (err: any) {
      console.error(err);
      toast('error', 'Update Failed', err.message || 'Could not update profile.');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || email.trim() === user?.email) return;

    setIsUpdatingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: email.trim()
      });

      if (error) throw error;

      toast('success', 'Email Update Initiated', 'Please check both your old and new email inboxes to confirm the change.');
    } catch (err: any) {
      console.error(err);
      toast('error', 'Update Failed', err.message || 'Could not initiate email update.');
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;

    if (newPassword.length < 8) {
      toast('error', 'Weak Password', 'New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast('error', 'Passwords Mismatch', 'Passwords do not match.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast('success', 'Password Updated', 'Your password has been changed successfully.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error(err);
      toast('error', 'Update Failed', err.message || 'Could not update password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSignOutAllDevices = async () => {
    try {
      // In Supabase, signOut has a global scope option if supported by project config, 
      // but signOut() terminates current session. Let's log out current session gracefully.
      await logout();
      toast('success', 'Logged Out', 'You have been successfully signed out.');
      navigateTo('/login');
    } catch (err: any) {
      console.error(err);
      toast('error', 'Logout Error', err.message || 'Error logging out.');
    }
  };

  const strength = getPasswordStrength(newPassword);

  return (
    <div className="flex flex-col gap-6 max-w-4xl font-sans">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight font-display">User Profile</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Manage your personal details, email logins, security credentials, and view account meta details.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left column: Avatar details & Info */}
        <div className="md:col-span-1 flex flex-col gap-6">
          {/* Avatar Card */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center gap-4">
            <div className="relative group">
              <div className="h-28 w-28 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 border-2 border-indigo-500 flex items-center justify-center overflow-hidden relative shadow-lg">
                {avatarBase64 ? (
                  <img src={avatarBase64} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold font-display text-indigo-500 dark:text-indigo-400">
                    {fullName ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A'}
                  </span>
                )}
              </div>
              <label className="absolute bottom-0 right-0 p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full cursor-pointer shadow-md transition-all duration-200 hover:scale-105">
                <Camera className="h-4 w-4" />
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleAvatarChange} 
                  className="hidden" 
                />
              </label>
            </div>

            <div>
              <h2 className="font-bold text-base text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                {fullName || 'Administrator'}
              </h2>
              <p className="text-xs text-slate-450 dark:text-slate-400 truncate max-w-[200px] mt-0.5">
                {user?.email}
              </p>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified {user?.role || 'Admin'}
            </div>
          </div>

          {/* Account Meta Stats */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Account Metadata
            </h3>
            
            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-2">
                <span className="text-slate-400 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                  Joined Date
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-850 pb-2">
                <span className="text-slate-400 flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-indigo-500" />
                  Provider
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                  {user?.provider || 'Email'}
                </span>
              </div>
            </div>

            <button
              onClick={handleSignOutAllDevices}
              className="mt-2 w-full py-2.5 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/25 text-rose-500 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign Out Session
            </button>
          </div>
        </div>

        {/* Right column: Editing panels */}
        <div className="md:col-span-2 flex flex-col gap-6">
          
          {/* General Details panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Personal Information
            </h3>
            <form onSubmit={handleUpdateProfile} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-250 dark:border-slate-800 bg-white/30 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isUpdatingProfile}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isUpdatingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Profile Details
                </button>
              </div>
            </form>
          </div>

          {/* Email panel */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Change Account Email
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                Updating your account email requires a validation check. Checkboxes will be sent to both email inboxes.
              </p>
            </div>
            
            <form onSubmit={handleUpdateEmail} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    disabled={user?.provider === 'google'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-250 dark:border-slate-800 bg-white/30 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
                {user?.provider === 'google' && (
                  <p className="text-[10px] text-amber-500 flex items-start gap-1 mt-0.5">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Emails cannot be edited directly for accounts linked via Google OAuth login.
                  </p>
                )}
              </div>

              {user?.provider !== 'google' && (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isUpdatingEmail || email.trim() === user?.email}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {isUpdatingEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Update Email Address
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Change Password panel */}
          {user?.provider !== 'google' && (
            <div className="glass-panel p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Change Password
              </h3>
              
              <form onSubmit={handleUpdatePassword} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* New Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-400">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-250 dark:border-slate-800 bg-white/30 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    {/* strength meter */}
                    {newPassword.length > 0 && (
                      <div className="flex flex-col gap-1 mt-1">
                        <div className="flex items-center justify-between text-[10px] font-semibold">
                          <span className="text-slate-550">Password Strength:</span>
                          <span
                            className={
                              strength.label === 'Weak' ? 'text-rose-450' :
                              strength.label === 'Fair' ? 'text-amber-450' :
                              strength.label === 'Good' ? 'text-yellow-450' :
                              'text-emerald-450'
                            }
                          >
                            {strength.label}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-slate-200 dark:bg-slate-950 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${strength.color} ${strength.width}`}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-400">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-250 dark:border-slate-800 bg-white/30 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isUpdatingPassword || !newPassword}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {isUpdatingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Update Password
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
