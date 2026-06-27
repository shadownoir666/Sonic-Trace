import { useRef, useCallback, useState } from 'react'
import { sendAudioChunk } from '../services/api'

const CHUNK_INTERVAL_MS = 15000 // 15 seconds per chunk

/**
 * Captures local audio, slices into 15s chunks, sends to Python via Node.
 *
 * @param {string} meetingId
 * @param {string} roomCode
 * @param {MediaStream|null} stream  — the local media stream to capture from
 * @param {function} onSegments     — callback(segments[]) for each processed chunk
 */
export default function useAudioCapture(meetingId, roomCode, stream, onSegments) {
  const recorderRef = useRef(null)
  const intervalRef = useRef(null)
  const chunkIndexRef = useRef(0)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const processBlob = useCallback(async (blob) => {
    if (!meetingId || blob.size < 1000) return
    const idx = chunkIndexRef.current++
    setIsProcessing(true)
    try {
      const result = await sendAudioChunk(meetingId, blob, idx, roomCode)
      if (result?.segments?.length > 0) {
        onSegments?.(result.segments)
      }
    } catch (err) {
      console.error('[audio-capture] Chunk processing failed:', err.message)
    } finally {
      setIsProcessing(false)
    }
  }, [meetingId, roomCode, onSegments])

  const startCapture = useCallback(() => {
    if (!stream || !meetingId || isCapturing) return

    // Use only audio tracks
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      console.warn('[audio-capture] No audio tracks available')
      return
    }

    const audioOnlyStream = new MediaStream(audioTracks)

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/ogg'

    const recorder = new MediaRecorder(audioOnlyStream, { mimeType })
    let chunks = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    recorder.onstop = () => {
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType })
        processBlob(blob)
        chunks = []
      }
    }

    recorder.start()
    recorderRef.current = recorder
    setIsCapturing(true)

    // Every CHUNK_INTERVAL_MS stop+start to slice chunk
    intervalRef.current = setInterval(() => {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
        // Start fresh recorder for next chunk
        const newRecorder = new MediaRecorder(audioOnlyStream, { mimeType })
        newRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }
        newRecorder.onstop = () => {
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: mimeType })
            processBlob(blob)
            chunks = []
          }
        }
        newRecorder.start()
        recorderRef.current = newRecorder
      }
    }, CHUNK_INTERVAL_MS)

    console.log('[audio-capture] Started capturing audio chunks every', CHUNK_INTERVAL_MS / 1000, 's')
  }, [stream, meetingId, isCapturing, processBlob])

  const stopCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (recorderRef.current?.state !== 'inactive') {
      recorderRef.current?.stop()
    }
    recorderRef.current = null
    setIsCapturing(false)
    console.log('[audio-capture] Stopped')
  }, [])

  return { isCapturing, isProcessing, startCapture, stopCapture }
}
