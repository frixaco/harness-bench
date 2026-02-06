import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal as XTerm } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { PatchDiff } from '@pierre/diffs/react'
import { Columns2, Play, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import modelsJson from '../../core/models.json'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { ThemeToggle } from '@/components/theme-toggle'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { getAgentPattern } from '@/lib/agent-patterns'

export const Route = createFileRoute('/xterm')({
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
  const [repoUrl, setRepoUrl] = useState('')
  const [setupRepoUrl, setSetupRepoUrl] = useState<string | null>(null)
  const ws = useWS()
  const [runRequested, setRunRequested] =
    useState<Record<string, boolean>>(defaultRunRequested)
  const setupToastIdRef = useRef<string | number | null>(null)
  const wipeToastIdRef = useRef<string | number | null>(null)
  const trimmedRepoUrl = repoUrl.trim()
  const isRepoSetup =
    trimmedRepoUrl.length > 0 && setupRepoUrl === trimmedRepoUrl
  console.log({ prompt })

  useEffect(() => {
    if (!ws.conn) return

    const handleStatus = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === 'setup-status') {
          if (payload.status === 'start') {
            setSetupRepoUrl(null)
            setupToastIdRef.current = toast.loading('Setting up worktrees...', {
              description: payload.repoUrl,
            })
            return
          }
          if (payload.status === 'success') {
            setSetupRepoUrl(
              typeof payload.repoUrl === 'string' ? payload.repoUrl.trim() : null,
            )
            toast.success('Setup complete', {
              id: setupToastIdRef.current ?? undefined,
              description: payload.repoUrl,
            })
            return
          }
          if (payload.status === 'error') {
            setSetupRepoUrl(null)
            toast.error('Setup failed', {
              id: setupToastIdRef.current ?? undefined,
              description: payload.message ?? payload.repoUrl,
            })
          }
        }

        if (payload?.type === 'wipe-status') {
          if (payload.status === 'start') {
            setSetupRepoUrl(null)
            wipeToastIdRef.current = toast.loading('Wiping ~/.hbench...')
            return
          }
          if (payload.status === 'success') {
            setSetupRepoUrl(null)
            toast.success('Sandbox wiped', {
              id: wipeToastIdRef.current ?? undefined,
            })
            return
          }
          if (payload.status === 'error') {
            toast.error('Wipe failed', {
              id: wipeToastIdRef.current ?? undefined,
              description: payload.message,
            })
          }
        }
      } catch (error) {
        console.warn('Invalid status payload', error)
      }
    }

    ws.conn.addEventListener('message', handleStatus)
    return () => {
      ws.conn?.removeEventListener('message', handleStatus)
    }
  }, [ws.conn])

  return (
    <div className="flex w-full flex-col items-center gap-8 text-sm pt-16 px-24 font-mono">
      <div className="flex w-full justify-end">
        <ThemeToggle />
      </div>

      <div className="flex flex-col md:flex-row gap-2 justify-center-center w-full max-w-4xl">
        <Input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.currentTarget.value)}
          placeholder="GitHub repo URL"
          className="w-full"
        />
      </div>

      <div className="flex flex-col md:flex-row gap-2 justify-center-center w-full max-w-4xl">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.currentTarget.value)}
          placeholder="Enter your prompt..."
          className="w-full h-28"
        ></Textarea>
      </div>

      <div className="flex w-full max-w-4xl gap-2 flex-wrap justify-start">
        {agents.map((agent) => (
          <div
            className="flex flex-col gap-1 items-center rounded-lg p-1 border"
            style={getAgentPattern(agent)}
          >
            <div className="flex min-w-36 items-center w-full justify-start">
              <Button
                className="rounded-full"
                size="icon"
                variant="link"
                disabled={!isRepoSetup}
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
              <span className="capitalize px-2">{agent}</span>
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

      <div className="flex gap-4">
        <Button
          className="font-semibold uppercase px-4 w-24"
          size="lg"
          disabled={repoUrl.trim().length === 0}
          onClick={() => {
            ws.send(
              JSON.stringify({
                type: 'setup',
                repoUrl: trimmedRepoUrl,
              }),
            )
          }}
        >
          SETUP
        </Button>
        <Button
          className="font-semibold uppercase px-4 w-24"
          size="lg"
          variant="destructive"
          onClick={() => {
            ws.send(
              JSON.stringify({
                type: 'wipe',
              }),
            )
          }}
        >
          WIPE
        </Button>
        <Button
          className="font-semibold uppercase px-4 w-24"
          size="lg"
          disabled={prompt.length < 2}
          onClick={() => {
            const trimmedPrompt = prompt.trim()
            if (!trimmedPrompt) return
            agents.forEach((agent) => {
              ws.send(
                JSON.stringify({
                  type: 'input',
                  agent,
                  data: trimmedPrompt,
                }),
              )
              window.setTimeout(() => {
                ws.send(
                  JSON.stringify({
                    type: 'input',
                    agent,
                    data: '\r',
                  }),
                )
              }, 250)
            })
          }}
        >
          RUN
        </Button>

        <Button
          className="font-semibold uppercase px-4 w-24"
          size="lg"
          onClick={() => {
            agents.forEach((agent) => ws.send(agent))
            setRunRequested(
              agents.reduce(
                (acc, agent) => {
                  acc[agent] = true
                  return acc
                },
                {} as Record<string, boolean>,
              ),
            )
          }}
        >
          LAUNCH
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

      <div className="flex size-full gap-4 flex-wrap justify-center">
        {agents.map((agent) => (
          <TUI
            key={agent}
            name={agent}
            runRequested={runRequested[agent] ?? false}
            repoReady={repoUrl.trim().length > 0}
            repoUrl={repoUrl.trim()}
          />
        ))}
      </div>
    </div>
  )
}

function TUI({
  name,
  runRequested,
  repoReady,
  repoUrl,
}: {
  name: string
  runRequested: boolean
  repoReady: boolean
  repoUrl: string
}) {
  const ws = useWS()
  const termDivContainer = useRef<HTMLDivElement | null>(null)
  const termInstance = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffPatch, setDiffPatch] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffChecked, setDiffChecked] = useState(false)
  const [diffRepoUrl, setDiffRepoUrl] = useState<string | null>(null)

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

    const attachSocket = (conn: WebSocket, term: XTerm) => {
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

    const fitTerminal = () => {
      fitAddonRef.current?.fit()
    }

    function ensureTerminalSetup() {
      const host = termDivContainer.current
      if (!host || termInstance.current) return

      const term = new XTerm({
        fontSize: 14,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        cursorBlink: true,
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
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      fitAddonRef.current = fitAddon
      try {
        term.loadAddon(new WebglAddon())
      } catch (error) {
        console.warn('WebGL addon unavailable', error)
      }
      term.open(host)
      termInstance.current = term
      fitTerminal()

      resizeObserver = new ResizeObserver(() => {
        if (termInstance.current) {
          fitTerminal()
        }
      })
      resizeObserver.observe(host)
    }

    function ensureSocketAttached() {
      ensureTerminalSetup()
      if (!active || !ws.conn || !termInstance.current) return
      attachSocket(ws.conn, termInstance.current)

      resizeDisposable = termInstance.current.onResize((size) => {
        sendResize(size.cols, size.rows)
      })

      fitTerminal()
      sendResize(termInstance.current.cols, termInstance.current.rows)
    }

    if (runRequested) {
      ensureSocketAttached()
    }

    return () => {
      active = false
      teardownSocket()
      fitAddonRef.current = null
      termInstance.current?.dispose()
      termInstance.current = null
    }
  }, [runRequested, ws.conn])

  const fetchDiff = useCallback(
    async (repoUrlOverride?: string) => {
      setDiffLoading(true)
      setDiffError(null)
      setDiffChecked(false)
      try {
        const repoUrlParam = repoUrlOverride ?? diffRepoUrl ?? repoUrl
        const diffBase = `${window.location.protocol}//${window.location.hostname}:4000`
        const search = new URLSearchParams({
          agent: name,
          t: Date.now().toString(),
        })
        if (repoUrlParam) {
          search.set('repoUrl', repoUrlParam)
        }
        const response = await fetch(`${diffBase}/diff?${search.toString()}`)
        const body = await response.text()
        if (!response.ok) {
          throw new Error(body || 'Failed to load diff')
        }
        const trimmed = body.trim()
        setDiffPatch(trimmed.length > 0 ? body : null)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        setDiffError(message)
        setDiffPatch(null)
      } finally {
        setDiffLoading(false)
        setDiffChecked(true)
      }
    },
    [diffRepoUrl, name, repoUrl],
  )

  return (
    <div className="h-120 flex flex-col w-full max-w-lg">
      <div className="border rounded-t-lg px-4 py-2 flex justify-between items-center">
        <p className="capitalize">{name}</p>

        <Sheet
          open={diffOpen}
          onOpenChange={(open) => {
            setDiffOpen(open)
            if (open) {
              setDiffRepoUrl(repoUrl)
              fetchDiff(repoUrl)
            }
          }}
        >
          <SheetTrigger
            render={
              <Button
                variant="outline"
                className="tracking-tighter"
                disabled={!repoReady}
                onClick={() => {
                  if (!diffOpen) {
                    setDiffOpen(true)
                  }
                  setDiffRepoUrl(repoUrl)
                  fetchDiff(repoUrl)
                }}
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
              <DiffView
                loading={diffLoading}
                error={diffError}
                patch={diffPatch}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div
        ref={termDivContainer}
        className="flex-1 rounded-b-lg w-full caret-background border"
      />
    </div>
  )
}

function DiffView({
  loading,
  error,
  patch,
}: {
  loading: boolean
  error: string | null
  patch: string | null
}) {
  if (loading) {
    return <p className="text-muted-foreground">Loading diff...</p>
  }
  if (error) {
    return <p className="text-destructive">{error}</p>
  }
  if (!patch) {
    return <p className="text-muted-foreground">No changes yet.</p>
  }
  return <PatchDiff patch={patch} options={{ theme: 'pierre-dark' }} />
}
