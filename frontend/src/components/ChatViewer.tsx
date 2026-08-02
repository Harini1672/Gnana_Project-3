import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Phone, Send, Bot, User, Database, Clock,
  Loader2, PlusCircle, Search, X, AlertCircle, ChevronRight,
} from 'lucide-react';
import api from '../services/api';
import { useToast } from './ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  /** Unique identifier used as the POST /chat phone_number key */
  phone_number: string;
  /** Human-readable label stored in the session_id column, e.g. "Chat a3f9c1e2" */
  session_id: string;
  last_message: string | null;
  last_message_at: string | null;
  message_count: number;
}

interface RetrievedChunk {
  vector_id: string;
  score: number;
  content: string;
  document_id: string;
}

/** Single message type — covers both persisted and optimistic/typing states */
interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  content: string;
  created_at: string;
  retrieved_chunks: RetrievedChunk[];
  /** True while the message is pending API confirmation (not yet in DB) */
  isOptimistic?: boolean;
  /** True for the animated typing-indicator placeholder */
  isTyping?: boolean;
}

interface ChatViewerProps {
  sessions: Session[];
  isLoadingSessions: boolean;
  /** The currently selected session's UUID — lifted to Dashboard so it survives tab changes */
  selectedSessionId: string | null;
  /** Called when the user selects a different session */
  onSelectSession: (id: string) => void;
  onRefreshSessions: () => void;
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <div className="flex flex-col max-w-[85%] self-start">
    <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-500">
      <Bot className="h-3 w-3 text-indigo-500" />
      <span className="font-semibold">AI Assistant</span>
      <span>•</span>
      <span>typing…</span>
    </div>
    <div className="px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  </div>
);

// ─── ChatViewer ───────────────────────────────────────────────────────────────

