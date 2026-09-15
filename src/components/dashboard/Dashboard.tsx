import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import type { Conversation, ConversationSummary, Message } from '@/types';

interface DashboardProps {
  onOpenSettings: () => void;
}

function createNewConversation(): Conversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'New Conversation',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Truncate to first ~5 words for auto-titling. */
function autoTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 5);
  const title = words.join(' ');
  return title.length > 40 ? title.slice(0, 40) + '…' : title;
}

export function Dashboard({ onOpenSettings }: DashboardProps) {
  // ── Folder filter state (unchanged from before) ──
  const [activeFolderPaths, setActiveFolderPaths] = useState<string[]>([]);

  const handleToggleFolder = useCallback((path: string) => {
    setActiveFolderPaths((prev) =>
      prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path]
    );
  }, []);

  const handleFolderRemoved = useCallback((path: string) => {
    setActiveFolderPaths((prev) => prev.filter((p) => p !== path));
  }, []);

  // ── Conversation state ──
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const storeRef = useRef<Awaited<ReturnType<typeof load>> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load conversations from store on mount ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const store = await load('conversations.json', { autoSave: false });
        storeRef.current = store;

        const raw = await store.get<Conversation[]>('conversations');
        if (!cancelled) {
          if (raw && Array.isArray(raw) && raw.length > 0) {
            // Rehydrate Date objects in messages
            const hydrated = raw.map((c) => ({
              ...c,
              messages: c.messages.map((m) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              })),
            }));
            setConversations(hydrated);
            // Restore last active, or fall back to most recent
            const lastActiveId = await store.get<string>('activeConversationId');
            const validId = hydrated.find((c) => c.id === lastActiveId)?.id ?? hydrated[0].id;
            setActiveConversationId(validId);
          } else {
            // First launch — create a default conversation
            const first = createNewConversation();
            setConversations([first]);
            setActiveConversationId(first.id);
          }
          setLoaded(true);
        }
      } catch (err) {
        console.error('[MundusAI] Failed to load conversations:', err);
        if (!cancelled) {
          const first = createNewConversation();
          setConversations([first]);
          setActiveConversationId(first.id);
          setLoaded(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Debounced auto-save (500ms) ──
  const persistConversations = useCallback((convos: Conversation[], activeId: string | null) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const store = storeRef.current;
      if (!store) return;
      try {
        await store.set('conversations', convos);
        await store.set('activeConversationId', activeId);
        await store.save();
      } catch (err) {
        console.error('[MundusAI] Failed to save conversations:', err);
      }
    }, 500);
  }, []);

  // Persist whenever conversations or active ID change
  useEffect(() => {
    if (loaded) {
      persistConversations(conversations, activeConversationId);
    }
  }, [conversations, activeConversationId, loaded, persistConversations]);

  // ── Active conversation helpers ──
  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  const handleMessagesChange = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeConversationId) return c;
          const newMessages = updater(c.messages);

          // Auto-title: if this is the first user message and title is still default
          let newTitle = c.title;
          if (c.title === 'New Conversation' && newMessages.length > 0) {
            const firstUserMsg = newMessages.find((m) => m.role === 'user');
            if (firstUserMsg && firstUserMsg.content.trim()) {
              newTitle = autoTitle(firstUserMsg.content);
            }
          }

          return {
            ...c,
            messages: newMessages,
            title: newTitle,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    [activeConversationId]
  );

  // ── Conversation CRUD ──
  const handleNewConversation = useCallback(() => {
    const newConvo = createNewConversation();
    setConversations((prev) => [newConvo, ...prev]);
    setActiveConversationId(newConvo.id);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const handleRenameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title, updatedAt: new Date().toISOString() } : c))
    );
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        // Find if this conversation has a generating message and cancel it
        const convoToDelete = prev.find((c) => c.id === id);
        if (convoToDelete) {
          const thinkingMsg = convoToDelete.messages.find((m) => m.isThinking);
          if (thinkingMsg) {
            invoke('cancel_question', { messageId: thinkingMsg.id }).catch((err) =>
              console.error('[MundusAI] Failed to cancel deleted query:', err)
            );
          }
        }

        const remaining = prev.filter((c) => c.id !== id);
        if (remaining.length === 0) {
          // Last conversation deleted — create a new one
          const newConvo = createNewConversation();
          setActiveConversationId(newConvo.id);
          return [newConvo];
        }
        
        // If we deleted the active one, fallback to the first available
        if (id === activeConversationId) {
          setActiveConversationId(remaining[0].id);
        }
        return remaining;
      });
    },
    [activeConversationId]
  );

  // ── Build sidebar summaries (no messages payload) ──
  const conversationSummaries: ConversationSummary[] = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
  }));

  if (!loaded) return null; // Avoid flash before store loads

  return (
    <div className="flex h-full w-full bg-surface-primary">
      <Sidebar
        onOpenSettings={onOpenSettings}
        activeFolderPaths={activeFolderPaths}
        onToggleFolder={handleToggleFolder}
        onFolderRemoved={handleFolderRemoved}
        conversations={conversationSummaries}
        activeConversationId={activeConversationId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
      />
      <ChatArea
        activeFolderPaths={activeFolderPaths}
        messages={activeConversation?.messages ?? []}
        onMessagesChange={handleMessagesChange}
        conversationTitle={activeConversation?.title ?? 'New Conversation'}
      />
    </div>
  );
}
