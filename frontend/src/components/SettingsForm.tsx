import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Terminal,
  Key,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Bot,
  RotateCcw,
  MessageCircle,
  Database,
} from 'lucide-react';
import api from '../services/api';
import { useToast } from './ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemSettings {
  // RAG retrieval
  chunk_size:           number;
  chunk_overlap:        number;
  top_k:                number;
  similarity_threshold: number;

  // LLM / generation
  llm_model:       string;
  llm_temperature: number;
  llm_max_tokens:  number;

  // Prompts
  system_prompt:    string;
  fallback_message: string;

  // Google Gemini
  gemini_api_key:         string;
  gemini_embedding_model: string;

  // Pinecone
  pinecone_api_key:    string;
  pinecone_index_name: string;
  embedding_dimension: number;

  // WasenderAPI
  wasender_api_key:      string;
  wasender_session_name: string;
  wasender_base_url:     string;
  wasender_webhook_secret: string;
}

interface SettingsFormProps {
  onRefreshAnalytics: () => void;
}

// ─── Gemini generation models ─────────────────────────────────────────────────
const GEMINI_MODELS = [
  { value: 'gemini-flash-latest', label: 'Gemini Flash Latest  (recommended — your account)' },
  { value: 'gemini-2.5-flash',    label: 'Gemini 2.5 Flash  (newer API key required)' },
  { value: 'gemini-2.0-flash',    label: 'Gemini 2.0 Flash' },
];

