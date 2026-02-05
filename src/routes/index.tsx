import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Terminal, init } from 'ghostty-web'
import { MultiFileDiff } from '@pierre/diffs/react'
import { Columns2, Play, RefreshCcw } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { getAgentPattern } from '@/lib/agent-patterns'

export const Route = createFileRoute('/')({
  component: App,
})

const agentModelMapping = modelsJson as Record<string, Array<string>>
const agents = Object.keys(agentModelMapping)
const defaultRunRequested = agents.reduce(
  (a, c) => {
    a[c] = false
    return a
  },
  {} as Record<string, boolean>,
)

function App() {
  const [prompt, setPrompt] = useState('')
  const ws = useWS()
  const [runRequested, setRunRequested] =
    useState<Record<string, boolean>>(defaultRunRequested)
  console.log({ prompt })

  return (
    <div className="flex w-full flex-col items-center gap-2 text-sm pt-24 px-24 font-mono">
      <div className="flex flex-col md:flex-row gap-2 justify-center-center">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          placeholder="Enter your prompt..."
          className="w-xl"
        ></Textarea>

        <SingleDiff />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-2 flex-wrap">
          {agents.map((agent) => (
            <div
              className="flex flex-col gap-1 items-center rounded-lg p-1 border"
              style={getAgentPattern(agent)}
            >
              <div className="flex min-w-36 items-center w-full justify-between">
                <span className="capitalize px-2">{agent}</span>
                <Button
                  className="rounded-full"
                  size="icon"
                  variant="link"
                  onClick={() => {
                    ws.send(agent)
                    setRunRequested((prev) => ({ ...prev, [agent]: true }))
                  }}
                >
                  {runRequested[agent] ? (
                    <RefreshCcw className="animate-spin" />
                  ) : (
                    <Play />
                  )}
                </Button>
              </div>

              <Select>
                <SelectTrigger className="w-full">
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

        <div className="flex gap-4 py-8">
          <Button
            className="font-semibold uppercase px-4 w-24"
            size="lg"
            disabled={prompt.length < 2}
            onClick={() => {}}
          >
            RUN
          </Button>

          <Button
            className="font-semibold uppercase px-4 w-24"
            size="lg"
            variant="destructive"
            onClick={() => {
              ws.conn?.close()
              setRunRequested(defaultRunRequested)
            }}
          >
            STOP
          </Button>
        </div>
      </div>

      <div className="flex size-full gap-4 flex-wrap justify-center">
        {agents.map((agent) => (
          <TUI
            key={agent}
            name={agent}
            runRequested={runRequested[agent] ?? false}
          />
        ))}
      </div>
    </div>
  )
}

function TUI({ name, runRequested }: { name: string; runRequested: boolean }) {
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
        socket?.send(
          JSON.stringify({
            type: 'input',
            agent: name,
            data,
          }),
        )
      })
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('close', handleClose)
    }

    const handleMessage = (event: MessageEvent) => {
      const term = termInstance.current
      if (!term) return
      const payload = event.data
      if (typeof payload === 'string') {
        try {
          const message = JSON.parse(payload)
          if (message.type !== 'output') return
          if (message.agent !== name) return
          if (typeof message.data !== 'string') return
          const decoded = atob(message.data)
          const bytes = new Uint8Array(decoded.length)
          for (let i = 0; i < decoded.length; i += 1) {
            bytes[i] = decoded.charCodeAt(i)
          }
          term.write(bytes)
        } catch (error) {
          console.warn('Invalid output payload', error)
        }
      } else if (payload instanceof ArrayBuffer) {
        term.write(new Uint8Array(payload))
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
    <div className="h-120 w-full max-w-lg">
      <div className="border rounded-t-lg px-4 py-2 flex justify-between items-center">
        <p className="capitalize">{name}</p>

        <Sheet>
          <SheetTrigger
            render={
              <Button
                disabled={true}
                variant="outline"
                className="tracking-tighter"
              />
            }
          >
            View diff <Columns2 />
          </SheetTrigger>
          <SheetContent
            side="right"
            className="data-[side=right]:w-[90vw] data-[side=right]:sm:max-w-[90vw]"
          >
            <SheetHeader>
              <SheetTitle className="capitalize">{name} — Diff</SheetTitle>
            </SheetHeader>
            <div className="overflow-auto flex-1 p-4">
              <SingleDiff />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div
        ref={termDivContainer}
        className="h-full w-full caret-background border"
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
