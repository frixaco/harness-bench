import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Terminal, init } from 'ghostty-web'
import { MultiFileDiff } from '@pierre/diffs/react'
import modelsJson from '../../core/models.json'
import type { FileContents } from '@pierre/diffs/react'
import { Button } from '@/components/ui/button'
import { useWS } from '@/lib/websocket'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const Route = createFileRoute('/')({
  component: App,
})

const agentModelMapping = modelsJson as Record<string, Array<string>>
const agents = Object.keys(agentModelMapping)

function App() {
  const ws = useWS()
  const [runRequested, setRunRequested] = useState<Record<string, boolean>>(
    agents.reduce(
      (a, c) => {
        a[c] = false
        return a
      },
      {} as Record<string, boolean>,
    ),
  )

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div>
        <div>
          <textarea></textarea>
        </div>

        <div>
          <SingleDiff />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex gap-4 flex-wrap">
          {agents.map((agent) => (
            <div className="flex gap-2 items-center bg-secondary rounded-lg p-2 border w-fit">
              <Button
                onClick={() => {
                  ws.send(agent)
                  setRunRequested((prev) => ({ ...prev, [agent]: true }))
                }}
              >
                RUN
              </Button>

              <span className="font-bold capitalize">{agent}</span>

              <Select>
                <SelectTrigger className="w-fit">
                  <SelectValue placeholder="model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.values(agentModelMapping[agent]).map((model) => (
                      <SelectItem value={model}>{model}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <Button
          className="font-bold uppercase"
          variant="destructive"
          onClick={() => {
            ws.conn?.close()
          }}
        >
          close all
        </Button>
      </div>

      <div className="flex size-full gap-8 flex-wrap justify-center">
        {agents.map((agent) => (
          <Agent
            key={agent}
            name={agent}
            runRequested={runRequested[agent] ?? false}
          />
        ))}
      </div>
    </div>
  )
}

function Agent({
  name,
  runRequested,
}: {
  name: string
  runRequested: boolean
}) {
  const ws = useWS()
  const termDivContainer = useRef<HTMLDivElement | null>(null)
  const termInstance = useRef<Terminal | null>(null)

  useEffect(() => {
    let active = true
    let dataDisposable: { dispose: () => void } | null = null
    let resizeDisposable: { dispose: () => void } | null = null
    let resizeObserver: ResizeObserver | null = null
    let socket: WebSocket | null = null

    const teardownSocket = () => {
      dataDisposable?.dispose()
      dataDisposable = null
      resizeDisposable?.dispose()
      resizeDisposable = null
      resizeObserver?.disconnect()
      resizeObserver = null
      if (socket) {
        socket.removeEventListener('message', handleMessage)
        socket.removeEventListener('close', handleClose)
        socket = null
      }
    }

    const attachSocket = (conn: WebSocket, term: Terminal) => {
      teardownSocket()
      socket = conn
      dataDisposable = term.onData((data) => {
        console.log({ data })
        socket?.send(`${name}:${data}`)
      })
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('close', handleClose)
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

    const handleClose = () => {
      termInstance.current?.dispose()
      termInstance.current = null
    }

    const sendResize = (cols: number, rows: number) => {
      if (!ws.conn || !ws.ready) return
      ws.send(
        JSON.stringify({
          type: 'resize',
          agent: name,
          cols,
          rows,
        }),
      )
    }

    const fitTerminal = (term: Terminal) => {
      const host = termDivContainer.current
      if (!host || !term.renderer) return
      const metrics = term.renderer.getMetrics()
      if (!metrics.width || !metrics.height) return
      const cols = Math.max(2, Math.floor(host.clientWidth / metrics.width))
      const rows = Math.max(1, Math.floor(host.clientHeight / metrics.height))
      term.resize(cols, rows)
    }

    async function ensureTerminalSetup() {
      const host = termDivContainer.current
      if (!host || termInstance.current) return
      await init()
      if (!active) return

      const term = new Terminal({
        fontSize: 14,
        theme: {
          background: '#16181a',
          foreground: '#ffffff',
          black: '#16181a',
          red: '#ff6e5e',
          green: '#5eff6c',
          yellow: '#f1ff5e',
          blue: '#5ea1ff',
          magenta: '#ff5ef1',
          cyan: '#5ef1ff',
          white: '#ffffff',
          brightBlack: '#3c4048',
          brightRed: '#ffbd5e',
          brightGreen: '#5eff6c',
          brightYellow: '#f1ff5e',
          brightBlue: '#5ea1ff',
          brightMagenta: '#ff5ea0',
          brightCyan: '#5ef1ff',
          brightWhite: '#ffffff',
        },
      })
      term.open(host)
      termInstance.current = term
      fitTerminal(term)

      resizeObserver = new ResizeObserver(() => {
        if (termInstance.current) {
          fitTerminal(termInstance.current)
        }
      })
      resizeObserver.observe(host)
    }

    async function ensureSocketAttached() {
      await ensureTerminalSetup()
      if (!active || !ws.conn || !termInstance.current) return
      attachSocket(ws.conn, termInstance.current)

      resizeDisposable = termInstance.current.onResize((size) => {
        sendResize(size.cols, size.rows)
      })

      fitTerminal(termInstance.current)
      sendResize(termInstance.current.cols, termInstance.current.rows)
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
    <div className="h-120 w-xl rounded-lg border bg-secondary p-2">
      <div
        ref={termDivContainer}
        className="h-full w-full bg-[#16181a] caret-background"
      />
    </div>
  )
}

const oldFile: FileContents = {
  name: 'main.zig',
  contents: `const std = @import("std");

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("Hi you, {s}!\\\\n", .{"world"});
}
`,
}

const newFile: FileContents = {
  name: 'main.zig',
  contents: `const std = @import("std");

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("Hello there, {s}!\\\\n", .{"zig"});
}
`,
}

function SingleDiff() {
  return (
    <MultiFileDiff
      // We automatically detect the language based on filename
      oldFile={oldFile}
      newFile={newFile}
      options={{ theme: 'pierre-dark' }}
    />
  )
}
