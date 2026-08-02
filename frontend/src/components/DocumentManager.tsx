import React, { useState, useRef } from 'react';
import { 
  FileText, 
  UploadCloud, 
  Search, 
  RefreshCw, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  Loader2 
} from 'lucide-react';
import api from '../services/api';
import { useToast } from './ui/Toast';

interface Document {
  id: string;
  name: string;
  file_type: string;
  size: number;
  status: string;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
}

interface DocumentManagerProps {
  documents: Document[];
  isLoading: boolean;
  onRefresh: () => void;
}

export const DocumentManager: React.FC<DocumentManagerProps> = ({
  documents,
  isLoading,
  onRefresh
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const uploadFile = async (file: File) => {
    const validExtensions = ['pdf', 'docx', 'csv', 'txt', 'md'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (!ext || !validExtensions.includes(ext)) {
      toast('error', 'Invalid file type', `.${ext} files are not supported. Upload PDF, DOCX, CSV, or TXT.`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast('error', 'File too large', 'Max file size allowed is 10MB.');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      toast('info', 'Uploading document...', `Uploading and preparing indexing for ${file.name}`);
      await api.post('upload-document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast('success', 'Document uploaded!', 'Indexing started in the background.');
      onRefresh();
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || 'Could not upload file.';
      toast('error', 'Upload failed', errMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? This will clear related Pinecone vectors.`)) {
      return;
    }

    try {
      await api.delete(`documents/${id}`);
      toast('success', 'Document deleted', `Successfully deleted ${name}`);
      onRefresh();
    } catch (err: any) {
      toast('error', 'Deletion failed', err.response?.data?.detail || 'Error deleting file.');
    }
  };

  const handleReindex = async (id: string, name: string) => {
    try {
      toast('info', 'Reindexing started', `Wiping and recalculating chunks for ${name}...`);
      await api.post('reindex', { document_id: id });
      toast('success', 'Reindex scheduled', 'Check status in a few moments.');
      onRefresh();
    } catch (err: any) {
      toast('error', 'Reindex failed', err.response?.data?.detail || 'Error triggering reindex.');
    }
  };

  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight font-display">Document Management</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Upload policies, FAQs, manuals, and knowledge-base sources.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold glass-panel hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Sync Status
        </button>
      </div>

      {/* Upload Drag & Drop Section */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`glass-panel border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 ${
          isDragging 
            ? 'border-indigo-500 bg-indigo-500/5 scale-[1.01]' 
            : 'border-slate-300 dark:border-slate-800 hover:border-indigo-500/40 hover:bg-slate-50/50 dark:hover:bg-slate-900/30'
        }`}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect}
          className="hidden" 
          accept=".pdf,.docx,.doc,.csv,.txt,.md"
        />
        <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500 animate-bounce">
          {isUploading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <UploadCloud className="h-8 w-8" />
          )}
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-sm">
            {isUploading ? 'Uploading file...' : 'Drag & drop your file here, or click to browse'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Supports PDF, DOCX, CSV, TXT (up to 10MB)
          </p>
        </div>
      </div>

      {/* List and Filters */}
      <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4">
        
        {/* Search Filter bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search documents by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-transparent"
          />
        </div>

        {/* Table view */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 pl-2">Name</th>
                <th className="pb-3">Size</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Chunks</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length > 0 ? (
                filteredDocs.map((doc) => (
                  <tr 
                    key={doc.id}
                    className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-100/30 dark:hover:bg-slate-800/10 transition-colors"
                  >
                    <td className="py-3.5 pl-2 font-medium max-w-xs md:max-w-sm truncate" title={doc.name}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                        <span>{doc.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 text-slate-500 dark:text-slate-400">
                      {formatBytes(doc.size)}
                    </td>
                    <td className="py-3.5 text-slate-500 dark:text-slate-400 uppercase font-semibold text-[10px]">
                      {doc.file_type}
                    </td>
                    <td className="py-3.5 font-semibold text-slate-700 dark:text-slate-300">
                      {doc.chunk_count}
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-1.5">
                        {doc.status === 'indexed' && (
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500">
                            <CheckCircle className="h-3 w-3" />
                            Indexed
                          </span>
                        )}
                        {doc.status === 'processing' && (
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Processing
                          </span>
                        )}
                        {doc.status === 'uploaded' && (
                          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-500">
                            Uploaded
                          </span>
                        )}
                        {doc.status === 'error' && (
                          <span 
                            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-500 cursor-help"
                            title={doc.error_message || 'Indexing failed.'}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            Error
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 pr-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleReindex(doc.id, doc.name)}
                          disabled={doc.status === 'processing'}
                          title="Wipe indices and process again"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-500 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.name)}
                          title="Delete from Storage & Pinecone"
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    No documents found. Upload text assets to build the knowledge base.
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