// ─── Gemini embedding models ──────────────────────────────────────────────────
const GEMINI_EMBEDDING_MODELS = [
  { value: 'gemini-embedding-001', label: 'gemini-embedding-001  (3072-dim, stable)' },
  { value: 'gemini-embedding-2',   label: 'gemini-embedding-2  (3072-dim, latest)' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const SettingsForm: React.FC<SettingsFormProps> = ({ onRefreshAnalytics }) => {
  const [formData, setFormData] = useState<SystemSettings>({
    chunk_size:           500,
    chunk_overlap:        50,
    top_k:                4,
    similarity_threshold: 0.20,
    llm_model:            'gemini-flash-latest',
    llm_temperature:      0.3,
    llm_max_tokens:       512,
    system_prompt:        '',
    fallback_message:     '',
    gemini_api_key:         '',
    gemini_embedding_model: 'gemini-embedding-001',
    pinecone_api_key:    '',
    pinecone_index_name: 'whatsapp-chatbot',
    embedding_dimension: 3072,
    wasender_api_key:      '',
    wasender_session_name: 'Gowthami',
    wasender_base_url:     'https://www.wasenderapi.com',
    wasender_webhook_secret: '',
  });

  const [isLoading,  setIsLoading]  = useState(false);
  const [isSaving,   setIsSaving]   = useState(false);
  const [showKeys,   setShowKeys]   = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => { loadSettings(); }, []);

  // ── Data helpers ──────────────────────────────────────────────────────────

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('settings');
      setFormData((prev) => ({ ...prev, ...res.data }));
    } catch {
      toast('error', 'Error loading settings', 'Could not retrieve configuration from the database.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.post('settings', formData);
      toast('success', 'Settings saved', 'All configurations updated successfully.');
      onRefreshAnalytics();
      loadSettings();
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Error saving settings.';
      toast('error', 'Save failed', detail);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Input handlers ────────────────────────────────────────────────────────

  const FLOAT_FIELDS = new Set(['similarity_threshold', 'llm_temperature']);
  const INT_FIELDS   = new Set(['chunk_size', 'chunk_overlap', 'top_k', 'llm_max_tokens']);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: FLOAT_FIELDS.has(name)
        ? parseFloat(value)
        : INT_FIELDS.has(name)
          ? parseInt(value, 10)
          : value,
    }));
  };

  const setNum = (name: string, val: number) =>
    setFormData((prev) => ({ ...prev, [name]: val }));

  const toggleKey = (key: string) =>
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  // ── Sub-components ────────────────────────────────────────────────────────

  const SectionHeader = ({
    icon, title, subtitle,
  }: { icon: React.ReactNode; title: string; subtitle?: string }) => (
    <div className="flex items-start gap-3 border-b border-slate-200/50 dark:border-slate-800/50 pb-3">
      <div className="mt-0.5 text-indigo-500">{icon}</div>
      <div>
        <h3 className="font-semibold text-sm font-display">{title}</h3>
        {subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );

  const SliderRow = ({
    label, name, min, max, step, hint, isFloat = false,
  }: {
    label: string; name: keyof SystemSettings;
    min: number; max: number; step: number; hint: string; isFloat?: boolean;
  }) => {
    const raw     = formData[name] as number;
    const display = isFloat ? raw.toFixed(2) : raw;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</label>
          <span className="text-xs font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded font-mono">
            {display}
          </span>
        </div>
        <input
          type="range" min={min} max={max} step={step} value={raw}
          onChange={(e) =>
            setNum(name as string, isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10))
          }
          className="w-full accent-indigo-500 cursor-pointer"
        />
        <span className="text-[10px] text-slate-400">{hint}</span>
      </div>
    );
  };

  const SecretInput = ({
    label, name, placeholder, keyId, hint,
  }: {
    label: string; name: keyof SystemSettings;
    placeholder: string; keyId: string; hint?: string;
  }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{label}</label>
      <div className="relative">
        <input
          type={showKeys[keyId] ? 'text' : 'password'}
          name={name as string}
          value={formData[name] as string}
          onChange={handleChange}
          placeholder={placeholder}
          className="w-full pl-3 pr-10 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-transparent"
        />
        <button
          type="button"
          onClick={() => toggleKey(keyId)}
          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
        >
          {showKeys[keyId] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
  );

  const TextInput = ({
    label, name, placeholder, hint, mono = false,
  }: {
    label: string; name: keyof SystemSettings;
    placeholder?: string; hint?: string; mono?: boolean;
  }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{label}</label>
      <input
        type="text"
        name={name as string}
        value={formData[name] as string}
        onChange={handleChange}
        placeholder={placeholder}
        className={[
          'w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-transparent',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-4xl pb-10">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-display">System Settings</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Configure RAG retrieval, Gemini LLM, prompts, and external API credentials.
            Changes take effect on the next message.
          </p>
        </div>
        <button
          type="submit" disabled={isSaving}
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — RAG Retrieval
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
        <SectionHeader
          icon={<Sliders className="h-5 w-5" />}
          title="RAG Retrieval Parameters"
          subtitle="Controls how documents are chunked during indexing and how many passages are retrieved per query."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SliderRow
            label="Chunk Size (chars)" name="chunk_size" min={100} max={2000} step={50}
            hint="Maximum characters per text chunk during document indexing."
          />
          <SliderRow
            label="Chunk Overlap (chars)" name="chunk_overlap" min={0} max={200} step={10}
            hint="Characters shared between consecutive chunks to preserve context at boundaries."
          />
          <SliderRow
            label="Top-K Results" name="top_k" min={1} max={15} step={1}
            hint="Number of document chunks retrieved and injected into the prompt per query."
          />
          <SliderRow
            label="Similarity Threshold" name="similarity_threshold" min={0.0} max={1.0} step={0.05}
            isFloat
            hint="Minimum cosine similarity score a chunk must reach to be included in the context."
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — Google Gemini (generation + embeddings + key)
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
        <SectionHeader
          icon={<Bot className="h-5 w-5" />}
          title="Google Gemini"
          subtitle="Used for both answer generation and document embeddings. One API key covers both."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* API Key */}
          <div className="md:col-span-2">
            <SecretInput
              label="Gemini API Key"
              name="gemini_api_key"
              keyId="gemini"
              placeholder="AQ. ..."
              hint="Required for both answer generation and embeddings. Get yours at aistudio.google.com/app/apikey"
            />
          </div>

          {/* Answer Generation Model */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Answer Generation Model
            </label>
            <select
              name="llm_model"
              value={formData.llm_model}
              onChange={handleChange}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white dark:bg-slate-900"
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
              {!GEMINI_MODELS.some((m) => m.value === formData.llm_model) && (
                <option value={formData.llm_model}>{formData.llm_model} (custom)</option>
              )}
            </select>
            <span className="text-[10px] text-slate-400">
              Used to generate answers from retrieved document passages.
            </span>
          </div>

          {/* Embedding Model */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Embedding Model
            </label>
            <select
              name="gemini_embedding_model"
              value={formData.gemini_embedding_model}
              onChange={handleChange}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white dark:bg-slate-900"
            >
              {GEMINI_EMBEDDING_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <span className="text-[10px] text-amber-500 dark:text-amber-400 font-medium">
              ⚠ Changing the embedding model requires re-indexing all documents —
              existing Pinecone vectors will be incompatible.
            </span>
          </div>

          {/* Temperature */}
          <SliderRow
            label="Temperature" name="llm_temperature" min={0.0} max={1.5} step={0.05} isFloat
            hint="Lower = more factual. Higher = more creative. 0.3 works well for Q&A."
          />

          {/* Max tokens */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Max Response Tokens
              </label>
              <span className="text-xs font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded font-mono">
                {formData.llm_max_tokens}
              </span>
            </div>
            <input
              type="range" min={64} max={2048} step={64}
              value={formData.llm_max_tokens}
              onChange={(e) => setNum('llm_max_tokens', parseInt(e.target.value, 10))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400">
              Maximum tokens Gemini may generate per reply. 512 is sufficient for most answers.
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — Prompt Engineering
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
        <SectionHeader
          icon={<Terminal className="h-5 w-5" />}
          title="Prompt Engineering"
          subtitle="Customise the system instructions and the fallback message shown when no documents match."
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              System Prompt
            </label>
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  system_prompt:
                    'You are a knowledgeable assistant that answers questions based on the provided document excerpts.\n\n' +
                    'Rules:\n' +
                    '1. Read all the context passages carefully before answering.\n' +
                    '2. Synthesise information from MULTIPLE passages when needed.\n' +
                    '3. Give a clear, helpful answer if the context contains relevant information.\n' +
                    '4. Only say you do not know if the context genuinely contains NO related information.\n' +
                    '5. Never make up facts not supported by the context.\n' +
                    '6. Keep answers concise but complete.',
                }))
              }
              className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-400 font-semibold"
            >
              <RotateCcw className="h-3 w-3" />
              Reset to default
            </button>
          </div>
          <textarea
            name="system_prompt" value={formData.system_prompt}
            onChange={handleChange} rows={8}
            className="w-full p-3.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-transparent leading-relaxed font-mono"
          />
          <span className="text-[10px] text-slate-400">
            Sent as the system message on every Gemini call. Instructs how to use retrieved context.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Fallback Message{' '}
            <span className="font-normal text-slate-400">
              (shown when no document chunks pass the similarity threshold)
            </span>
          </label>
          <textarea
            name="fallback_message" value={formData.fallback_message}
            onChange={handleChange} rows={3}
            className="w-full p-3.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-transparent leading-relaxed"
          />
          <span className="text-[10px] text-slate-400">
            Shown when Pinecone returns no matches above the threshold. Keep it helpful and polite.
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 4 — Pinecone
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
        <SectionHeader
          icon={<Database className="h-5 w-5" />}
          title="Pinecone Vector Database"
          subtitle="Stores 3072-dim Gemini embedding vectors used for semantic search."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SecretInput
            label="API Key" name="pinecone_api_key" keyId="pinecone"
            placeholder="pcsk_..."
          />
          <TextInput
            label="Index Name" name="pinecone_index_name"
            placeholder="whatsapp-chatbot"
            hint="Must match the Pinecone index name. Currently using dimension 3072 (gemini-embedding-001)."
            mono
          />
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Vector Dimension
            </label>
            <div className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 font-mono text-slate-500">
              {formData.embedding_dimension} &nbsp;
              <span className="text-slate-400 font-sans font-normal">
                (set by gemini-embedding-001 — read-only)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 5 — WasenderAPI
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-5">
        <SectionHeader
          icon={<MessageCircle className="h-5 w-5" />}
          title="Wasender WhatsApp API"
          subtitle="Handles incoming and outgoing WhatsApp messages through your linked Wasender session."
        />

        {/* Webhook URL info */}
        <div className="px-3 py-2.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
          <span className="font-semibold text-indigo-500">Webhook URL</span> to register in the Wasender dashboard
          (Session → Webhooks):<br />
          <code className="font-mono text-indigo-400 select-all">
            https://&lt;your-domain&gt;/webhook
          </code>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <SecretInput
            label="Wasender API Key"
            name="wasender_api_key"
            keyId="wasender"
            placeholder="3310e8d5..."
            hint="Generated per session in the Wasender dashboard. Keep this secret."
          />

          <TextInput
            label="Session Name"
            name="wasender_session_name"
            placeholder="Gowthami"
            hint="Human-readable name of the connected WhatsApp session."
          />

          <TextInput
            label="API Base URL"
            name="wasender_base_url"
            placeholder="https://www.wasenderapi.com"
            hint="Do not change unless using a self-hosted Wasender instance."
            mono
          />

          <SecretInput
            label="Webhook Secret"
            name="wasender_webhook_secret"
            keyId="wasender_secret"
            placeholder="b83b35cf..."
            hint="Must match the Webhook Secret set in Wasender dashboard → Session → Webhooks."
          />

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 6 — Credentials legend
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="glass-panel p-4 rounded-2xl">
        <div className="flex items-start gap-3">
          <Key className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-slate-400 leading-relaxed">
            API keys are stored in Supabase and masked in the UI
            (first 4 + last 4 characters shown). Paste a new value to update a key —
            sending back a masked value leaves the existing key unchanged.
          </p>
        </div>
      </div>

    </form>
  );
};
