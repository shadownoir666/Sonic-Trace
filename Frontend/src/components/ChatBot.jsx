import { useState, useRef, useEffect } from 'react'
import { Send, X, Loader2, Bot, User, Sparkles, MessageSquare } from 'lucide-react'
import { askChatbot } from '../services/api'

function SourceCard({ source }) {
  const timeStr = `${Math.floor(source.start / 60)}:${String(Math.floor(source.start % 60)).padStart(2,'0')}`
  return (
    <div style={{
      background: 'rgba(59,130,246,0.04)',
      border: '1px solid rgba(59,130,246,0.1)',
      borderRadius: 7, padding: '6px 10px',
      fontSize: '0.72rem', color: 'var(--text-400)', marginTop: 4,
      display: 'flex', alignItems: 'baseline', gap: 6,
    }}>
      <span style={{ color: '#60a5fa', fontWeight: 700, flexShrink: 0 }}>{source.speaker}</span>
      <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--text-500)' }}>{timeStr}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {source.text.replace(/\[.*?\]:\s*/, '').substring(0, 70)}…
      </span>
    </div>
  )
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 8, marginBottom: 12,
      animation: 'fadeUp 0.25s ease both',
    }}>
      {/* Avatar */}
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginTop: 2,
          boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
        }}>
          <Bot size={13} color="#fff" />
        </div>
      )}

      <div style={{ maxWidth: '82%' }}>
        <div style={{
          padding: '9px 13px',
          borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          background: isUser
            ? 'var(--brand-blue)'
            : 'var(--bg-surface-2)',
          border: `1px solid ${isUser ? 'transparent' : 'var(--border-subtle)'}`,
          boxShadow: isUser ? '0 2px 12px rgba(37,99,235,0.2)' : 'none',
        }}>
          <p style={{
            fontSize: '0.85rem',
            color: isUser ? '#fff' : 'var(--text-100)',
            lineHeight: 1.6, margin: 0,
          }}>
            {msg.content}
          </p>
        </div>

        {/* Sources */}
        {msg.sources?.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <p style={{ fontSize: '0.62rem', color: 'var(--text-500)', marginBottom: 3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              From transcript
            </p>
            {msg.sources.slice(0, 2).map((s, i) => <SourceCard key={i} source={s} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Bot size={13} color="#fff" />
      </div>
      <div style={{
        padding: '9px 14px',
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '4px 14px 14px 14px',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--text-400)',
            animation: `typing 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default function ChatBot({ meetingId, isOpen, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your meeting assistant. Ask me anything about what's been discussed so far.",
      sources: [],
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [isOpen])

  const handleSend = async () => {
    const q = input.trim()
    if (!q || loading || !meetingId) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)
    try {
      const res = await askChatbot(meetingId, q)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.answer,
        sources: res.sources || [],
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I couldn't process your question right now. Please try again.",
        sources: [],
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      right: 12, bottom: 96,
      width: 360, height: 528,
      display: 'flex', flexDirection: 'column',
      zIndex: 100,
      borderRadius: 16, overflow: 'hidden',
      background: 'rgba(10,14,26,0.97)',
      border: '1px solid var(--border-default)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(59,130,246,0.08)',
      animation: 'scaleIn 0.2s ease both',
      backdropFilter: 'blur(24px)',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 16px',
        background: 'rgba(17,24,39,0.8)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #2563eb, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
          }}>
            <Sparkles size={15} color="#fff" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-100)', fontFamily: 'Plus Jakarta Sans' }}>
              Meeting Assistant
            </p>
            <p style={{ fontSize: '0.67rem', color: '#4ade80', fontWeight: 500 }}>
              ● RAG-powered · Gemini
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-subtle)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-400)', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-100)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-400)' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
        {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
        background: 'rgba(17,24,39,0.6)',
        flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          className="input"
          placeholder={meetingId ? 'Ask about the meeting…' : 'Waiting for meeting to start…'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading || !meetingId}
          style={{
            flex: 1, padding: '10px 12px', fontSize: '0.85rem',
            borderRadius: 9, lineHeight: 1.4,
            background: 'var(--bg-surface-2)',
            border: '1.5px solid var(--border-default)',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading || !meetingId}
          style={{
            width: 38, height: 38, borderRadius: 9, border: 'none',
            background: input.trim() && !loading && meetingId ? 'var(--brand-blue)' : 'var(--bg-surface-2)',
            color: input.trim() && !loading && meetingId ? '#fff' : 'var(--text-500)',
            cursor: input.trim() && !loading && meetingId ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          {loading ? <Loader2 size={15} className="anim-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  )
}
