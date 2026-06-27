import { Mic, MicOff, Video, VideoOff, PhoneOff, MessageSquare, FileText, Users, MoreHorizontal } from 'lucide-react'

function CtrlBtn({ id, icon: Icon, label, onClick, danger = false, active = false, isLeave = false, disabled = false }) {
  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={[
        'ctrl-btn',
        danger   ? 'danger' : '',
        active   ? 'active' : '',
        isLeave  ? 'leave'  : '',
      ].filter(Boolean).join(' ')}
    >
      <Icon size={20} strokeWidth={isLeave ? 2.5 : 2} />
      <span className="ctrl-btn-label">{label}</span>
    </button>
  )
}

export default function ControlBar({
  muted, videoOff,
  onToggleMute, onToggleVideo,
  onLeave, onOpenChat, onOpenSummary,
  chatOpen, isCapturing, isProcessing,
  participantCount, roomCode,
}) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0, left: 0, right: 0,
      height: 84,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingInline: 24,
      background: 'rgba(8,13,24,0.96)',
      backdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border-subtle)',
      zIndex: 50,
    }}>

      {/* ── Left: Meeting info ───────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 200 }}>
        {/* Time + live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="live-dot" />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-red)', letterSpacing: '0.05em' }}>LIVE</span>
        </div>

        {/* Room code */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 7, padding: '5px 10px',
        }}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.82rem', color: 'var(--text-200)', letterSpacing: '0.12em', fontWeight: 500 }}>
            {roomCode}
          </span>
        </div>

        {/* Participant count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-400)', fontSize: '0.8rem' }}>
          <Users size={13} strokeWidth={2} />
          <span style={{ fontWeight: 600 }}>{participantCount}</span>
        </div>

        {/* Processing indicator */}
        {isProcessing && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: '0.72rem', color: '#fbbf24',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 6, padding: '3px 8px',
          }}>
            <div className="spinner" style={{ width: 10, height: 10, borderTopColor: '#fbbf24' }} />
            AI Processing
          </div>
        )}
      </div>

      {/* ── Center: Media controls ───────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CtrlBtn
          id="btn-toggle-mute"
          icon={muted ? MicOff : Mic}
          label={muted ? 'Unmute' : 'Mute'}
          onClick={onToggleMute}
          danger={muted}
        />

        <CtrlBtn
          id="btn-toggle-video"
          icon={videoOff ? VideoOff : Video}
          label={videoOff ? 'Start video' : 'Stop video'}
          onClick={onToggleVideo}
          danger={videoOff}
        />

        {/* Spacer */}
        <div style={{ width: 1, height: 36, background: 'var(--border-subtle)', margin: '0 4px' }} />

        <CtrlBtn
          id="btn-leave"
          icon={PhoneOff}
          label="End call"
          onClick={onLeave}
          isLeave={true}
        />
      </div>

      {/* ── Right: AI features ──────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200, justifyContent: 'flex-end' }}>
        <button
          id="btn-open-summary"
          onClick={onOpenSummary}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            borderRadius: 8, border: '1px solid var(--border-default)',
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-200)',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
            fontFamily: 'Plus Jakarta Sans',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--border-default)' }}
        >
          <FileText size={14} strokeWidth={2} />
          Summary
        </button>

        <button
          id="btn-open-chat"
          onClick={onOpenChat}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            borderRadius: 8, border: `1px solid ${chatOpen ? 'rgba(59,130,246,0.35)' : 'var(--border-default)'}`,
            background: chatOpen ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)',
            color: chatOpen ? '#60a5fa' : 'var(--text-200)',
            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
            fontFamily: 'Plus Jakarta Sans',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            if (!chatOpen) { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }
          }}
          onMouseLeave={e => {
            if (!chatOpen) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'var(--border-default)' }
          }}
        >
          <MessageSquare size={14} strokeWidth={2} />
          Ask AI
          {chatOpen && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', marginLeft: 2 }} />}
        </button>
      </div>
    </div>
  )
}
