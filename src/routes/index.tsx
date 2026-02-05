import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { FitAddon, Terminal, init } from 'ghostty-web'
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
  const [runRequested, setRunRequested] = useState<Record<string, boolean>>({})

  return (
    <div className="flex flex-col items-center">
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

      <div className="w-4xl flex flex-col gap-8">
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
    let socket: WebSocket | null = null
    let fitAddon: FitAddon | null = null

    const teardownSocket = () => {
      dataDisposable?.dispose()
      dataDisposable = null
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
      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)

      term.open(host)
      termInstance.current = term

      fitAddon.fit()
      fitAddon.observeResize()
    }

    const handleResize = () => {
      fitAddon?.fit()
    }

    window.addEventListener('resize', handleResize)

    async function ensureSocketAttached() {
      await ensureTerminalSetup()
      if (!active || !ws.conn || !termInstance.current) return
      attachSocket(ws.conn, termInstance.current)

      termInstance.current.onResize((size) => {
        if (ws.conn && ws.ready) {
          // Send resize as control sequence (server expects this format)
          ws.send(
            JSON.stringify({
              type: 'resize',
              cols: size.cols,
              rows: size.rows,
            }),
          )
        }
      })
    }

    if (runRequested) {
      ensureSocketAttached()
    }

    return () => {
      active = false
      teardownSocket()
      termInstance.current?.dispose()
      termInstance.current = null

      window.removeEventListener('resize', handleResize)
    }
  }, [runRequested, ws.conn])

  return (
    <div className="rounded-lg p-2 bg-secondary border">
      <div ref={termDivContainer} className="h-full w-full caret-background" />
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
