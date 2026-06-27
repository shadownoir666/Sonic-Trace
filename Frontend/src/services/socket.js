import { io } from 'socket.io-client'

const NODE_URL = import.meta.env.VITE_NODE_URL || 'http://localhost:3001'

let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(NODE_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    })

    socket.on('connect', () => console.log('[socket] Connected:', socket.id))
    socket.on('disconnect', () => console.log('[socket] Disconnected'))
    socket.on('connect_error', (e) => console.error('[socket] Error:', e.message))
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
