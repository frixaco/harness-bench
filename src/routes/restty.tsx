import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Restty } from 'restty'
import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { Columns2, Play, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import modelsJson from '../../core/models.json'
import type { PtyConnectOptions, PtyTransport } from 'restty'
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

export const Route = createFileRoute('/restty')({
  component: App,
})

const agentModelMapping = modelsJson as Record<string, Array<string>>
const agents = Object.keys(agentModelMapping)
const createRunRequestedState = () =>
  agents.reduce(
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
  const [runRequested, setRunRequested] = useState<Record<string, boolean>>(
    createRunRequestedState(),
  )
  const [stopping, setStopping] = useState(false)
  const setupToastIdRef = useRef<string | number | null>(null)
  const wipeToastIdRef = useRef<string | number | null>(null)
  const trimmedRepoUrl = repoUrl.trim()
  const isRepoSetup =
    trimmedRepoUrl.length > 0 && setupRepoUrl === trimmedRepoUrl
  console.log({ prompt })

  const stopAllAgents = useCallback(async () => {
    if (stopping) return
    setStopping(true)
    try {
      const stopBase = `${window.location.protocol}//${window.location.hostname}:4000`
      const response = await fetch(`${stopBase}/stop`, {
        method: 'POST',
      })
      if (!response.ok) {
        const message = (await response.text()).trim()
        throw new Error(message || 'Failed to stop agents')
      }
      toast.success('Stopped all agents')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Stop failed', { description: message })
    } finally {
      setRunRequested(createRunRequestedState())
      setStopping(false)
    }
  }, [stopping])

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
              typeof payload.repoUrl === 'string'
                ? payload.repoUrl.trim()
                : null,
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
            key={agent}
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
          variant="destructive"
          disabled={stopping}
          onClick={() => {
            void stopAllAgents()
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
  const resttyInstance = useRef<Restty | null>(null)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffPatch, setDiffPatch] = useState<string | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffRepoUrl, setDiffRepoUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let transport: PtyTransport | null = null
    let initPromise: Promise<void> | null = null
    const MIN_COLS = 2
    const MIN_ROWS = 1
    const MAX_COLS = 2000
    const MAX_ROWS = 1000

    const decodeBase64 = (data: string) => {
      const decoded = atob(data)
      const bytes = new Uint8Array(decoded.length)
      for (let i = 0; i < decoded.length; i += 1) {
        bytes[i] = decoded.charCodeAt(i)
      }
      return bytes
    }

    const normalizeSize = (cols: number, rows: number) => {
      const safeCols = Math.trunc(cols)
      const safeRows = Math.trunc(rows)
      if (!Number.isFinite(safeCols) || !Number.isFinite(safeRows)) return null
      if (safeCols < MIN_COLS || safeRows < MIN_ROWS) return null
      if (safeCols > MAX_COLS || safeRows > MAX_ROWS) return null
      return { cols: safeCols, rows: safeRows }
    }

    const createTransport = (conn: WebSocket): PtyTransport => {
      let connected = false
      let callbacks: PtyConnectOptions['callbacks'] | null = null
      let decoder: TextDecoder | null = null

      function handleMessage(event: MessageEvent) {
        if (!connected || !callbacks || !decoder) return
        if (typeof event.data !== 'string') return

        try {
          const message = JSON.parse(event.data) as {
            type?: string
            agent?: string
            data?: string
          }
          if (message.type !== 'output') return
          if (message.agent !== name) return
          if (typeof message.data !== 'string') return

          const text = decoder.decode(decodeBase64(message.data), {
            stream: true,
          })
          if (text) {
            callbacks.onData?.(text)
          }
        } catch (error) {
          console.warn('Invalid output payload', error)
        }
      }

      function teardown(emitDisconnect: boolean) {
        const currentCallbacks = callbacks
        const currentDecoder = decoder
        const wasConnected = connected

        conn.removeEventListener('message', handleMessage)
        conn.removeEventListener('close', handleClose)

        connected = false
        callbacks = null
        decoder = null

        if (currentDecoder) {
          const tail = currentDecoder.decode()
          if (tail) {
            currentCallbacks?.onData?.(tail)
          }
        }

        if (emitDisconnect && wasConnected) {
          currentCallbacks?.onDisconnect?.()
        }
      }

      function handleClose() {
        teardown(true)
      }

      return {
        connect: ({ callbacks: nextCallbacks, cols, rows }) => {
          if (connected) return
          callbacks = nextCallbacks
          decoder = new TextDecoder()
          connected = true
          conn.addEventListener('message', handleMessage)
          conn.addEventListener('close', handleClose)
          callbacks.onConnect?.()
          const size = normalizeSize(cols ?? 0, rows ?? 0)
          if (size && conn.readyState === WebSocket.OPEN) {
            conn.send(
              JSON.stringify({
                type: 'resize',
                agent: name,
                cols: size.cols,
                rows: size.rows,
              }),
            )
          }
        },
        disconnect: () => {
          if (!connected) return
          teardown(true)
        },
        sendInput: (data: string) => {
          if (!connected || conn.readyState !== WebSocket.OPEN) return false
          conn.send(
            JSON.stringify({
              type: 'input',
              agent: name,
              data,
            }),
          )
          return true
        },
        resize: (cols: number, rows: number) => {
          if (!connected || conn.readyState !== WebSocket.OPEN) return false
          const size = normalizeSize(cols, rows)
          if (!size) return false
          conn.send(
            JSON.stringify({
              type: 'resize',
              agent: name,
              cols: size.cols,
              rows: size.rows,
            }),
          )
          return true
        },
        isConnected: () => connected && conn.readyState === WebSocket.OPEN,
        destroy: () => {
          teardown(false)
        },
      }
    }

    function ensureTerminalSetup() {
      const host = termDivContainer.current
      if (!host || resttyInstance.current || !ws.conn) return

      transport = createTransport(ws.conn)
      resttyInstance.current = new Restty({
        root: host,
        autoInit: false,
        shortcuts: false,
        defaultContextMenu: false,
        paneStyles: {
          splitBackground: '#16181a',
          paneBackground: '#16181a',
          inactivePaneOpacity: 1,
          activePaneOpacity: 1,
          opacityTransitionMs: 100,
          dividerThicknessPx: 1,
        },
        fontSources: [
          {
            type: 'local',
            matchers: [
              'SF Mono',
              'Menlo',
              'Monaco',
              'Consolas',
              'JetBrains Mono',
              'Fira Code',
            ],
            required: true,
          },
          {
            type: 'local',
            matchers: [
              'Symbols Nerd Font Mono',
              'Symbols Nerd Font',
              'Noto Sans Symbols 2',
              'Apple Color Emoji',
              'Segoe UI Emoji',
            ],
          },
        ],
        appOptions: {
          renderer: 'webgl2',
          fontSize: 14,
          ptyTransport: transport,
        },
      })
    }

    function ensureSocketAttached() {
      ensureTerminalSetup()
      if (!active || !resttyInstance.current) return
      const instance = resttyInstance.current
      const pane = instance.getActivePane()
      if (!pane) return

      if (!initPromise) {
        initPromise = pane.app
          .init()
          .then(() => {
            if (resttyInstance.current !== instance) return
            instance.updateSize(true)
          })
          .catch((error) => {
            console.warn('Failed to initialize restty pane', error)
          })
      }

      try {
        if (!instance.isPtyConnected()) {
          instance.connectPty()
        }
      } catch (error) {
        console.warn('Failed to connect restty transport', error)
      }
    }

    if (runRequested && ws.conn) {
      void ensureSocketAttached()
    }

    return () => {
      active = false
      try {
        resttyInstance.current?.disconnectPty()
      } catch {
        // ignore disconnect failures during teardown
      }
      resttyInstance.current?.destroy()
      resttyInstance.current = null
      transport?.destroy?.()
      transport = null
      initPromise = null
    }
  }, [name, runRequested, ws.conn])

  const fetchDiff = useCallback(
    async (repoUrlOverride?: string) => {
      setDiffLoading(true)
      setDiffError(null)
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
  const files = useMemo(
    () =>
      patch
        ? parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files)
        : [],
    [patch],
  )

  if (loading) {
    return <p className="text-muted-foreground">Loading diff...</p>
  }
  if (error) {
    return <p className="text-destructive">{error}</p>
  }
  if (!patch) {
    return <p className="text-muted-foreground">No changes yet.</p>
  }

  if (files.length === 0) {
    return (
      <pre className="max-h-full overflow-auto rounded bg-background/60 p-3 text-xs">
        {patch}
      </pre>
    )
  }

  return (
    <div className="space-y-4">
      {files.map((file, index) => (
        <FileDiff
          key={file.cacheKey ?? `${file.name}-${index}`}
          fileDiff={file}
          options={{ theme: 'pierre-dark' }}
        />
      ))}
    </div>
  )
}
