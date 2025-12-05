import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Menu, Plus, MessageSquare, Trash2, Sparkles, X } from 'lucide-react';
import { GeminiService } from './services/geminiService';
import { Message, ChatSession } from './types';
import { ChatBubble } from './components/ChatBubble';
import { TypingIndicator } from './components/TypingIndicator';

// Create service instance
let geminiService = new GeminiService();

const STORAGE_KEY = 'nepali_ai_chat_sessions';

export default function App() {
  // --- State ---
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --- Helpers ---
  const createNewSession = useCallback((): ChatSession => {
    return {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [{
        id: 'welcome',
        role: 'model',
        content: "Namaste! Hello! I am Reena. I can help you with calculations, questions, and more in Nepali or English. How can I help you today?",
        timestamp: Date.now()
      }],
      updatedAt: Date.now()
    };
  }, []);

  const updateCurrentSession = (updatedMessages: Message[], newTitle?: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return {
          ...session,
          messages: updatedMessages,
          updatedAt: Date.now(),
          title: newTitle || session.title
        };
      }
      return session;
    }).sort((a, b) => b.updatedAt - a.updatedAt));
  };

  // --- Effects ---

  // 1. Load sessions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsedSessions: ChatSession[] = JSON.parse(saved);
        if (parsedSessions.length > 0) {
          // Sort by newest first
          parsedSessions.sort((a, b) => b.updatedAt - a.updatedAt);
          setSessions(parsedSessions);
          setCurrentSessionId(parsedSessions[0].id);
          setMessages(parsedSessions[0].messages);
          // Initialize service with history
          geminiService.startChat(parsedSessions[0].messages);
          return;
        }
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
    
    // Default to new session if nothing saved
    const newSession = createNewSession();
    setSessions([newSession]);
    setCurrentSessionId(newSession.id);
    setMessages(newSession.messages);
    geminiService.startChat(newSession.messages);
  }, [createNewSession]);

  // 2. Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  // 3. Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // 4. Auto-resize input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputText]);


  // --- Handlers ---

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userText = inputText.trim();
    setInputText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // 1. Add User Message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: userText,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);

    // Update Session Title if it's the first user interaction
    let newTitle: string | undefined;
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (currentSession && currentSession.title === 'New Chat') {
      newTitle = userText.slice(0, 30) + (userText.length > 30 ? '...' : '');
    }

    // Update session state immediately with user message
    updateCurrentSession(newMessages, newTitle);

    try {
      // 2. Call Gemini Service
      const stream = await geminiService.sendMessage(userText);
      
      // 3. Create placeholder for model response
      const modelMessageId = (Date.now() + 1).toString();
      let modelContent = '';
      
      // Update UI with initial empty bot message
      setMessages(prev => [...prev, {
        id: modelMessageId,
        role: 'model' as const,
        content: '',
        timestamp: Date.now()
      }]);

      for await (const chunk of stream) {
        modelContent = chunk;
        setMessages(prev => prev.map(msg => 
          msg.id === modelMessageId 
            ? { ...msg, content: modelContent }
            : msg
        ));
      }

      // Final update to session with complete conversation
      const finalMessages = [...newMessages, {
        id: modelMessageId,
        role: 'model' as const,
        content: modelContent,
        timestamp: Date.now()
      }];
      
      setMessages(finalMessages);
      updateCurrentSession(finalMessages, newTitle);

    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'model' as const,
        content: "Sorry, I encountered an error. Please try again.",
        isError: true,
        timestamp: Date.now()
      };
      const finalMessages = [...newMessages, errorMessage];
      setMessages(finalMessages);
      updateCurrentSession(finalMessages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = () => {
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages(newSession.messages);
    geminiService.startChat(newSession.messages);
    setIsSidebarOpen(false); // Close sidebar on mobile
  };

  const handleSelectSession = (session: ChatSession) => {
    if (session.id === currentSessionId) {
      setIsSidebarOpen(false);
      return;
    }
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    geminiService.startChat(session.messages);
    setIsSidebarOpen(false);
  };

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== sessionId);
    
    // If we deleted the only session, create a new one
    if (newSessions.length === 0) {
      const newSession = createNewSession();
      setSessions([newSession]);
      setCurrentSessionId(newSession.id);
      setMessages(newSession.messages);
      geminiService.startChat(newSession.messages);
    } else {
      setSessions(newSessions);
      // If we deleted the current session, switch to the first available
      if (sessionId === currentSessionId) {
        const nextSession = newSessions[0];
        setCurrentSessionId(nextSession.id);
        setMessages(nextSession.messages);
        geminiService.startChat(nextSession.messages);
      }
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-72 bg-slate-900 text-slate-100 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } flex flex-col`}>
        
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="text-emerald-400" size={20} />
            <span>Reena Chat Bot</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 hover:bg-slate-800 rounded">
            <X size={20} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button 
            onClick={handleNewChat}
            className="w-full flex items-center gap-3 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium shadow-sm"
          >
            <Plus size={20} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-slate-500 px-3 py-2 uppercase tracking-wider">Recent</div>
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => handleSelectSession(session)}
              className={`group flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                currentSessionId === session.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare size={16} className="flex-shrink-0" />
                <span className="truncate text-sm">{session.title}</span>
              </div>
              <button 
                onClick={(e) => handleDeleteSession(e, session.id)}
                className={`p-1.5 rounded-md hover:bg-red-900/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ${
                  currentSessionId === session.id ? 'opacity-100' : ''
                }`}
                title="Delete chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
          <p>Developed by Np.ai</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full w-full">
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 md:px-8 shadow-sm flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg md:hidden"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-semibold text-slate-800 truncate">
              {sessions.find(s => s.id === currentSessionId)?.title || 'Chat'}
            </h1>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
             <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
             Online
          </div>
        </header>

        {/* Messages List */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth bg-slate-50/50">
          <div className="max-w-3xl mx-auto flex flex-col min-h-full">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </main>

        {/* Input Area */}
        <footer className="bg-white border-t border-slate-100 p-4 md:p-6 flex-shrink-0">
          <div className="max-w-3xl mx-auto relative">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything (Nepali or English)..."
              className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none max-h-32 min-h-[50px] text-slate-700 shadow-sm"
              rows={1}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isLoading}
              className={`absolute right-2 bottom-2 p-2 rounded-xl transition-all ${
                inputText.trim() && !isLoading
                  ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:scale-105' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send size={20} />
            </button>
          </div>
          <div className="text-center mt-2">
             <span className="text-[10px] text-slate-400">
               AI can make mistakes. Check important info.
             </span>
          </div>
        </footer>
      </div>
    </div>
  );
}