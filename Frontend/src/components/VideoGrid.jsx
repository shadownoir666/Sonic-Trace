import { useEffect, useRef } from 'react'
import { MicOff, VideoOff } from 'lucide-react'
import styles from './VideoGrid.module.css'

const SPEAKER_COLORS = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b',
  '#f43f5e', '#06b6d4', '#ec4899', '#84cc16',
]

function VideoTile({ stream, userName, muted, videoOff, isLocal = false, colorIdx = 0 }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  const color = SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]
  const initials = (userName || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className={styles.tile} style={{ '--speaker-color': color }}>
      {stream && !videoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={styles.video}
        />
      ) : (
        <div className={styles.avatar}>
          <div
            className={styles.avatarCircle}
            style={{
              background: `linear-gradient(135deg, ${color}22, ${color}11)`,
              border: `2px solid ${color}50`,
              color: color,
            }}
          >
            {initials}
          </div>
        </div>
      )}

      {/* Mute indicator top-left */}
      {muted && (
        <div className={styles.muteOverlay}>
          <MicOff size={13} />
        </div>
      )}

      {/* Bottom overlay */}
      <div className={styles.overlay}>
        <div className={styles.nameRow}>
          {/* Speaker color dot */}
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span className={styles.name}>
            {userName || 'Participant'}{isLocal ? ' (You)' : ''}
          </span>
        </div>
        <div className={styles.statusIcons}>
          {videoOff && <VideoOff size={13} />}
        </div>
      </div>

      {isLocal && <div className={styles.localBadge}>You</div>}
    </div>
  )
}

export default function VideoGrid({ localStream, peers, localUser, mutedStatus }) {
  const peerEntries = Object.entries(peers)
  const totalParticipants = peerEntries.length + 1

  const gridClass = [
    styles.grid,
    totalParticipants === 1 ? styles.grid1 :
    totalParticipants === 2 ? styles.grid2 :
    totalParticipants <= 4  ? styles.grid4 :
    styles.grid6
  ].join(' ')

  return (
    <div className={gridClass}>
      <VideoTile
        stream={localStream}
        userName={localUser?.name}
        muted={mutedStatus?.muted}
        videoOff={mutedStatus?.videoOff}
        isLocal={true}
        colorIdx={0}
      />
      {peerEntries.map(([socketId, peer], i) => (
        <VideoTile
          key={socketId}
          stream={peer.stream}
          userName={peer.userName}
          muted={peer.muted}
          videoOff={peer.videoOff}
          colorIdx={i + 1}
        />
      ))}
    </div>
  )
}
