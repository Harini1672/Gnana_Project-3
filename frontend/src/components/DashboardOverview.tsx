import React from 'react';
import { 
  FileText, 
  Database, 
  Users, 
  MessageSquare, 
  RefreshCw, 
  Clock, 
  TrendingUp, 
  ShieldAlert 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

interface DashboardOverviewProps {
  analytics: {
    summary: {
      total_documents: number;
      total_chunks: number;
      total_users: number;
      total_conversations: number;
    };
    daily_stats: Array<{ date: string; messages: number }>;
    recent_chats: Array<{
      id: string;
      phone_number: string;
      last_message: string | null;
      last_message_at: string | null;
      message_count: number;
    }>;
    audit_logs: Array<{
      id: string;
      action: string;
      details: string;
      created_at: string;
      users?: { email: string } | null;
    }>;
  } | null;
  isLoading: boolean;
  onRefresh: () => void;
  setActiveTab: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  analytics,
  isLoading,
  onRefresh,
  setActiveTab
}) => {
  const summary = analytics?.summary || {
    total_documents: 0,
    total_chunks: 0,
    total_users: 0,
    total_conversations: 0
  };

  const chartData = analytics?.daily_stats || [];
  const recentChats = analytics?.recent_chats || [];
  const auditLogs = analytics?.audit_logs || [];

  const cards = [
    { 
      label: 'Uploaded Documents', 
      value: summary.total_documents, 
      icon: FileText, 
      color: 'text-indigo-500', 
      bg: 'bg-indigo-500/10',
      tab: 'documents'
    },
    { 
      label: 'Indexed Chunks', 
      value: summary.total_chunks, 
      icon: Database, 
      color: 'text-emerald-500', 
      bg: 'bg-emerald-500/10',
      tab: 'documents'
    },
    { 
      label: 'WhatsApp Users', 
      value: summary.total_users, 
      icon: Users, 
      color: 'text-amber-500', 
      bg: 'bg-amber-500/10',
      tab: 'chats'
    },
    { 
      label: 'Total Conversations', 
      value: summary.total_conversations, 
      icon: MessageSquare, 
      color: 'text-purple-500', 
      bg: 'bg-purple-500/10',
      tab: 'chats'
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-display">Dashboard Overview</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Real-time analytics and activity logs for your RAG chatbot.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold glass-panel hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Grid of counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div 
              key={idx}
              onClick={() => setActiveTab(card.tab)}
              className="glass-panel p-5 rounded-2xl flex items-center justify-between cursor-pointer hover:translate-y-[-2px] transition-all hover:shadow-md"
            >
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <h3 className="text-3xl font-bold font-display mt-1.5">{card.value}</h3>
              </div>
              <div className={`p-3.5 rounded-xl ${card.bg}`}>
                <Icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Analytics Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Graph Card */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              <h3 className="font-semibold text-base font-display">Conversation Volume</h3>
            </div>
            <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full font-medium">
              Last 7 Days
            </span>
          </div>

          <div className="h-64 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#94a3b8" 
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '12px'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="messages" 
                    stroke="#6366f1" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorMessages)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <span className="text-xs text-slate-400">No message data available yet.</span>
              </div>
            )}
          </div>
        </div>

        {/* Recent Chats Card */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-500" />
            <h3 className="font-semibold text-base font-display">Recent Conversations</h3>
          </div>

          <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-64 pr-1">
            {recentChats.length > 0 ? (
              recentChats.map((chat) => (
                <div 
                  key={chat.id}
                  onClick={() => setActiveTab('chats')}
                  className="flex items-start justify-between p-3 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-800/30 cursor-pointer transition-all border border-transparent hover:border-slate-200/40 dark:hover:border-slate-700/20"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-semibold truncate text-slate-800 dark:text-slate-200">
                      {chat.phone_number}
                    </h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      {chat.last_message || "No messages yet."}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 ml-3">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    {chat.message_count > 0 && (
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">
                        {chat.message_count}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-1 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <span className="text-xs text-slate-400">No recent chats logged.</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Audit Logs Table */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-base font-display">System Audit Trail</h3>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 pl-2">Time</th>
                <th className="pb-3">Action</th>
                <th className="pb-3">Details</th>
                <th className="pb-3 pr-2">Performed By</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <tr 
                    key={log.id} 
                    className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-100/30 dark:hover:bg-slate-800/10 transition-colors"
                  >
                    <td className="py-3 pl-2 text-slate-500 dark:text-slate-400">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                        log.action === 'upload_document' ? 'bg-emerald-500/10 text-emerald-500' :
                        log.action === 'delete_document' ? 'bg-rose-500/10 text-rose-500' :
                        log.action === 'update_settings' ? 'bg-indigo-500/10 text-indigo-500' :
                        'bg-amber-500/10 text-amber-500'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-300 max-w-xs md:max-w-md truncate">
                      {log.details}
                    </td>
                    <td className="py-3 pr-2 text-slate-500 dark:text-slate-400">
                      {log.users?.email || 'System'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-slate-400">
                    No administrative actions logged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
