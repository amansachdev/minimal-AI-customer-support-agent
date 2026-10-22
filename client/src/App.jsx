import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUp, Check, ChevronDown, CircleHelp,
  Clock3, LogOut, MessageCircle, Plus, ShieldCheck, Sparkles, UserRound,
} from "lucide-react";
import api, { getApiError } from "./api.js";

const quickPrompts = [
  { icon: "↗", title: "Order status", prompt: "Can you help me check on my order?" },
  { icon: "◈", title: "Returns & refunds", prompt: "What is your return and refund policy?" },
  { icon: "✳", title: "Talk to a person", prompt: "I would like to speak with a support person." },
];

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/auth/${mode === "login" ? "login" : "signup"}`, { email, password });
      sessionStorage.setItem("support_agent_token", data.token);
      onAuthenticated(data.user);
    } catch (requestError) {
      setError(getApiError(requestError, "Could not sign you in. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <div className="auth-wrap">
        <a className="brand auth-brand" href="#home" aria-label="Kindred Support home">
          <span className="brand-mark"><Sparkles size={17} strokeWidth={2.2} /></span>
          <span>kindred<span className="brand-light"> support</span></span>
        </a>
        <section className="auth-card">
          <div className="auth-icon"><MessageCircle size={22} /></div>
          <p className="eyebrow">A little help goes a long way</p>
          <h1>{mode === "login" ? "Welcome back." : "Let’s get you started."}</h1>
          <p className="auth-subtitle">{mode === "login" ? "Sign in to pick up where you left off." : "Create an account to start a conversation."}</p>
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">Email address</label>
            <input id="email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required maxLength={254} />
            <div className="label-row"><label htmlFor="password">Password</label>{mode === "signup" && <span>At least 8 characters</span>}</div>
            <input id="password" autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••••" required minLength={8} maxLength={72} />
            {error && <p role="alert" className="form-error">{error}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}<ArrowUp size={16} className="button-arrow" />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "New around here?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </section>
        <p className="auth-footnote"><ShieldCheck size={14} /> Your conversations are private and secure.</p>
      </div>
    </main>
  );
}

function Brand() {
  return <a className="brand" href="#home" aria-label="Kindred Support"><span className="brand-mark"><Sparkles size={16} strokeWidth={2.2} /></span><span>kindred<span className="brand-light"> support</span></span></a>;
}

function ChatMessage({ message }) {
  const assistant = message.role === "assistant";
  return (
    <article className={`message-row ${assistant ? "message-assistant" : "message-user"}`}>
      <div className={`message-avatar ${assistant ? "assistant-avatar" : "user-avatar"}`} aria-hidden="true">
        {assistant ? <Sparkles size={15} /> : <UserRound size={15} />}
      </div>
      <div className="message-content">
        <div className="message-meta"><strong>{assistant ? "Kindred" : "You"}</strong><span>{new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
        <p>{message.content}</p>
      </div>
    </article>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [pageError, setPageError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const refreshHistory = useCallback(async () => {
    const { data } = await api.get("/chat/history");
    setConversations(data.conversations);
  }, []);

  useEffect(() => {
    const storedToken = sessionStorage.getItem("support_agent_token");
    if (!storedToken) {
      setAuthReady(true);
      return;
    }
    api.get("/chat/history")
      .then(({ data }) => {
        setConversations(data.conversations);
        const email = (() => {
          try {
            const encoded = storedToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
            const payload = JSON.parse(new TextDecoder().decode(bytes));
            return payload.email;
          } catch { return ""; }
        })();
        setUser({ email });
      })
      .catch(() => sessionStorage.removeItem("support_agent_token"))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setMessages([]);
      setActiveId(null);
      setPageError("Your session expired. Please sign in again.");
    };
    window.addEventListener("support-agent-session-expired", onExpired);
    return () => window.removeEventListener("support-agent-session-expired", onExpired);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function openConversation(id) {
    if (sending) return;
    setActiveId(id);
    setPageError("");
    setLoadingConversation(true);
    setSidebarOpen(false);
    try {
      const { data } = await api.get(`/chat/history/${id}`);
      setMessages(data.conversation.messages);
    } catch (error) {
      setPageError(getApiError(error, "Could not load this conversation."));
    } finally {
      setLoadingConversation(false);
    }
  }

  function startNewChat() {
    if (sending) return;
    setActiveId(null);
    setMessages([]);
    setDraft("");
    setPageError("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  async function sendMessage(event, suggestedMessage) {
    event?.preventDefault();
    const content = (suggestedMessage ?? draft).trim();
    if (!content || sending) return;
    setDraft("");
    setSending(true);
    setPageError("");
    try {
      const { data } = await api.post("/chat/send", { message: content, ...(activeId ? { conversationId: activeId } : {}) });
      setActiveId(data.conversationId);
      setMessages((current) => [
        ...current,
        { role: "user", content, createdAt: new Date().toISOString() },
        data.message,
      ]);
      refreshHistory().catch(() => {});
    } catch (error) {
      setDraft(content);
      setPageError(getApiError(error, "Your message could not be sent. Please try again."));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function logout() {
    try { await api.post("/auth/logout"); } catch { /* Local token removal completes logout. */ }
    sessionStorage.removeItem("support_agent_token");
    setUser(null);
    setConversations([]);
    setMessages([]);
    setActiveId(null);
  }

  function onAuthenticated(authenticatedUser) {
    setUser(authenticatedUser);
    setPageError("");
    refreshHistory().catch(() => {});
  }

  if (!authReady) return <div className="loading-screen"><span className="loading-orb"><Sparkles size={18} /></span></div>;
  if (!user) return <AuthScreen onAuthenticated={onAuthenticated} />;

  const isEmpty = messages.length === 0;
  const displayName = user.email?.split("@")[0]?.replace(/[._-]/g, " ") || "there";

  return (
    <div className="app-shell">
      <div className={`mobile-backdrop ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><ArrowLeft size={18} /></button></div>
        <button className="new-chat-button" onClick={startNewChat}><Plus size={16} /> New conversation <span>⌘ K</span></button>
        <div className="history-heading"><span>RECENT CONVERSATIONS</span><Clock3 size={14} /></div>
        <div className="conversation-list">
          {conversations.length === 0 ? <p className="history-empty">Your conversations will appear here.</p> : conversations.map((conversation) => (
            <button key={conversation.id} className={`conversation-link ${activeId === conversation.id ? "conversation-active" : ""}`} onClick={() => openConversation(conversation.id)}>
              <span className="conversation-dot"><MessageCircle size={14} /></span>
              <span className="conversation-label">{conversation.title}</span>
              {activeId === conversation.id && <span className="active-mark"><Check size={12} /></span>}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="help-link" onClick={() => window.open("mailto:support@example.com", "_blank")}><CircleHelp size={16} /> Help center <ArrowUp size={12} className="external-arrow" /></button>
          <div className="account-row">
            <div className="account-avatar">{(user.email?.[0] || "U").toUpperCase()}</div>
            <div className="account-detail"><strong>{user.email || "Your account"}</strong><span>Personal account</span></div>
            <button className="icon-button logout-button" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><span className="menu-lines">☰</span></button><span className="topbar-location">Support desk <span>/</span> <strong>{activeId ? conversations.find((item) => item.id === activeId)?.title || "Conversation" : "New conversation"}</strong></span></div>
          <div className="topbar-status"><span className="online-indicator" /> All systems normal <ChevronDown size={13} /></div>
        </header>

        {loadingConversation ? <div className="conversation-loading"><span className="spinner" /> Opening conversation…</div> : (
          <div className={`chat-area ${isEmpty ? "chat-area-empty" : ""}`}>
            {isEmpty ? (
              <section className="welcome-section">
                <div className="welcome-orb"><span className="orb-glow" /><Sparkles size={24} /></div>
                <p className="eyebrow welcome-eyebrow">YOUR SUPPORT, REIMAGINED</p>
                <h1>{activeId ? "A fresh start." : <>Good morning,<br /><span>{displayName}.</span></>}</h1>
                <p className="welcome-copy">I’m here to help with whatever’s on your mind.<br className="desktop-break" /> What can I make easier for you today?</p>
                <div className="prompt-cards">
                  {quickPrompts.map((item) => <button key={item.title} className="prompt-card" onClick={() => sendMessage(null, item.prompt)} disabled={sending}><span className="prompt-icon">{item.icon}</span><span className="prompt-title">{item.title}</span><ArrowUp size={14} /></button>)}
                </div>
              </section>
            ) : (
              <section className="messages-wrap" aria-live="polite">
                <div className="thread-intro"><span className="thread-icon"><Sparkles size={15} /></span><div><strong>You’re in good hands.</strong><span>Here’s your conversation so far.</span></div></div>
                {messages.map((message, index) => <ChatMessage key={message.id || `${message.createdAt}-${index}`} message={message} />)}
                {sending && <article className="message-row message-assistant typing-row"><div className="message-avatar assistant-avatar"><Sparkles size={15} /></div><div className="typing-bubble"><span /><span /><span /><small>Kindred is thinking</small></div></article>}
                <div ref={bottomRef} />
              </section>
            )}
          </div>
        )}

        <div className="composer-area">
          {pageError && <div role="alert" className="chat-error"><span>{pageError}</span><button onClick={() => setPageError("")} aria-label="Dismiss error">×</button></div>}
          <form className="composer" onSubmit={sendMessage}>
            <textarea ref={inputRef} rows="1" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} placeholder="Ask us anything…" maxLength={4000} aria-label="Your message" disabled={sending || loadingConversation} />
            <div className="composer-footer"><span><span className="composer-sparkle">✳</span> Kindred AI is here to help <span className="composer-note">· Please don’t share sensitive information</span></span><button className="send-button" type="submit" disabled={!draft.trim() || sending || loadingConversation} aria-label="Send message"><ArrowUp size={17} /></button></div>
          </form>
          <p className="composer-caption">Kindred can make mistakes. For important details, please double-check.</p>
        </div>
      </main>
    </div>
  );
}

export default App;
