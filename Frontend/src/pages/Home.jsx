import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic2, Users, ArrowRight, Plus, LogIn, Sparkles, Activity, Shield, Brain } from 'lucide-react'
import { createRoom, getRoom } from '../services/api'

const features = [
  {
    icon: Activity,
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    title: 'Live Diarization',
    desc: 'AI automatically identifies and labels each speaker in real-time with speaker embeddings.',
  },
  {
    icon: Brain,
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.08)',
    title: 'RAG Chatbot',
    desc: 'Ask anything about your meeting. Answers are grounded in your transcript context.',
  },
  {
    icon: Sparkles,
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.08)',
    title: 'Smart Summary',
    desc: 'Structured AI summaries: key points, decisions, and action items per speaker.',
  },
  {
    icon: Shield,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    title: 'Emotion Analysis',
    desc: 'Understand sentiment and emotional tone throughout your meeting in real-time.',
  },
]

export default function Home() {
  const navigate = useNavigate()
  const [userName, setUserName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [title, setTitle] = useState('')
  const [tab, setTab] = useState('create')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!userName.trim()) return setError('Please enter your display name')
    setLoading(true); setError('')
    try {
      const room = await createRoom(title || 'New Meeting')
      sessionStorage.setItem('userName', userName.trim())
      sessionStorage.setItem('userId', `user_${Date.now()}`)
      navigate(`/room/${room.roomCode}`)
    } catch {
      setError('Failed to create meeting. Is the server running?')
    } finally { setLoading(false) }
  }

  const handleJoin = async () => {
    if (!userName.trim()) return setError('Please enter your display name')
    if (!joinCode.trim()) return setError('Please enter a room code')
    setLoading(true); setError('')
    try {
      await getRoom(joinCode.trim().toUpperCase())
      sessionStorage.setItem('userName', userName.trim())
      sessionStorage.setItem('userId', `user_${Date.now()}`)
      navigate(`/room/${joinCode.trim().toUpperCase()}`)
    } catch {
      setError('Room not found. Check the room code and try again.')
    } finally { setLoading(false) }
  }

  const onKey = (e) => {
    if (e.key === 'Enter') tab === 'create' ? handleCreate() : handleJoin()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>

      {/* Background decorations */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        {/* Radial glow top-left */}
        <div style={{
          position: 'absolute', top: '-20%', left: '-10%',
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 65%)',
        }} />
        {/* Radial glow bottom-right */}
        <div style={{
          position: 'absolute', bottom: '-20%', right: '-10%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 65%)',
        }} />
        {/* Subtle grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `
            linear-gradient(rgba(59,130,246,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.025) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }} />
      </div>

      {/* Navigation Bar */}
      <nav style={{
        position: 'relative', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 48px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
          }}>
            <Mic2 size={17} color="#fff" />
          </div>
          <span style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em' }}
            className="gradient-text">
            SonicTrace
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-400)', padding: '4px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 20, border: '1px solid var(--border-subtle)' }}>
            Powered by Gemini · Whisper · ChromaDB
          </span>
        </div>
      </nav>

      {/* Main content */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '60px 24px 48px',
        position: 'relative', zIndex: 1,
      }}>

        {/* Hero badge */}
        <div className="anim-fade-up" style={{ animationDelay: '0ms' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 100, padding: '5px 14px',
            marginBottom: 28,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulseRed 1.4s ease infinite' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#60a5fa', letterSpacing: '0.02em' }}>
              AI-Powered Meeting Intelligence
            </span>
          </div>
        </div>

        {/* Headline */}
        <div className="anim-fade-up" style={{ animationDelay: '60ms', textAlign: 'center', maxWidth: 680, marginBottom: 16 }}>
          <h1 style={{ lineHeight: 1.08, marginBottom: 0 }}>
            <span style={{ color: 'var(--text-100)' }}>Meetings that </span>
            <span className="gradient-text">understand you</span>
          </h1>
        </div>

        <div className="anim-fade-up" style={{ animationDelay: '100ms', textAlign: 'center', maxWidth: 540, marginBottom: 52 }}>
          <p style={{ fontSize: '1.08rem', color: 'var(--text-300)', lineHeight: 1.75 }}>
            Real-time video calls with AI speaker diarization, live transcripts,
            intelligent summaries, and a meeting Q&amp;A chatbot.
          </p>
        </div>

        {/* Card */}
        <div className="anim-scale-in" style={{ animationDelay: '140ms', width: '100%', maxWidth: 460 }}>
          <div style={{
            background: 'rgba(17,24,39,0.85)',
            border: '1px solid var(--border-default)',
            borderRadius: 20,
            padding: '32px 32px 28px',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
          }}>

            {/* Tab switcher */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              background: 'var(--bg-surface-2)',
              borderRadius: 10, padding: 4, marginBottom: 28,
            }}>
              {[
                { key: 'create', label: 'New Meeting', icon: Plus },
                { key: 'join',   label: 'Join Meeting', icon: LogIn },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setTab(key); setError('') }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '9px 12px',
                    borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontFamily: 'Plus Jakarta Sans', fontWeight: 600, fontSize: '0.85rem',
                    transition: 'all 0.15s',
                    background: tab === key ? 'var(--bg-surface-3)' : 'transparent',
                    color: tab === key ? 'var(--text-100)' : 'var(--text-400)',
                    boxShadow: tab === key ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            {/* Form fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-300)', display: 'block', marginBottom: 7, letterSpacing: '0.01em' }}>
                  Your display name
                </label>
                <input
                  id="input-username"
                  className="input"
                  placeholder="e.g. Alex Johnson"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  onKeyDown={onKey}
                  autoComplete="name"
                />
              </div>

              {tab === 'create' ? (
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-300)', display: 'block', marginBottom: 7 }}>
                    Meeting title <span style={{ color: 'var(--text-500)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    id="input-title"
                    className="input"
                    placeholder="e.g. Weekly Sprint Planning"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={onKey}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-300)', display: 'block', marginBottom: 7 }}>
                    Room code
                  </label>
                  <input
                    id="input-joincode"
                    className="input mono"
                    placeholder="e.g. ABC123"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={onKey}
                    style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '1.1rem', textAlign: 'center' }}
                  />
                </div>
              )}

              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.07)',
                  border: '1px solid rgba(239,68,68,0.18)',
                  borderRadius: 8, padding: '10px 14px',
                  color: '#f87171', fontSize: '0.83rem', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                id={tab === 'create' ? 'btn-create-meeting' : 'btn-join-meeting'}
                className="btn btn-primary btn-lg"
                onClick={tab === 'create' ? handleCreate : handleJoin}
                disabled={loading}
                style={{ marginTop: 4, width: '100%', padding: '14px', fontSize: '0.95rem', borderRadius: 10 }}
              >
                {loading ? (
                  <><div className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff' }} />
                    {tab === 'create' ? 'Creating room…' : 'Joining…'}</>
                ) : (
                  <>{tab === 'create' ? 'Start Meeting' : 'Join Meeting'}<ArrowRight size={16} /></>
                )}
              </button>
            </div>

            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-500)', marginTop: 20 }}>
              No account required · Works in your browser
            </p>
          </div>
        </div>

        {/* Features grid */}
        <div className="anim-fade-up" style={{ animationDelay: '200ms', width: '100%', maxWidth: 900, marginTop: 72 }}>
          <p style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-400)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 28 }}>
            What makes SonicTrace different
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(196px, 1fr))',
            gap: 14,
          }}>
            {features.map((f, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(17,24,39,0.6)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 14,
                  padding: '20px',
                  transition: 'all 0.2s',
                  cursor: 'default',
                  animationDelay: `${200 + i * 40}ms`,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = `${f.color}35`
                  e.currentTarget.style.background = `rgba(17,24,39,0.9)`
                  e.currentTarget.style.transform = 'translateY(-3px)'
                  e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)`
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)'
                  e.currentTarget.style.background = 'rgba(17,24,39,0.6)'
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: f.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}>
                  <f.icon size={18} style={{ color: f.color }} />
                </div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 6, color: 'var(--text-100)' }}>{f.title}</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-400)', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px 48px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.73rem', color: 'var(--text-500)',
        gap: 16,
      }}>
        <span>© 2025 SonicTrace</span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-500)' }} />
        <span>Powered by Whisper · Resemblyzer · ChromaDB · Gemini</span>
      </footer>
    </div>
  )
}
