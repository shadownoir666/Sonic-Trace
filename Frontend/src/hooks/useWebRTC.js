import { useRef, useEffect, useCallback, useState } from 'react'
import { getSocket } from '../services/socket'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

/**
 * Manages WebRTC mesh connections for a meeting room.
 *
 * @param {string} roomCode
 * @param {string} userId
 * @param {string} userName
 * @param {MediaStream|null} localStream
 * @returns {{ peers, removePeer }}
 */
export default function useWebRTC(roomCode, userId, userName, localStream) {
  // { socketId -> { pc: RTCPeerConnection, stream: MediaStream, userId, userName } }
  const [peers, setPeers] = useState({})
  const peersRef = useRef({})
  const localStreamRef = useRef(localStream)

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  const addTracksToPC = useCallback((pc) => {
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream))
    }
  }, [])

  const createPC = useCallback((remoteSocketId, remoteUserId, remoteUserName) => {
    const socket = getSocket()
    const pc = new RTCPeerConnection(ICE_SERVERS)

    addTracksToPC(pc)

    // Remote stream
    const remoteStream = new MediaStream()
    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach(t => remoteStream.addTrack(t))
      setPeers(prev => ({
        ...prev,
        [remoteSocketId]: { ...prev[remoteSocketId], stream: remoteStream },
      }))
    }

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('ice-candidate', { target: remoteSocketId, candidate: e.candidate })
      }
    }

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        removePeer(remoteSocketId)
      }
    }

    peersRef.current[remoteSocketId] = {
      pc,
      stream: remoteStream,
      userId: remoteUserId,
      userName: remoteUserName,
    }

    setPeers(prev => ({
      ...prev,
      [remoteSocketId]: {
        pc,
        stream: remoteStream,
        userId: remoteUserId,
        userName: remoteUserName,
        muted: false,
        videoOff: false,
      },
    }))

    return pc
  }, [addTracksToPC])

  const removePeer = useCallback((socketId) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].pc.close()
      delete peersRef.current[socketId]
      setPeers(prev => {
        const next = { ...prev }
        delete next[socketId]
        return next
      })
    }
  }, [])

  useEffect(() => {
    if (!roomCode || !userId || !localStream) return

    const socket = getSocket()

    // Join the room
    socket.emit('join-room', { roomCode, userId, userName })

    // Existing peers in room → we initiate offer to each
    socket.on('room-joined', async ({ peers: existingPeers, meetingId }) => {
      for (const peer of existingPeers) {
        const pc = createPC(peer.socketId, peer.userId, peer.userName)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('offer', { target: peer.socketId, sdp: offer })
      }
    })

    // New peer joined → they will offer to us, just wait
    socket.on('peer-joined', ({ userId: uid, userName: uname, socketId }) => {
      // Create PC entry so it's ready for the incoming offer
      if (!peersRef.current[socketId]) {
        createPC(socketId, uid, uname)
      }
    })

    // Received offer
    socket.on('offer', async ({ from, fromUserId, fromUserName, sdp }) => {
      let entry = peersRef.current[from]
      if (!entry) {
        createPC(from, fromUserId, fromUserName)
        entry = peersRef.current[from]
      }
      const pc = entry.pc
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('answer', { target: from, sdp: answer })
    })

    // Received answer
    socket.on('answer', async ({ from, sdp }) => {
      const entry = peersRef.current[from]
      if (entry) {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp))
      }
    })

    // ICE candidate
    socket.on('ice-candidate', async ({ from, candidate }) => {
      const entry = peersRef.current[from]
      if (entry && candidate) {
        try {
          await entry.pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.warn('[webrtc] ICE candidate error:', e)
        }
      }
    })

    // Peer left
    socket.on('peer-left', ({ socketId }) => removePeer(socketId))

    // Peer mute status
    socket.on('peer-mute', ({ socketId, muted, videoOff }) => {
      setPeers(prev => prev[socketId]
        ? { ...prev, [socketId]: { ...prev[socketId], muted, videoOff } }
        : prev
      )
    })

    return () => {
      socket.emit('leave-room', { roomCode })
      socket.off('room-joined')
      socket.off('peer-joined')
      socket.off('offer')
      socket.off('answer')
      socket.off('ice-candidate')
      socket.off('peer-left')
      socket.off('peer-mute')

      Object.keys(peersRef.current).forEach(removePeer)
    }
  }, [roomCode, userId, localStream]) // eslint-disable-line

  return { peers, removePeer }
}
