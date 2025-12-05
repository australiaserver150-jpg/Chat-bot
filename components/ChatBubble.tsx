import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot, AlertCircle } from 'lucide-react';
import { Message } from '../types';

interface ChatBubbleProps {
  message: Message;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isError = message.isError;

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <span className="text-xs text-slate-400 uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[70%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-indigo-600' : isError ? 'bg-red-500' : 'bg-emerald-600'
        } text-white shadow-sm mt-1`}>
          {isUser ? <User size={16} /> : isError ? <AlertCircle size={16} /> : <Bot size={16} />}
        </div>

        {/* Bubble */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`px-5 py-3 rounded-2xl shadow-sm text-sm md:text-base overflow-hidden ${
            isUser 
              ? 'bg-indigo-600 text-white rounded-tr-none' 
              : isError 
                ? 'bg-red-50 text-red-800 border border-red-200 rounded-tl-none'
                : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
          }`}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="markdown-body">
                <ReactMarkdown>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 px-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};
