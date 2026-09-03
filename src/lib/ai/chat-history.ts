import { getSupabase } from "@/lib/supabase/client";

export interface ChatMessageItem {
  id: string;
  sender: "stella" | "user";
  text: string;
  timestamp: string;
  createdAt?: string;
}

export interface ConversationSession {
  id: string;
  scopeKey: string;
  title: string;
  messages: ChatMessageItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationSummary {
  id: string;
  scopeKey: string;
  title: string;
  lastMessageSnippet: string;
  messageCount: number;
  updatedAt: string;
}

const LOCAL_STORAGE_KEY = "ieltstar_stella_conversations_v2";
const ACTIVE_CONV_PREFIX = "ieltstar_active_conv_";

// --- Local Storage Helpers ---
function getLocalStore(): Record<string, ConversationSession> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalStore(store: Record<string, ConversationSession>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded or private mode */
  }
}

// --- Active Session ID for Scope ---
export function getActiveConversationId(scopeKey: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(`${ACTIVE_CONV_PREFIX}${scopeKey}`);
}

export function setActiveConversationId(scopeKey: string, conversationId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${ACTIVE_CONV_PREFIX}${scopeKey}`, conversationId);
}

// --- Create New Conversation ---
export function createConversation(scopeKey: string, initialTitle: string = "Coaching Session"): ConversationSession {
  const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const session: ConversationSession = {
    id,
    scopeKey,
    title: initialTitle,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  const store = getLocalStore();
  store[id] = session;
  saveLocalStore(store);
  setActiveConversationId(scopeKey, id);

  return session;
}

// --- Load Conversation ---
export function loadConversation(id: string): ConversationSession | null {
  const store = getLocalStore();
  return store[id] || null;
}

// --- Save Message ---
export function saveMessageToConversation(
  conversationId: string,
  message: ChatMessageItem,
  userId?: string
): ConversationSession | null {
  const store = getLocalStore();
  const session = store[conversationId];
  if (!session) return null;

  session.messages.push(message);
  session.updatedAt = new Date().toISOString();

  // Auto-generate title from first user message if default
  if (message.sender === "user" && session.title.includes("Coaching Session")) {
    session.title = message.text.slice(0, 42).trim() + (message.text.length > 42 ? "..." : "");
  }

  store[conversationId] = session;
  saveLocalStore(store);

  // Background Cloud Sync to Supabase
  if (userId) {
    void syncMessageToCloud(session, message, userId);
  }

  return session;
}

// --- List All Conversations for UI ---
export function listConversations(scopeFilter?: string): ConversationSummary[] {
  const store = getLocalStore();
  const list = Object.values(store);

  return list
    .filter((c) => !scopeFilter || c.scopeKey === scopeFilter || scopeFilter === "all")
    .map((c) => {
      const lastMsg = c.messages[c.messages.length - 1];
      return {
        id: c.id,
        scopeKey: c.scopeKey,
        title: c.title,
        lastMessageSnippet: lastMsg ? lastMsg.text.slice(0, 70) : "No messages yet",
        messageCount: c.messages.length,
        updatedAt: c.updatedAt,
      };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// --- Delete Conversation ---
export function deleteConversation(conversationId: string, userId?: string): void {
  const store = getLocalStore();
  delete store[conversationId];
  saveLocalStore(store);

  if (userId) {
    void deleteFromCloud(conversationId, userId);
  }
}

// --- Cloud Synchronization (Supabase) ---
async function syncMessageToCloud(session: ConversationSession, message: ChatMessageItem, userId: string) {
  try {
    const supabase = getSupabase();

    // 1. Upsert conversation record
    await supabase.from("stella_conversations").upsert({
      id: session.id,
      user_id: userId,
      scope_key: session.scopeKey,
      title: session.title,
      updated_at: session.updatedAt,
    });

    // 2. Insert message turn
    await supabase.from("stella_messages").insert({
      id: message.id,
      conversation_id: session.id,
      user_id: userId,
      sender: message.sender,
      text: message.text,
      timestamp: message.timestamp,
      created_at: message.createdAt || new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Background chat sync notice:", err);
  }
}

async function deleteFromCloud(conversationId: string, userId: string) {
  try {
    const supabase = getSupabase();
    await supabase
      .from("stella_conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", userId);
  } catch {
    /* ignore network failure */
  }
}

// --- Sync down from Supabase on Login / Device Switch ---
export async function syncConversationsFromCloud(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const supabase = getSupabase();

    // 1. Fetch conversations
    const { data: cloudConvs } = await supabase
      .from("stella_conversations")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(25);

    if (!cloudConvs || cloudConvs.length === 0) return;

    const store = getLocalStore();

    for (const c of cloudConvs) {
      // If local store already has this conversation with equal or newer timestamp, skip
      if (store[c.id] && new Date(store[c.id].updatedAt) >= new Date(c.updated_at)) {
        continue;
      }

      // Fetch messages for this conversation
      const { data: cloudMsgs } = await supabase
        .from("stella_messages")
        .select("*")
        .eq("conversation_id", c.id)
        .order("created_at", { ascending: true });

      store[c.id] = {
        id: c.id,
        scopeKey: c.scope_key,
        title: c.title,
        messages: (cloudMsgs || []).map((m: any) => ({
          id: m.id,
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp,
          createdAt: m.created_at,
        })),
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    }

    saveLocalStore(store);
  } catch (err) {
    console.warn("Could not sync cloud conversations:", err);
  }
}

// --- Token-Saving Sliding Window Helper ---
export function getSlidingWindowContext(messages: ChatMessageItem[], maxTurns: number = 6): ChatMessageItem[] {
  if (messages.length <= maxTurns) return messages;
  return messages.slice(-maxTurns);
}
