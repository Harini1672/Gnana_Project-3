import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  MessageSquare, 
  Settings, 
  LogOut, 
  Sun, 
  Moon, 
  Menu, 
  X, 
  User, 
  Bot 
} from 'lucide-react';
import { logout, supabase } from '../services/auth';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userEmail: string;
  onLogout: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  userEmail,
  onLogout 
}) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // Real-time user metadata sync
  const [profileName, setProfileName] = useState<string>('');
  const [profileUrl, setProfileUrl] = useState<string>('');

  // Sync theme to document class
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || 'dark';
    setTheme(initialTheme);
    
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Fetch profile settings and subscribe to updates
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata) {
        setProfileName(user.user_metadata.full_name || '');
        setProfileUrl(user.user_metadata.avatar_url || '');
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.user_metadata) {
        setProfileName(session.user.user_metadata.full_name || '');
        setProfileUrl(session.user.user_metadata.avatar_url || '');
      } else {
        setProfileName('');
        setProfileUrl('');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      onLogout();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'chats', label: 'Conversations', icon: MessageSquare },
    { id: 'settings', label: 'System Settings', icon: Settings },
  ];

  const profileInitials = profileName
    ? profileName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : userEmail ? userEmail.slice(0, 2).toUpperCase() : 'A';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col relative overflow-hidden transition-colors duration-300">
      
      {/* Premium background glowing shapes */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/15 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-1/2 left-1/3 w-80 h-80 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-3xl"></div>

      {/* Header for Mobile */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 glass-panel border-b border-slate-200/50 dark:border-slate-800/50 z-20">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-2 rounded-xl text-white shadow-md">
            <Bot className="h-6 w-6" />
          </div>
          <span className="font-bold text-lg font-display tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-white dark:to-indigo-200">
            WhatsApp RAG Admin
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors"
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors"
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex z-10">
        
        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm flex justify-start">
            <div className="w-64 h-full bg-white dark:bg-slate-900/95 p-6 flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 animate-slide-in">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <Bot className="h-6 w-6 text-indigo-500" />
                    <span className="font-bold text-lg font-display">WhatsApp RAG</span>
                  </div>
                  <button onClick={() => setIsMobileMenuOpen(false)}>
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <nav className="flex flex-col gap-2">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                          isActive 
                            ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold' 
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {item.label}
                      </button>
                    );
                  })}
                  
                  {/* Mobile My Profile Link */}
                  <button
                    onClick={() => {
                      setActiveTab('profile');
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      activeTab === 'profile'
                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <User className="h-5 w-5" />
                    My Profile
                  </button>
                </nav>
              </div>

              <div className="flex flex-col gap-4 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="flex items-center gap-2 px-2">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden">
                    {profileUrl ? (
                      <img src={profileUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <span>{profileInitials}</span>
                    )}
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {profileName || 'Administrator'}
                    </span>
                    <span className="text-[10px] text-slate-450 dark:text-slate-400 truncate">{userEmail}</span>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-500/5 transition-all text-left"
                >
                  <LogOut className="h-5 w-5" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 flex-col justify-between p-6 glass-panel border-r border-slate-200/50 dark:border-slate-800/50 m-4 mr-0 rounded-2xl">
          <div>
            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-8 px-2">
              <div className="bg-gradient-to-tr from-indigo-500 to-purple-600 p-2 rounded-xl text-white shadow-md">
                <Bot className="h-5 w-5" />
              </div>
              <span className="font-bold text-lg font-display tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-white dark:to-indigo-200">
                WhatsApp RAG
              </span>
            </div>

            {/* Nav Menu */}
            <nav className="flex flex-col gap-1.5">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive 
                        ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold border-l-2 border-indigo-500' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* User Session Settings */}
          <div className="flex flex-col gap-4 border-t border-slate-200/50 dark:border-slate-800/50 pt-4">
            <div className="flex items-center justify-between px-2">
              <button
                onClick={() => setActiveTab('profile')}
                className="flex items-center gap-2 max-w-[140px] text-left group cursor-pointer"
              >
                <User className="h-4 w-4 text-indigo-500 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" title={userEmail}>
                  {profileName || userEmail}
                </span>
              </button>
              <button 
                onClick={toggleTheme}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
            </div>
            
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-500/5 dark:hover:bg-rose-950/20 transition-all text-left"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Content Wrapper */}
        <main className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto max-w-full">
          
          {/* Top Header for Desktop */}
          <div className="hidden md:flex items-center justify-between pb-4 border-b border-slate-200/40 dark:border-slate-800/50 mb-6">
            <div>
              <h2 className="text-xl font-bold font-display tracking-tight text-slate-850 dark:text-slate-150 capitalize">
                {activeTab === 'overview' ? 'Dashboard Overview' : 
                 activeTab === 'documents' ? 'Document Registry' : 
                 activeTab === 'chats' ? 'WhatsApp Conversations' : 
                 activeTab === 'settings' ? 'System Settings' : 
                 activeTab === 'profile' ? 'Profile Settings' : ''}
              </h2>
            </div>
            
            {/* Top-Right Profile Dropdown Menu */}
            <div className="flex items-center gap-4 relative">
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl border border-slate-250/60 dark:border-slate-800/60 bg-white/40 dark:bg-slate-900/40 hover:bg-white/70 dark:hover:bg-slate-900/80 transition-all cursor-pointer select-none"
                >
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden shadow-sm">
                    {profileUrl ? (
                      <img src={profileUrl} alt="Avatar" className="h-full w-full object-cover animate-fade-in" />
                    ) : (
                      <span>{profileInitials}</span>
                    )}
                  </div>
                  <div className="text-left hidden lg:block">
                    <div className="text-xs font-bold text-slate-750 dark:text-slate-200 truncate max-w-[120px]">
                      {profileName || 'Administrator'}
                    </div>
                    <div className="text-[9px] text-slate-450 dark:text-slate-400 mt-0.5 truncate max-w-[120px]">
                      {userEmail}
                    </div>
                  </div>
                </button>

                {/* Dropdown Items Overlay */}
                {isProfileOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40 cursor-default" 
                      onClick={() => setIsProfileOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl glass-panel border border-slate-200 dark:border-slate-800 p-2 shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      
                      {/* Meta header details */}
                      <div className="px-3 py-2 border-b border-slate-200/50 dark:border-slate-800/50 mb-1 flex flex-col gap-0.5">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {profileName || 'Administrator'}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {userEmail}
                        </div>
                      </div>
                      
                      {/* Navigation tabs items */}
                      <button
                        onClick={() => {
                          setActiveTab('profile');
                          setIsProfileOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 text-left transition-colors cursor-pointer`}
                      >
                        <User className="h-4 w-4 text-slate-400" />
                        My Profile Settings
                      </button>

                      <button
                        onClick={() => {
                          setActiveTab('settings');
                          setIsProfileOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 text-left transition-colors cursor-pointer`}
                      >
                        <Settings className="h-4 w-4 text-slate-400" />
                        System Configurations
                      </button>

                      <div className="h-[1px] bg-slate-200/50 dark:bg-slate-800/50 my-1"></div>

                      <button
                        onClick={() => {
                          handleSignOut();
                          setIsProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-500/5 dark:hover:bg-rose-950/20 text-left transition-colors cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col">
            {children}
          </div>
        </main>

      </div>
    </div>
  );
};
