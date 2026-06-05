/**
 * frontend/src/components/AiAdvisor.js
 * ======================================
 * PRISM Advisor chat interface.
 * Sends questions to POST /ai/analyze and renders responses with
 * markdown-like formatting and tool-call pills.
 *
 * Props:
 *   portfolio — full portfolio object from /portfolio/{wallet}
 */

import React, { useState, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Quick-question shortcuts
// ---------------------------------------------------------------------------
const QUICK_QUESTIONS = [
  "What is my risk score?",
  "Explain my PRISM health score",
  "How should I rebalance?",
  "What are my top tokens?",
  "Which chain holds the most value?",
  "Am I PRISM ready?",
];

// ---------------------------------------------------------------------------
// Helper — render a line of assistant text with basic markdown-like styling
// ---------------------------------------------------------------------------
function renderLine(line, idx) {
  // Bold header: **text**
  if (line.startsWith('**') && line.endsWith('**')) {
    return (
      <p key={idx} className="font-semibold text-white mb-1">
        {line.slice(2, -2)}
      </p>
    );
  }
  // Bullet point: - text
  if (line.startsWith('- ')) {
    return (
      <div key={idx} className="flex items-start gap-2 text-gray-200 mb-0.5">
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
        <span>{line.slice(2)}</span>
      </div>
    );
  }
  // Heading: # text
  if (line.startsWith('#')) {
    return (
      <p key={idx} className="text-base font-semibold text-white mt-2 mb-1">
        {line.replace(/^#+\s*/, '')}
      </p>
    );
  }
  // Empty line → spacer
  if (line.trim() === '') {
    return <div key={idx} className="h-2" />;
  }
  // Default
  return (
    <p key={idx} className="text-gray-200 mb-0.5">
      {line}
    </p>
  );
}

// ---------------------------------------------------------------------------
// AiAdvisor component
// ---------------------------------------------------------------------------
export default function AiAdvisor({ portfolio }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiReady, setAiReady] = useState(null); // null | true | false

  const bottomRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── sendMessage ────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (!text || !text.trim() || loading) return;

    const userMsg = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text.trim(),
          portfolio_data: portfolio || {},
          conversation_history: messages.slice(-6).map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.message || 'No response.',
          tools: data.tool_calls || [],
        },
      ]);
      setAiReady(data.ai_ready ?? null);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I couldn\'t process that. Make sure the backend is running.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // ── Status indicator (right side of header) ───────────────────────────────
  function renderStatus() {
    if (aiReady === true) {
      return (
        <span className="flex items-center text-xs text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block mr-1" />
          GPT-4o-mini
        </span>
      );
    }
    if (aiReady === false) {
      return (
        <span className="flex items-center text-xs text-yellow-400">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block mr-1" />
          Rule-based
        </span>
      );
    }
    return (
      <span className="flex items-center text-xs text-gray-400">
        <span className="w-2 h-2 rounded-full bg-gray-500 inline-block mr-1" />
        Ready
      </span>
    );
  }

  // ── Quick-question button (reused in two places) ──────────────────────────
  function QuickBtn({ q }) {
    return (
      <button
        onClick={() => sendMessage(q)}
        disabled={loading}
        className="
          bg-gray-800 hover:bg-blue-900/40 border border-gray-700
          hover:border-blue-600 text-gray-300 text-xs px-3 py-1.5
          rounded-lg transition-all disabled:opacity-40 whitespace-nowrap
        "
      >
        {q}
      </button>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col h-[600px]">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-800/50 px-4 py-3 border-b border-gray-700 flex justify-between items-center">
        <div>
          <p className="text-white font-bold text-sm">🧠 PRISM Advisor</p>
          <p className="text-gray-400 text-xs">AI portfolio intelligence</p>
        </div>
        {renderStatus()}
      </div>

      {/* ── Messages area ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Welcome state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="text-5xl mb-4">🔮</div>
            <p className="text-white font-semibold text-base mb-1">
              Ask me anything about your portfolio
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Powered by JULIUS's AutoGen architecture
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_QUESTIONS.map(q => <QuickBtn key={q} q={q} />)}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'user' ? (
              /* User bubble */
              <div className="bg-blue-600 text-white text-sm px-4 py-2 rounded-2xl rounded-tr-sm max-w-[80%]">
                {msg.content}
              </div>
            ) : (
              /* Assistant bubble */
              <div className="bg-gray-800 border border-gray-700 text-gray-100 text-sm px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%]">
                {/* Markdown-like content */}
                <div>
                  {msg.content.split('\n').map((line, i) => renderLine(line, i))}
                </div>

                {/* Tool-call pills */}
                {msg.tools && msg.tools.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700/50">
                    <span className="text-gray-500 text-xs mr-2">Tools used:</span>
                    {msg.tools.map((tool, ti) => (
                      <span
                        key={ti}
                        className="inline-block bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded mr-1 mt-1"
                      >
                        {tool.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 border border-gray-700 px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex gap-1.5 items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick questions strip (shown after first message) ─────────────── */}
      {messages.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-gray-800 flex gap-2 overflow-x-auto">
          {QUICK_QUESTIONS.map(q => <QuickBtn key={q} q={q} />)}
        </div>
      )}

      {/* ── Input row ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-700 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          disabled={loading}
          placeholder="Ask about your portfolio..."
          className="
            flex-1 bg-gray-800 border border-gray-700 rounded-xl
            px-4 py-2 text-white placeholder-gray-500 text-sm
            focus:outline-none focus:border-blue-600
            disabled:opacity-50
          "
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="
            bg-blue-600 hover:bg-blue-500 disabled:opacity-40
            px-4 py-2 rounded-xl text-white text-sm font-medium
            transition-colors flex items-center gap-1
          "
        >
          {loading ? (
            /* Spinner */
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            '→'
          )}
        </button>
      </div>
    </div>
  );
}
