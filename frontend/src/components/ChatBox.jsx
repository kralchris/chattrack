import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store.js';

export default function ChatBox({ onSend }) {
  const { messages } = useChatStore();
  const [input, setInput] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!input.trim()) return;
    onSend?.(input.trim());
    setInput('');
  };

  return (
    <div className="flex flex-col rounded-2xl bg-surface/80 p-4 shadow-lg shadow-black/30 backdrop-blur">
      <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto pr-2">
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex items-center gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type trading instructions..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-accentMuted"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const alignment = isUser ? 'items-end text-right' : 'items-start text-left';
  const bubbleStyles = isUser
    ? 'bg-accent text-slate-900'
    : 'bg-white/5 text-white border border-white/10';

  return (
    <div className={`flex flex-col ${alignment}`}>
      <span className="mb-1 text-xs uppercase tracking-wide text-white/60">
        {isUser ? 'You' : message.role === 'assistant' ? 'ChatTrack' : 'System'}
      </span>
      <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm shadow shadow-black/20 ${bubbleStyles}`}>
        {message.content}
      </div>
    </div>
  );
}