export const ChatViewer: React.FC<ChatViewerProps> = ({
  sessions,
  isLoadingSessions,
  selectedSessionId,
  onSelectSession,
  onRefreshSessions,
}) => {
  // ── State ──────────────────────────────────────────────────────────────────

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [selectedBotMessage, setSelectedBotMessage] = useState<ChatMessage | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');

  /**
   * Sessions created via "New Chat" in this tab — merged into the sidebar
   * immediately so they appear without waiting for the next poll cycle.
   */
  const [localSessions, setLocalSessions] = useState<Session[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // ── Derived: merged + filtered session list ────────────────────────────────

  const mergedSessions = useMemo<Session[]>(() => {
    const parentIds = new Set(sessions.map((s) => s.id));
    const onlyLocal = localSessions.filter((s) => !parentIds.has(s.id));
    return [...onlyLocal, ...sessions];
  }, [sessions, localSessions]);

  const filteredSessions = useMemo<Session[]>(
    () =>
      mergedSessions.filter(
        (s) =>
          s.session_id.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
          s.phone_number.toLowerCase().includes(sidebarSearch.toLowerCase()),
      ),
    [mergedSessions, sidebarSearch],
  );

  // ── Derived: resolve selected session object from lifted ID ───────────────

  const selectedSession = useMemo<Session | null>(
    () => mergedSessions.find((s) => s.id === selectedSessionId) ?? null,
    [mergedSessions, selectedSessionId],
  );

  // ── Effects ────────────────────────────────────────────────────────────────

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load messages whenever the selected session changes
  useEffect(() => {
    if (selectedSession) {
      loadMessages(selectedSession.id);
      setSelectedBotMessage(null);
      setSendError(null);
    } else {
      setMessages([]);
      setSelectedBotMessage(null);
    }
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '42px';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSession?.id]);

  // ── Data helpers ──────────────────────────────────────────────────────────

  const loadMessages = useCallback(
    async (sessionId: string) => {
      setIsLoadingMessages(true);
      try {
        const response = await api.get(`chat-history/${sessionId}/messages`);
        setMessages(response.data as ChatMessage[]);
      } catch {
        toast('error', 'Failed to load messages', 'Could not retrieve conversation history.');
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [toast],
  );

  // ── New Chat ──────────────────────────────────────────────────────────────

  const handleNewChat = async () => {
    if (isCreatingSession) return;
    setIsCreatingSession(true);
    setSendError(null);
    try {
      const res = await api.post<Session>('sessions', {});
      const newSession: Session = {
        id: res.data.id,
        phone_number: res.data.phone_number,
        session_id: res.data.session_id,
        last_message: null,
        last_message_at: null,
        message_count: 0,
      };
      setLocalSessions((prev) => [newSession, ...prev]);
      // Lift selection up — triggers useEffect which loads messages
      onSelectSession(newSession.id);
      setInputMessage('');
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Could not create a new chat session.';
      toast('error', 'New chat failed', detail);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputMessage.trim();
    // Guard: must have text, a selected session, and not already sending
    if (!text || !selectedSession || isSending) return;

    setSendError(null);
    setInputMessage('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = '42px';
    setIsSending(true);

    // The phone_number on the session is the unique key used by the backend
    // to look up or create the session via get_or_create_chat_session.
    // Because every dashboard session has a unique phone_number (dashboard-<uuid8>),
    // the backend always resolves to exactly this session — messages never mix.
    const phoneNumber = selectedSession.phone_number;

    // 1 — Optimistic user bubble (appears immediately)
    const optimisticUser: ChatMessage = {
      id: `opt-user-${Date.now()}`,
      sender: 'user',
      content: text,
      created_at: new Date().toISOString(),
      retrieved_chunks: [],
      isOptimistic: true,
    };
    // 2 — Typing indicator while waiting for the AI
    const typingPlaceholder: ChatMessage = {
      id: 'opt-typing',
      sender: 'bot',
      content: '',
      created_at: new Date().toISOString(),
      retrieved_chunks: [],
      isOptimistic: true,
      isTyping: true,
    };
    setMessages((prev) => [...prev, optimisticUser, typingPlaceholder]);

    try {
      const res = await api.post<{
        session_id: string;
        answer: string;
        retrieved_chunks: RetrievedChunk[];
      }>('chat', { message: text, phone_number: phoneNumber });

      const { answer, retrieved_chunks } = res.data;

      // 3 — Replace optimistic messages with the real AI bubble
      const realBot: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        content: answer,
        created_at: new Date().toISOString(),
        retrieved_chunks: retrieved_chunks ?? [],
      };
      setMessages((prev) => prev.filter((m) => !m.isOptimistic).concat(realBot));

      // 4 — Reload full history to get server-assigned IDs and exact timestamps,
      //     then ask the parent to refresh its session list (updates last_message preview)
      await loadMessages(selectedSession.id);
      onRefreshSessions();
    } catch (err: unknown) {
      // Remove optimistic messages and surface the error inline
      setMessages((prev) => prev.filter((m) => !m.isOptimistic));
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Failed to get a response. Please try again.';
      setSendError(detail);
      toast('error', 'Chat error', detail);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  // ── Input helpers ─────────────────────────────────────────────────────────

  // Enter = send, Shift+Enter = newline
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-grow textarea up to 120px
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  // ── Select session from sidebar ───────────────────────────────────────────

  const handleSelectSession = (sess: Session) => {
    if (selectedSessionId === sess.id) return; // already selected
    onSelectSession(sess.id);
    setInputMessage('');
    setSendError(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const inputDisabled = isSending || !selectedSession;

  return (
    <div className="flex gap-4 h-[calc(100vh-140px)] min-h-0">

      {/* ── Sidebar ── */}
      <div className="w-72 shrink-0 glass-panel rounded-2xl flex flex-col overflow-hidden">

        {/* Header — title row */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-200/50 dark:border-slate-800/50 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 font-display tracking-wide">
              Conversations
            </span>
            {/* Count badge */}
            {mergedSessions.length > 0 && (
              <span className="text-[9px] font-bold bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded-full">
                {mergedSessions.length}
              </span>
            )}
          </div>

          {/* ── Prominent New Chat button ── */}
          <button
            onClick={handleNewChat}
            disabled={isCreatingSession}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-semibold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
          >
            {isCreatingSession ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <PlusCircle className="h-3.5 w-3.5" />
                New Chat
              </>
            )}
          </button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search conversations…"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              className="w-full pl-7 pr-7 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder-slate-400"
            />
            {sidebarSearch && (
              <button
                onClick={() => setSidebarSearch('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {isLoadingSessions && mergedSessions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
            </div>
          ) : filteredSessions.length > 0 ? (
            filteredSessions.map((sess) => {
              const isActive = selectedSession?.id === sess.id;
              // Use the last 2 chars of phone_number as the avatar monogram;
              // for dashboard-XXXXXXXX sessions that's always two hex digits.
              const monogram = sess.phone_number.slice(-2).toUpperCase();

              return (
                <button
                  key={sess.id}
                  onClick={() => handleSelectSession(sess)}
                  className={[
                    'w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-2.5 transition-all',
                    isActive
                      ? 'bg-indigo-500/10 border border-indigo-500/30'
                      : 'border border-transparent hover:bg-slate-100/60 dark:hover:bg-slate-800/40',
                  ].join(' ')}
                >
                  {/* Avatar */}
                  <div className={[
                    'h-8 w-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold',
                    isActive
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500',
                  ].join(' ')}>
                    {monogram}
                  </div>

                  {/* Labels */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      {/* Primary label = human-readable session_id, e.g. "Chat a3f9c1e2" */}
                      <span className="text-[11px] font-semibold truncate text-slate-800 dark:text-slate-200">
                        {sess.session_id}
                      </span>
                      {sess.last_message_at && (
                        <span className="text-[9px] text-slate-400 shrink-0">
                          {new Date(sess.last_message_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    {/* Last message preview or "No messages yet" */}
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {sess.last_message ?? 'No messages yet'}
                    </p>
                  </div>

                  {isActive && <ChevronRight className="h-3 w-3 text-indigo-500 shrink-0" />}
                </button>
              );
            })
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
              <Phone className="h-6 w-6 text-slate-300 dark:text-slate-700" />
              <span className="text-xs text-center whitespace-pre-line">
                {sidebarSearch
                  ? 'No matching conversations.'
                  : 'No chats yet.\nClick "New Chat" to start.'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Main chat panel ── */}
      <div className="flex-1 min-w-0 flex flex-col glass-panel rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center gap-3 shrink-0">
          <div className={[
            'h-9 w-9 rounded-full shrink-0 flex items-center justify-center',
            selectedSession
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-indigo-500/10 text-indigo-500',
          ].join(' ')}>
            {selectedSession ? <Phone className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold font-display leading-none truncate text-slate-800 dark:text-slate-100">
              {selectedSession ? selectedSession.session_id : 'No conversation selected'}
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {selectedSession
                ? `Session key · ${selectedSession.phone_number}`
                : 'Click "New Chat" in the sidebar to create an independent conversation'}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0 bg-slate-50/20 dark:bg-slate-950/10">
          {isLoadingMessages ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-7 w-7 text-indigo-500 animate-spin" />
            </div>
          ) : !selectedSession ? (
            /* No session selected — prompt the user */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 select-none">
              <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                <Bot className="h-8 w-8 text-indigo-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Start a new conversation
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                  Create a new chat or select an existing one from the sidebar.
                </p>
              </div>
              {/* Shortcut button — mirrors sidebar New Chat */}
              <button
                onClick={handleNewChat}
                disabled={isCreatingSession}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-sm font-semibold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingSession ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                ) : (
                  <><PlusCircle className="h-4 w-4" /> New Chat</>
                )}
              </button>
            </div>
          ) : messages.length === 0 && !isSending ? (
            /* Session selected but empty */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 select-none">
              <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                <Bot className="h-7 w-7 text-indigo-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {selectedSession.session_id}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Ask anything — the AI will search your indexed documents to answer.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              if (msg.isTyping) return <TypingIndicator key="typing-indicator" />;

              const isBot = msg.sender === 'bot';
              const isChunkSelected = selectedBotMessage?.id === msg.id;

              return (
                <div
                  key={msg.id}
                  className={[
                    'flex flex-col max-w-[78%]',
                    isBot ? 'self-start' : 'self-end items-end',
                  ].join(' ')}
                >
                  {/* Sender + timestamp */}
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
                    {isBot ? (
                      <>
                        <Bot className="h-3 w-3 text-indigo-500" />
                        <span className="font-semibold text-slate-500 dark:text-slate-400">AI Assistant</span>
                      </>
                    ) : (
                      <>
                        <User className="h-3 w-3" />
                        <span className="font-semibold text-slate-500 dark:text-slate-400">You</span>
                      </>
                    )}
                    <span>·</span>
                    <span>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Bubble */}
                  <div
                    onClick={() => isBot && setSelectedBotMessage(isChunkSelected ? null : msg)}
                    className={[
                      'px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words transition-all',
                      isBot
                        ? [
                            'bg-white dark:bg-slate-900 border text-slate-800 dark:text-slate-200 shadow-sm',
                            isChunkSelected
                              ? 'border-indigo-400 ring-2 ring-indigo-500/20 cursor-pointer'
                              : 'border-slate-200/80 dark:border-slate-800 hover:border-indigo-300/50 cursor-pointer',
                          ].join(' ')
                        : [
                            'bg-indigo-600 text-white rounded-br-sm',
                            msg.isOptimistic ? 'opacity-75' : '',
                          ].join(' '),
                    ].join(' ')}
                  >
                    {msg.content}
                  </div>

                  {/* RAG sources badge */}
                  {isBot && (msg.retrieved_chunks?.length ?? 0) > 0 && (
                    <button
                      onClick={() => setSelectedBotMessage(isChunkSelected ? null : msg)}
                      className="flex items-center gap-1 mt-1.5 px-1 text-[10px] font-semibold text-indigo-500 hover:text-indigo-400 transition-colors"
                    >
                      <Database className="h-3 w-3" />
                      {msg.retrieved_chunks.length} source
                      {msg.retrieved_chunks.length !== 1 ? 's' : ''} used
                    </button>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Inline error */}
        {sendError && (
          <div className="mx-4 mb-2 flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="flex-1">{sendError}</span>
            <button onClick={() => setSendError(null)} className="shrink-0 hover:text-rose-400">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Input bar */}
        <form
          onSubmit={handleSendMessage}
          className="px-4 py-3 border-t border-slate-200/50 dark:border-slate-800/50 flex items-end gap-2 shrink-0 bg-white/30 dark:bg-slate-900/30"
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={inputDisabled}
            placeholder={
              selectedSession
                ? `Message ${selectedSession.session_id}… (Enter to send)`
                : 'Create or select a conversation first…'
            }
            className="flex-1 resize-none px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder-slate-400 disabled:opacity-40 disabled:cursor-not-allowed leading-relaxed max-h-[120px] overflow-y-auto"
            style={{ height: '42px' }}
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || inputDisabled}
            className="h-[42px] w-[42px] shrink-0 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all active:scale-95 disabled:opacity-40 disabled:scale-100 disabled:cursor-not-allowed shadow-md"
            title={selectedSession ? 'Send message' : 'Select a conversation first'}
          >
            {isSending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>

      {/* ── RAG source inspector (right panel) ── */}
      {selectedBotMessage && (selectedBotMessage.retrieved_chunks?.length ?? 0) > 0 && (
        <div className="w-72 shrink-0 glass-panel rounded-2xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold font-display text-slate-800 dark:text-slate-200">
                Source Documents
              </span>
            </div>
            <button
              onClick={() => setSelectedBotMessage(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            <p className="text-[10px] text-slate-400 border-l-2 border-indigo-500 pl-2 leading-relaxed">
              Chunks that exceeded the similarity threshold and were injected into the prompt.
            </p>
            {selectedBotMessage.retrieved_chunks.map((chunk, idx) => (
              <div
                key={chunk.vector_id}
                className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-900/60 border border-slate-200/40 dark:border-slate-800 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                    #{idx + 1}
                  </span>
                  <span className="text-[9px] font-semibold text-emerald-500">
                    {(chunk.score * 100).toFixed(1)}% match
                  </span>
                </div>
                <p className="text-[10px] leading-relaxed text-slate-700 dark:text-slate-400 select-text">
                  &ldquo;{chunk.content}&rdquo;
                </p>
                <div className="flex items-center gap-1 text-[8px] text-slate-400 pt-1.5 border-t border-slate-200/30 dark:border-slate-800/50">
                  <Clock className="h-2.5 w-2.5" />
                  <span className="font-mono truncate">vec …{chunk.vector_id.slice(-12)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
