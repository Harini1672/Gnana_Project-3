import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { DashboardOverview } from '../components/DashboardOverview';
import { DocumentManager } from '../components/DocumentManager';
import { ChatViewer } from '../components/ChatViewer';
import { SettingsForm } from '../components/SettingsForm';
import { ProfileSettings } from '../components/ProfileSettings';
import api from '../services/api';
import { useToast } from '../components/ui/Toast';

interface DashboardProps {
  userEmail: string;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ userEmail, onLogout }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  // Lifted up so the selected session survives tab switches (ChatViewer unmounts/remounts)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [isDocsLoading, setIsDocsLoading] = useState(false);
  const [isChatsLoading, setIsChatsLoading] = useState(false);
  
  const { toast } = useToast();

  // 1. Fetch Overview Analytics
  const loadAnalytics = useCallback(async (silent = false) => {
    if (!silent) setIsOverviewLoading(true);
    try {
      const response = await api.get('analytics');
      setAnalytics(response.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      toast('error', 'Error syncing charts', 'Could not refresh statistics.');
    } finally {
      setIsOverviewLoading(false);
    }
  }, [toast]);

  // 2. Fetch Documents List
  const loadDocuments = useCallback(async (silent = false) => {
    if (!silent) setIsDocsLoading(true);
    try {
      const response = await api.get('documents');
      setDocuments(response.data);
    } catch (err) {
      console.error('Error fetching documents:', err);
      toast('error', 'Error fetching files', 'Could not retrieve document registry.');
    } finally {
      setIsDocsLoading(false);
    }
  }, [toast]);

  // 3. Fetch Chats Sessions
  const loadSessions = useCallback(async (silent = false) => {
    if (!silent) setIsChatsLoading(true);
    try {
      const response = await api.get('chat-history');
      const data = response.data as any[];
      setSessions(data);
      // Auto-select the first session if nothing is selected yet
      if (data.length > 0) {
        setSelectedSessionId((prev) => prev ?? data[0].id);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      toast('error', 'Error syncing conversations', 'Could not load WhatsApp chats.');
    } finally {
      setIsChatsLoading(false);
    }
  }, [toast]);

  // Global loader trigger
  const syncAllData = useCallback(() => {
    loadAnalytics();
    loadDocuments();
    loadSessions();
  }, [loadAnalytics, loadDocuments, loadSessions]);

  // Initial load
  useEffect(() => {
    syncAllData();
  }, [syncAllData]);

  // Auto-sync polling logic
  useEffect(() => {
    // Poll documents every 5 seconds if a document is processing
    const hasProcessingDocs = documents.some((doc) => doc.status === 'processing' || doc.status === 'uploaded');
    let docInterval: any;

    if (activeTab === 'documents' || hasProcessingDocs) {
      docInterval = setInterval(() => {
        loadDocuments(true);
      }, 5000);
    }

    return () => {
      if (docInterval) clearInterval(docInterval);
    };
  }, [activeTab, documents, loadDocuments]);

  // Poll chats list every 10 seconds if conversation view is active
  useEffect(() => {
    let chatInterval: any;
    if (activeTab === 'chats') {
      chatInterval = setInterval(() => {
        loadSessions(true);
      }, 10000);
    }
    return () => {
      if (chatInterval) clearInterval(chatInterval);
    };
  }, [activeTab, loadSessions]);

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      userEmail={userEmail}
      onLogout={onLogout}
    >
      {activeTab === 'overview' && (
        <DashboardOverview
          analytics={analytics}
          isLoading={isOverviewLoading}
          onRefresh={() => loadAnalytics()}
          setActiveTab={setActiveTab}
        />
      )}

      {activeTab === 'documents' && (
        <DocumentManager
          documents={documents}
          isLoading={isDocsLoading}
          onRefresh={() => loadDocuments()}
        />
      )}

      {activeTab === 'chats' && (
        <ChatViewer
          sessions={sessions}
          isLoadingSessions={isChatsLoading}
          selectedSessionId={selectedSessionId}
          onSelectSession={setSelectedSessionId}
          onRefreshSessions={() => loadSessions(true)}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsForm 
          onRefreshAnalytics={() => loadAnalytics(true)}
        />
      )}

      {activeTab === 'profile' && (
        <ProfileSettings />
      )}
    </Layout>
  );
};
