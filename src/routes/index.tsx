import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Terminal, init } from 'ghostty-web'
import { Button } from '@/components/ui/button'
import { useWS } from '@/lib/websocket'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const ws = useWS()
  const [runRequested, setRunRequested] = useState(false)

  return (
    <div>
      <div>
        <Button
          onClick={() => {
            ws.send('amp')
            setRunRequested(true)
          }}
        >
          Run Amp
        </Button>

        <Button
          onClick={() => {
            ws.conn?.close()
          }}
        >
          Close
        </Button>
      </div>

      <div>
        <Amp runRequested={runRequested} />
      </div>
    </div>
  )
}

function Amp({ runRequested }: { runRequested: boolean }) {
  const ws = useWS()
  const termDivContainer = useRef<HTMLDivElement | null>(null)
  const termInstance = useRef<Terminal | null>(null)

  useEffect(() => {
    let active = true
    let dataDisposable: { dispose: () => void } | null = null
    let socket: WebSocket | null = null

    const teardownSocket = () => {
      dataDisposable?.dispose()
      dataDisposable = null
      if (socket) {
        socket.removeEventListener('message', handleMessage)
        socket = null
      }
    }

    const attachSocket = (conn: WebSocket, term: Terminal) => {
      teardownSocket()
      socket = conn
      dataDisposable = term.onData((data) => {
        console.log({ data })
        socket?.send(`amp:${data}`)
      })
      socket.addEventListener('message', handleMessage)
    }

    const handleMessage = (event: MessageEvent) => {
      const term = termInstance.current
      if (!term) return
      if (typeof event.data === 'string') {
        term.write(event.data)
      } else if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data))
      }
    }

    async function ensureTerminalSetup() {
      const host = termDivContainer.current
      if (!host || termInstance.current) return
      await init()
      if (!active) return

      const term = new Terminal({
        fontSize: 14,
        theme: {
          background: '#0b0f14',
          foreground: '#e5e7eb',
        },
      })
      term.open(host)
      termInstance.current = term
    }

    async function ensureSocketAttached() {
      await ensureTerminalSetup()
      if (!active || !ws.conn || !termInstance.current) return
      attachSocket(ws.conn, termInstance.current)
    }

    if (runRequested) {
      ensureSocketAttached()
    }

    return () => {
      active = false
      teardownSocket()
      termInstance.current?.dispose()
      termInstance.current = null
    }
  }, [runRequested, ws.conn])

  return (
    <div className="h-105 rounded-md border border-white/10 bg-black">
      <div ref={termDivContainer} className="h-full w-full" />
    </div>
  )
}
