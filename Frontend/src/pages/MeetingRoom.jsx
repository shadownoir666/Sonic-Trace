import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Copy, Check, Mic2 } from 'lucide-react'

import VideoGrid from '../components/VideoGrid'
import TranscriptPanel from '../components/TranscriptPanel'
import ControlBar from '../components/ControlBar'
import ChatBot from '../components/ChatBot'
import SummaryModal from '../components/SummaryModal'
import useWebRTC from '../hooks/useWebRTC'
import useAudioCapture from '../hooks/useAudioCapture'
import { getRoom } from '../services/api'
import { getSocket, disconnectSocket } from '../services/socket'

export default function MeetingRoom() {
  const { roomCode } = useParams()
  const navigate = useNavigate()

  const userName = sessionStorage.getItem('userName') || 'Guest'
  const userId   = sessionStorage.getItem('userId')   || `user_${Date.now()}`

  const [meeting, setMeeting]         = useState(null)
  const [localStream, setLocalStream] = useState(null)
  const [muted, setMuted]             = useState(false)
  const [videoOff, setVideoOff]       = useState(false)
  const [segments, setSegments]       = useState([])
  const [chatOpen, setChatOpen]       = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [copied, setCopied]           = useState(false)
  const [mediaError, setMediaError]   = useState(null)
  const hasLeft = useRef(false)

  // Get meeting info
  useEffect(() => {
    getRoom(roomCode)
      .then(setMeeting)
      .catch(() => navigate('/'))
  }, [roomCode])

  // Get local media
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => setLocalStream(stream))
      .catch(err => {
        console.warn('[media] Camera/mic failed:', err)
        setMediaError('Camera or microphone not available. Joining in audio-only mode.')
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => setLocalStream(stream))
          .catch(() => setLocalStream(null))
      })
    return () => { if (localStream) localStream.getTracks().forEach(t => t.stop()) }
  }, [])

  // Socket transcript
  useEffect(() => {
    const socket = getSocket()
    socket.on('transcript-update', ({ segments: newSegs }) => {
      if (newSegs?.length > 0) setSegments(prev => [...prev, ...newSegs])
    })
    return () => socket.off('transcript-update')
  }, [])

  const { peers } = useWebRTC(roomCode, userId, userName, localStream)

  const handleNewSegments = useCallback((newSegs) => {
    setSegments(prev => [...prev, ...newSegs])
    const socket = getSocket()
    socket.emit('broadcast-transcript', {
      roomCode, segments: newSegs,
      meetingId: meeting?.meeting_id || meeting?.id,
    })
  }, [roomCode, meeting])

  const meetingId = meeting?.meeting_id || meeting?.id
  const { isCapturing, isProcessing, startCapture, stopCapture } = useAudioCapture(
    meetingId, roomCode, localStream, handleNewSegments
  )

  useEffect(() => {
    if (localStream && meetingId && !isCapturing) startCapture()
  }, [localStream, meetingId])

  const toggleMute = () => {
    if (!localStream) return
    const track = localStream.getAudioTracks()[0]
    if (track) {
      track.enabled = muted
      setMuted(!muted)
      getSocket().emit('mute-status', { roomCode, muted: !muted, videoOff })
    }
  }

  const toggleVideo = () => {
    if (!localStream) return
    const track = localStream.getVideoTracks()[0]
    if (track) {
      track.enabled = videoOff
      setVideoOff(!videoOff)
      getSocket().emit('mute-status', { roomCode, muted, videoOff: !videoOff })
    }
  }

  const handleLeave = () => {
    hasLeft.current = true
    stopCapture()
    localStream?.getTracks().forEach(t => t.stop())
    disconnectSocket()
    setSummaryOpen(true)
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const participantCount = Object.keys(peers).length + 1

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      background: '#080d18', overflow: 'hidden',
    }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 52,
        background: 'rgba(5,9,18,0.95)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0, zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mic2 size={13} color="#fff" />
          </div>
          <span style={{
            fontFamily: 'Plus Jakarta Sans', fontWeight: 800,
            fontSize: '1rem', letterSpacing: '-0.02em',
          }} className="gradient-text-brand">
            SonicTrace
          </span>
          {meeting?.title && (
            <>
              <span style={{ color: 'var(--border-strong)', fontSize: '1rem' }}>·</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-400)', fontWeight: 500 }}>
                {meeting.title}
              </span>
            </>
          )}
        </div>

        {/* Room code badge */}
        <button
          onClick={handleCopyCode}
          title="Click to copy room code"
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-default)',
            borderRadius: 8, padding: '5px 12px',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: '0.85rem',
            color: 'var(--text-200)', letterSpacing: '0.15em', fontWeight: 500,
          }}>
            {roomCode}
          </span>
          {copied
            ? <Check size={13} style={{ color: '#4ade80' }} />
            : <Copy size={13} style={{ color: 'var(--text-500)' }} />
          }
          <span style={{ fontSize: '0.7rem', color: 'var(--text-500)' }}>
            {copied ? 'Copied!' : 'Copy'}
          </span>
        </button>
      </div>

      {/* Media error banner */}
      {mediaError && (
        <div style={{
          padding: '8px 20px',
          background: 'rgba(245,158,11,0.08)',
          borderBottom: '1px solid rgba(245,158,11,0.15)',
          color: '#fbbf24', fontSize: '0.78rem', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
        }}>
          <span>⚠</span> {mediaError}
        </div>
      )}

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', paddingBottom: 84 }}>

        {/* Video grid */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#060c16' }}>
          <VideoGrid
            localStream={localStream}
            peers={peers}
            localUser={{ name: userName }}
            mutedStatus={{ muted, videoOff }}
          />
        </div>

        {/* Transcript sidebar */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <TranscriptPanel segments={segments} isProcessing={isProcessing} />
        </div>
      </div>

      {/* Control bar */}
      <ControlBar
        muted={muted}
        videoOff={videoOff}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onLeave={handleLeave}
        onOpenChat={() => setChatOpen(o => !o)}
        onOpenSummary={() => setSummaryOpen(true)}
        chatOpen={chatOpen}
        isCapturing={isCapturing}
        isProcessing={isProcessing}
        participantCount={participantCount}
        roomCode={roomCode}
      />

      {/* Chatbot */}
      <ChatBot
        meetingId={meetingId}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      {/* Summary Modal */}
      <SummaryModal
        meetingId={meetingId}
        isOpen={summaryOpen}
        onClose={() => {
          setSummaryOpen(false)
          if (hasLeft.current) navigate('/')
        }}
      />
    </div>
  )
}
