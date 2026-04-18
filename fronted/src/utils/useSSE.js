import { useEffect } from 'react'

export function useSSE(url, onMessage) {
  useEffect(() => {
    const es = new EventSource(url)
    es.onmessage = (e) => onMessage(JSON.parse(e.data))
    return () => es.close()
  }, [url])
}
