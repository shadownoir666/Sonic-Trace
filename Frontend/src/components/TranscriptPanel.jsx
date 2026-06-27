import { useRef, useEffect } from 'react'
import { Mic, Activity, FileText } from 'lucide-react'

const SPEAKER_COLORS = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b',
  '#f43f5e', '#06b6d4', '#ec4899', '#84cc16',
]

const speakerColorMap = {}
let colorIdx = 0

function getSpeakerColor(speaker) {
  if (!speakerColorMap[speaker]) {
    speakerColorMap[speaker] = SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]
    colorIdx++
  }
  return speakerColorMap[speaker]
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const EMOTION_META = {
  happy:     { emoji: '😊', color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
  sad:       { emoji: '😔', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)' },
  angry:     { emoji: '😠', color: '#f43f5e', bg: 'rgba(244,63,94,0.08)' },
  fear:      { emoji: '😨', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  disgust:   { emoji: '😒', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  surprise:  { emoji: '😲', color: '#06b6d4', bg: 'rgba(6,182,212,0.08)' },
  neutral:   { emoji: '😐', color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' },
}

function EmotionPill({ emotion }) {
  const meta = EMOTION_META[emotion?.toLowerCase()] || { emoji: '●', color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '1px 7px',
      background: meta.bg,
      border: `1px solid ${meta.color}30`,
      borderRadius: 100,
      fontSize: '0.67rem', fontWeight: 600, color: meta.color,
      textTransform: 'capitalize',
    }}>
      {meta.emoji} {emotion}
    </span>
  )
}

function TranscriptSegment({ segment, isNew }) {
  const color = getSpeakerColor(segment.speaker)
  const initials = segment.speaker.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 10,
      background: isNew ? 'rgba(59,130,246,0.04)' : 'transparent',
      border: `1px solid ${isNew ? 'rgba(59,130,246,0.08)' : 'transparent'}`,
      transition: 'background 0.3s, border-color 0.3s',
      animation: isNew ? 'fadeUp 0.35s ease both' : 'none',
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: `${color}18`, border: `1.5px solid ${color}50`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.6rem', fontWeight: 800, color: color,
        marginTop: 1,
      }}>
        {initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: color, letterSpacing: '-0.01em' }}>
            {segment.speaker}
          </span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.65rem', color: 'var(--text-500)' }}>
            {formatTime(segment.start)}
          </span>
          {segment.emotion && segment.emotion !== 'unknown' && (
            <EmotionPill emotion={segment.emotion} />
          )}
        </div>

        {/* Text */}
        <p style={{
          fontSize: '0.85rem', color: 'var(--text-200)', lineHeight: 1.6,
          wordBreak: 'break-word',
        }}>
          {segment.text}
        </p>
      </div>
    </div>
  )
}

export default function TranscriptPanel({ segments, isProcessing }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border-subtle)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'rgba(59,130,246,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={14} style={{ color: '#60a5fa' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-100)', fontFamily: 'Plus Jakarta Sans' }}>
            Live Transcript
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isProcessing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#fbbf24' }}>
              <div className="spinner" style={{ width: 11, height: 11, borderTopColor: '#fbbf24' }} />
              Processing
            </div>
          )}
          {segments.length > 0 && (
            <span className="badge badge-blue">{segments.length}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '8px 6px',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {segments.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '32px 24px', gap: 12, textAlign: 'center',
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'rgba(59,130,246,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mic size={22} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-300)', marginBottom: 4 }}>
                Waiting for speech
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-500)', lineHeight: 1.5 }}>
                Transcript appears as speakers talk.<br />
                Audio is processed every 15 seconds.
              </p>
            </div>
          </div>
        ) : (
          segments.map((seg, i) => (
            <TranscriptSegment
              key={`${seg.speaker}-${seg.start}-${i}`}
              segment={seg}
              isNew={i >= segments.length - 5}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
