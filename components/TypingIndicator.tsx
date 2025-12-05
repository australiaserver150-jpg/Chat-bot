import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex w-full mb-6 justify-start">
      <div className="flex max-w-[80%] flex-row gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-sm mt-1">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
        <div className="px-5 py-3 rounded-2xl rounded-tl-none bg-white border border-slate-100 shadow-sm flex items-center">
           <span className="text-slate-500 text-sm">Thinking...</span>
        </div>
      </div>
    </div>
  );
};
