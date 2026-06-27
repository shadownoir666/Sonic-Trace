import { useState, useEffect, useCallback } from 'react'
import {
  X, Loader2, CheckSquare, Clock, Lightbulb, FileText,
  Users, User, RefreshCw, Edit2, Check, ChevronRight, Sparkles,
} from 'lucide-react'
import { getMeetingSummary, getSpeakerSummary, getSpeakers, renameSpeaker } from '../services/api'

// ── Speaker color palette ──────────────────────────────────────────
const SPEAKER_COLORS = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b',
  '#f43f5e', '#06b6d4', '#ec4899', '#84cc16',
]
const speakerColorCache = {}
let colorIdx = 0
function getSpeakerColor(label) {
  if (!speakerColorCache[label]) speakerColorCache[label] = SPEAKER_COLORS[colorIdx++ % SPEAKER_COLORS.length]
  return speakerColorCache[label]
}

// ── Bullet list ────────────────────────────────────────────────────
function BulletList({ items, icon: Icon, color }) {
  if (!items?.length) return (
    <p style={{ fontSize: '0.83rem', color: 'var(--text-500)', fontStyle: 'italic' }}>Nothing recorded yet.</p>
  )
  return (
    <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
            background: `${color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
          }}>
            <Icon size={11} style={{ color }} />
          </div>
          <span style={{ fontSize: '0.87rem', color: 'var(--text-200)', lineHeight: 1.6 }}>{item}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Summary content renderer ────────────────────────────────────────
function SummaryContent({ summary, activeTab }) {
  if (!summary) return null
  return (
    <div style={{ animation: 'fadeUp 0.2s ease both' }}>
      {activeTab === 'overview' && (
        <div style={{
          background: 'rgba(59,130,246,0.04)',
          border: '1px solid rgba(59,130,246,0.1)',
          borderRadius: 12, padding: '16px 20px',
        }}>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.8, color: 'var(--text-100)' }}>
            {summary.overall_summary}
          </p>
        </div>
      )}
      {activeTab === 'keypoints' && (
        <BulletList items={summary.key_points} icon={Lightbulb} color="#60a5fa" />
      )}
      {activeTab === 'decisions' && (
        <BulletList items={summary.decisions} icon={CheckSquare} color="#4ade80" />
      )}
      {activeTab === 'tasks' && (
        <BulletList items={summary.pending_tasks} icon={Clock} color="#fbbf24" />
      )}
    </div>
  )
}

// ── Speaker pill ───────────────────────────────────────────────────
function SpeakerPill({ speaker, isSelected, onClick }) {
  const color = getSpeakerColor(speaker.speaker_label)
  const initials = (speaker.display_name || speaker.speaker_label)
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 12px',
        borderRadius: 8,
        border: `1px solid ${isSelected ? `${color}40` : 'var(--border-subtle)'}`,
        background: isSelected ? `${color}14` : 'rgba(255,255,255,0.02)',
        color: isSelected ? color : 'var(--text-400)',
        cursor: 'pointer', fontFamily: 'Plus Jakarta Sans',
        fontSize: '0.82rem', fontWeight: isSelected ? 700 : 500,
        transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: `${color}20`, border: `1.5px solid ${color}50`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.6rem', fontWeight: 800, color: color,
      }}>
        {initials}
      </div>
      {speaker.display_name || speaker.speaker_label}
    </button>
  )
}

// ── Rename row ─────────────────────────────────────────────────────
function RenameRow({ speaker, meetingId, onRenamed }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(speaker.display_name || speaker.speaker_label)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || name === speaker.speaker_label) { setEditing(false); return }
    setSaving(true)
    try {
      await renameSpeaker(meetingId, speaker.speaker_label, name.trim())
      onRenamed(speaker.speaker_label, name.trim())
    } catch { console.error('Rename failed') } finally { setSaving(false); setEditing(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {editing ? (
        <>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            autoFocus
            style={{
              background: 'var(--bg-surface-3)',
              border: '1.5px solid rgba(59,130,246,0.3)',
              borderRadius: 6, color: 'var(--text-100)',
              padding: '4px 10px', fontSize: '0.8rem',
              fontFamily: 'Plus Jakarta Sans', width: 140, outline: 'none',
            }}
          />
          <button onClick={handleSave} disabled={saving}
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(59,130,246,0.15)', cursor: 'pointer', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {saving ? <Loader2 size={12} className="anim-spin" /> : <Check size={12} />}
          </button>
          <button onClick={() => setEditing(false)}
            style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-400)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={12} />
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-subtle)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-400)', fontSize: '0.75rem', padding: '4px 9px', fontFamily: 'Plus Jakarta Sans', fontWeight: 500 }}>
          <Edit2 size={11} /> Rename
        </button>
      )}
    </div>
  )
}

// ── Tab bar ────────────────────────────────────────────────────────
const CONTENT_TABS = [
  { id: 'overview',  label: 'Overview',   icon: FileText,    color: '#60a5fa' },
  { id: 'keypoints', label: 'Key Points', icon: Lightbulb,   color: '#60a5fa' },
  { id: 'decisions', label: 'Decisions',  icon: CheckSquare, color: '#4ade80' },
  { id: 'tasks',     label: 'Tasks',      icon: Clock,       color: '#fbbf24' },
]

// ── Main Component ─────────────────────────────────────────────────
export default function SummaryModal({ meetingId, isOpen, onClose }) {
  const [mode, setMode] = useState('general')
  const [speakers, setSpeakers] = useState([])
  const [selectedSpeaker, setSelectedSpeaker] = useState(null)
  const [summaries, setSummaries] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (isOpen && meetingId && speakers.length === 0) {
      getSpeakers(meetingId)
        .then(data => {
          setSpeakers(data || [])
          if (data?.length > 0) setSelectedSpeaker(data[0].speaker_label)
        })
        .catch(console.error)
    }
  }, [isOpen, meetingId])

  const currentKey = mode === 'general' ? 'general' : `speaker:${selectedSpeaker}`
  const currentSummary = summaries[currentKey]

  const fetchSummary = useCallback(async (regenerate = false) => {
    if (!meetingId) return
    if (mode === 'speaker' && !selectedSpeaker) return
    setLoading(true); setError(null)
    try {
      const data = mode === 'general'
        ? await getMeetingSummary(meetingId, regenerate)
        : await getSpeakerSummary(meetingId, selectedSpeaker, regenerate)
      setSummaries(prev => ({ ...prev, [currentKey]: data }))
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate summary.')
    } finally { setLoading(false) }
  }, [meetingId, mode, selectedSpeaker, currentKey])

  useEffect(() => {
    if (isOpen && !currentSummary && !loading) fetchSummary(false)
  }, [mode, selectedSpeaker, isOpen, fetchSummary])

  const handleSpeakerRenamed = (oldLabel, newName) => {
    setSpeakers(prev => prev.map(s => s.speaker_label === oldLabel ? { ...s, display_name: newName } : s))
  }

  if (!isOpen) return null

  const activeSpeaker = speakers.find(s => s.speaker_label === selectedSpeaker)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.2s ease both',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 700,
        background: '#0e1623',
        border: '1px solid var(--border-default)',
        borderRadius: 20,
        boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '88vh', overflow: 'hidden',
        animation: 'scaleIn 0.2s ease both',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
          background: 'rgba(17,24,39,0.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'linear-gradient(135deg, #2563eb, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
            }}>
              <Sparkles size={16} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-100)', marginBottom: 2, fontFamily: 'Plus Jakarta Sans' }}>
                Meeting Summary
              </h2>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-500)' }}>
                AI-generated · Powered by Gemini
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {currentSummary && (
              <button
                onClick={() => fetchSummary(true)}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid var(--border-default)',
                  background: 'rgba(255,255,255,0.04)',
                  color: 'var(--text-300)', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 600,
                  fontFamily: 'Plus Jakarta Sans',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              >
                {loading ? <Loader2 size={12} className="anim-spin" /> : <RefreshCw size={12} />}
                Regenerate
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-subtle)',
                background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-400)', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--text-100)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-400)' }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Mode switcher ── */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0, padding: '0 24px',
        }}>
          {[
            { key: 'general', label: 'General', icon: Users },
            { key: 'speaker', label: 'By Speaker', icon: User },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setActiveTab('overview') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '12px 16px',
                border: 'none', background: 'transparent',
                borderBottom: `2px solid ${mode === key ? 'var(--brand-blue-lt)' : 'transparent'}`,
                color: mode === key ? '#60a5fa' : 'var(--text-400)',
                cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600,
                fontFamily: 'Plus Jakarta Sans', transition: 'all 0.15s',
              }}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        {/* ── Speaker selector ── */}
        {mode === 'speaker' && speakers.length > 0 && (
          <div style={{
            padding: '12px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            flexShrink: 0,
          }}>
            {speakers.map(sp => (
              <SpeakerPill
                key={sp.speaker_label}
                speaker={sp}
                isSelected={selectedSpeaker === sp.speaker_label}
                onClick={() => { setSelectedSpeaker(sp.speaker_label); setActiveTab('overview') }}
              />
            ))}
          </div>
        )}

        {/* ── Rename row ── */}
        {mode === 'speaker' && selectedSpeaker && (
          <div style={{
            padding: '8px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 10,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-500)' }}>Rename speaker:</span>
            {speakers.filter(s => s.speaker_label === selectedSpeaker).map(sp => (
              <RenameRow key={sp.speaker_label} speaker={sp} meetingId={meetingId} onRenamed={handleSpeakerRenamed} />
            ))}
          </div>
        )}

        {/* ── Content tabs ── */}
        {currentSummary && (
          <div style={{
            display: 'flex', gap: 4, padding: '12px 24px 0',
            flexShrink: 0,
          }}>
            {CONTENT_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 7,
                  border: 'none', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 600, fontFamily: 'Plus Jakarta Sans',
                  background: activeTab === tab.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                  color: activeTab === tab.id ? '#60a5fa' : 'var(--text-400)',
                  transition: 'all 0.15s',
                }}
              >
                <tab.icon size={12} /> {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Main content ── */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, minHeight: 240 }}>

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{
                width: 44, height: 44, margin: '0 auto 16px',
                border: '3px solid var(--border-subtle)',
                borderTopColor: '#3b82f6',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ color: 'var(--text-300)', fontSize: '0.88rem', fontWeight: 500, marginBottom: 4 }}>
                {mode === 'speaker'
                  ? `Analyzing ${activeSpeaker?.display_name || selectedSpeaker}'s contributions…`
                  : 'Analyzing meeting transcript…'
                }
              </p>
              <p style={{ color: 'var(--text-500)', fontSize: '0.76rem' }}>This may take 10–20 seconds</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 10, padding: '14px 18px',
              color: '#f87171', fontSize: '0.86rem',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span>⚠</span>
              <span style={{ flex: 1 }}>{error}</span>
              <button
                onClick={() => fetchSummary(false)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#f87171', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans', fontSize: '0.78rem', fontWeight: 600 }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && !currentSummary && (
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: mode === 'speaker' ? 'rgba(139,92,246,0.08)' : 'rgba(59,130,246,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                {mode === 'speaker'
                  ? <User size={24} style={{ color: '#a78bfa' }} />
                  : <Users size={24} style={{ color: '#60a5fa' }} />
                }
              </div>
              <p style={{ color: 'var(--text-300)', fontSize: '0.88rem', fontWeight: 500, marginBottom: 18 }}>
                {mode === 'speaker'
                  ? `Generate a focused summary of ${activeSpeaker?.display_name || selectedSpeaker}'s contributions`
                  : 'Generate an AI summary of everything discussed in this meeting'
                }
              </p>
              <button className="btn btn-primary" onClick={() => fetchSummary(false)}
                style={{ padding: '10px 22px', borderRadius: 9, fontSize: '0.88rem' }}>
                <Sparkles size={14} /> Generate Summary
              </button>
            </div>
          )}

          {/* Summary content */}
          {!loading && !error && currentSummary && (
            <SummaryContent summary={currentSummary} activeTab={activeTab} />
          )}
        </div>

        {/* ── Footer speaker nav ── */}
        {mode === 'speaker' && speakers.length > 1 && currentSummary && (
          <div style={{
            padding: '10px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0, background: 'rgba(0,0,0,0.15)',
          }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-500)', fontWeight: 600 }}>
              {speakers.findIndex(s => s.speaker_label === selectedSpeaker) + 1} / {speakers.length} speakers
            </span>
            <div style={{ display: 'flex', gap: 5 }}>
              {speakers.map((sp) => {
                const color = getSpeakerColor(sp.speaker_label)
                const initials = (sp.display_name || sp.speaker_label).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                const sel = selectedSpeaker === sp.speaker_label
                return (
                  <button
                    key={sp.speaker_label}
                    onClick={() => { setSelectedSpeaker(sp.speaker_label); setActiveTab('overview') }}
                    title={sp.display_name || sp.speaker_label}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${sel ? color : 'transparent'}`,
                      background: sel ? `${color}20` : 'rgba(255,255,255,0.05)',
                      cursor: 'pointer', fontSize: '0.62rem', fontWeight: 800, color: sel ? color : 'var(--text-500)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {initials}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
