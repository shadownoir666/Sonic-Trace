// import axios from 'axios'

// const NODE_URL = import.meta.env.VITE_NODE_URL || 'http://localhost:3001'

// const api = axios.create({ baseURL: NODE_URL })

// export const createRoom = (title = 'New Meeting') =>
//   api.post('/rooms/create', { title }).then(r => r.data)

// export const getRoom = (code) =>
//   api.get(`/rooms/${code}`).then(r => r.data)

// export const endRoom = (code) =>
//   api.post(`/rooms/${code}/end`).then(r => r.data)

// export const sendAudioChunk = (meetingId, audioBlob, chunkIndex, roomCode) => {
//   const form = new FormData()
//   const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('mp4') ? 'mp4' : 'webm'
//   form.append('file', audioBlob, `chunk.${ext}`)
//   form.append('chunk_index', String(chunkIndex))
//   return api.post(
//     `/proxy/meeting/${meetingId}/chunk?room_code=${roomCode}`,
//     form,
//     { timeout: 120000 }
//   ).then(r => r.data)
// }

// export const getMeetingSummary = (meetingId, regenerate = false) =>
//   api.get(`/proxy/meeting/${meetingId}/summary?regenerate=${regenerate}`).then(r => r.data)

// export const askChatbot = (meetingId, question) =>
//   api.post(`/proxy/meeting/${meetingId}/chat`, { question }).then(r => r.data)

import axios from 'axios'

const NODE_URL = import.meta.env.VITE_NODE_URL || 'http://localhost:3001'

const api = axios.create({ baseURL: NODE_URL })

export const createRoom = (title = 'New Meeting') =>
  api.post('/rooms/create', { title }).then(r => r.data)

export const getRoom = (code) =>
  api.get(`/rooms/${code}`).then(r => r.data)

export const endRoom = (code) =>
  api.post(`/rooms/${code}/end`).then(r => r.data)

export const sendAudioChunk = (meetingId, audioBlob, chunkIndex, roomCode) => {
  const form = new FormData()
  const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('mp4') ? 'mp4' : 'webm'
  form.append('file', audioBlob, `chunk.${ext}`)
  form.append('chunk_index', String(chunkIndex))
  return api.post(
    `/proxy/meeting/${meetingId}/chunk?room_code=${roomCode}`,
    form,
    { timeout: 120000 }
  ).then(r => r.data)
}

// ── Summary ──────────────────────────────────────────────────────────────────

/** General summary covering all speakers */
export const getMeetingSummary = (meetingId, regenerate = false) =>
  api.get(`/proxy/meeting/${meetingId}/summary?regenerate=${regenerate}`).then(r => r.data)

/** Per-speaker summary */
export const getSpeakerSummary = (meetingId, speakerLabel, regenerate = false) =>
  api.get(`/proxy/meeting/${meetingId}/summary/speaker/${encodeURIComponent(speakerLabel)}?regenerate=${regenerate}`)
    .then(r => r.data)

/** All summaries (general + per speaker) in one call */
export const getAllSummaries = (meetingId, regenerate = false) =>
  api.get(`/proxy/meeting/${meetingId}/summary/all?regenerate=${regenerate}`).then(r => r.data)

// ── Speakers ─────────────────────────────────────────────────────────────────

/** List all identified speakers */
export const getSpeakers = (meetingId) =>
  api.get(`/proxy/meeting/${meetingId}/speakers`).then(r => r.data)

/** Rename a speaker */
export const renameSpeaker = (meetingId, speakerLabel, displayName) =>
  api.post(`/proxy/meeting/${meetingId}/speakers/${encodeURIComponent(speakerLabel)}/rename`, {
    display_name: displayName,
  }).then(r => r.data)

// ── Chat ─────────────────────────────────────────────────────────────────────

export const askChatbot = (meetingId, question) =>
  api.post(`/proxy/meeting/${meetingId}/chat`, { question }).then(r => r.data)
