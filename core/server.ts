import { existsSync, mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import agentModeMapping from './models.json'

const procs = new Map<string, Bun.Subprocess>()
const agentWorktrees = new Map<string, string>()

const agents = Object.keys(agentModeMapping)
const defaultCols = 80
const defaultRows = 24
const sandboxRoot = path.join(os.homedir(), '.hbench')
const corsHeaders = { 'access-control-allow-origin': '*' }
const stopDelayMs = {
  interrupt: 250,
  secondInterrupt: 350,
  term: 1200,
  kill: 500,
}
let stopAllInFlight: Promise<void> | null = null

const agentBranchName = (agent: string) => `agent/${agent}`

const repoSlugFromUrl = (repoUrl: string) => {
  const match = repoUrl.trim().match(/[:/]([^/]+\/[^/]+?)(\.git)?$/)
  if (!match) return null
  return match[1].replace(/\.git$/, '').replace(/[\/\\]/g, '-')
}

const runGit = async (args: string[], cwd: string) => {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`)
  }
}

const runGitWithOutput = async (args: string[], cwd: string) => {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`)
  }
  return stdout
}

const runGitNoIndexDiff = async (args: string[], cwd: string) => {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  if (exitCode > 1) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim()}`)
  }
  return stdout
}

const buildWorktreeDiff = async (cwd: string) => {
  const diff = await runGitWithOutput(['-C', cwd, 'diff'], cwd)
  const status = await runGitWithOutput(
    ['-C', cwd, 'status', '--porcelain'],
    cwd,
  )
  const untracked = status
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3))

  if (untracked.length === 0) {
    return diff
  }

  const untrackedDiffs = await Promise.all(
    untracked.map((file) =>
      runGitNoIndexDiff(
        ['-C', cwd, 'diff', '--no-index', '--', '/dev/null', file],
        cwd,
      ),
    ),
  )
  return [diff, ...untrackedDiffs].filter(Boolean).join('\n')
}

const sendStatus = (
  ws: Bun.ServerWebSocket<undefined>,
  type: 'setup-status' | 'wipe-status',
  status: 'start' | 'success' | 'error',
  payload: Record<string, unknown> = {},
) => {
  ws.send(
    JSON.stringify({
      type,
      status,
      ...payload,
    }),
  )
}

const sendAgentNotice = (
  ws: Bun.ServerWebSocket<undefined>,
  agent: string,
  message: string,
) => {
  ws.send(
    JSON.stringify({
      type: 'output',
      agent,
      data: Buffer.from(message).toString('base64'),
    }),
  )
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const waitForExit = async (proc: Bun.Subprocess, timeoutMs: number) => {
  if (proc.exitCode !== null) return true
  await Promise.race([proc.exited, wait(timeoutMs)])
  return proc.exitCode !== null
}

const stopTrackedProcess = async (agent: string, proc: Bun.Subprocess) => {
  if (proc.exitCode === null) {
    try {
      proc.terminal?.write('\u0003')
    } catch (error) {
      console.warn('Failed to send interrupt', agent, error)
    }

    const exitedAfterInterrupt = await waitForExit(proc, stopDelayMs.interrupt)
    if (!exitedAfterInterrupt && proc.exitCode === null) {
      try {
        proc.terminal?.write('\u0003')
      } catch (error) {
        console.warn('Failed to send second interrupt', agent, error)
      }
    }

    const exitedAfterSecondInterrupt = await waitForExit(
      proc,
      stopDelayMs.secondInterrupt,
    )
    if (!exitedAfterSecondInterrupt && proc.exitCode === null) {
      try {
        proc.kill('SIGTERM')
      } catch (error) {
        console.warn('Failed to send SIGTERM', agent, error)
      }
    }

    const exitedAfterTerm = await waitForExit(proc, stopDelayMs.term)
    if (!exitedAfterTerm && proc.exitCode === null) {
      try {
        proc.kill('SIGKILL')
      } catch (error) {
        console.warn('Failed to send SIGKILL', agent, error)
      }
      await waitForExit(proc, stopDelayMs.kill)
    }
  }

  try {
    proc.terminal?.close()
  } catch (error) {
    console.warn('Failed to close terminal', agent, error)
  }

  if (procs.get(agent) === proc) {
    procs.delete(agent)
  }
}

const stopAgentProcess = async (agent: string) => {
  const proc = procs.get(agent)
  if (!proc) return
  await stopTrackedProcess(agent, proc)
}

const stopAllProcesses = async () => {
  if (stopAllInFlight) {
    await stopAllInFlight
    return
  }

  stopAllInFlight = (async () => {
    const entries = Array.from(procs.entries())
    await Promise.all(
      entries.map(([agent, proc]) => stopTrackedProcess(agent, proc)),
    )
    procs.clear()
  })()

  try {
    await stopAllInFlight
  } finally {
    stopAllInFlight = null
  }
}

const wipeSandbox = () => {
  if (!existsSync(sandboxRoot)) return
  rmSync(sandboxRoot, { force: true, recursive: true })
  agentWorktrees.clear()
}

const ensureAgentWorktrees = async (repoUrl: string) => {
  const slug = repoSlugFromUrl(repoUrl)
  if (!slug) throw new Error('Invalid repository URL')

  const repoRoot = path.join(sandboxRoot, slug)
  const baseRepoPath = path.join(repoRoot, 'repo')
  const worktreeRoot = path.join(repoRoot, 'worktrees')

  if (existsSync(repoRoot)) {
    rmSync(repoRoot, { force: true, recursive: true })
  }

  mkdirSync(repoRoot, { recursive: true })
  mkdirSync(worktreeRoot, { recursive: true })
  await runGit(['clone', repoUrl, baseRepoPath], repoRoot)

  for (const agent of agents) {
    const worktreePath = path.join(worktreeRoot, agent)
    if (!existsSync(worktreePath)) {
      await runGit(
        [
          '-C',
          baseRepoPath,
          'worktree',
          'add',
          '-b',
          agentBranchName(agent),
          worktreePath,
        ],
        repoRoot,
      )
    }
    agentWorktrees.set(agent, worktreePath)
  }
}

Bun.serve({
  port: 4000,
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === '/stop' && req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...corsHeaders,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      })
    }
    if (url.pathname === '/stop' && req.method === 'POST') {
      return stopAllProcesses()
        .then(
          () =>
            new Response(JSON.stringify({ status: 'success' }), {
              headers: {
                ...corsHeaders,
                'content-type': 'application/json; charset=utf-8',
              },
            }),
        )
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : 'Unknown error'
          return new Response(JSON.stringify({ status: 'error', message }), {
            status: 500,
            headers: {
              ...corsHeaders,
              'content-type': 'application/json; charset=utf-8',
            },
          })
        })
    }
    if (url.pathname === '/diff' && req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          ...corsHeaders,
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      })
    }
    if (url.pathname === '/diff' && req.method === 'GET') {
      const agent = url.searchParams.get('agent')
      if (!agent || !agents.includes(agent)) {
        return new Response('Unknown agent', {
          status: 400,
          headers: corsHeaders,
        })
      }
      let cwd = agentWorktrees.get(agent)
      if (!cwd) {
        const repoUrl = url.searchParams.get('repoUrl')
        const slug = repoUrl ? repoSlugFromUrl(repoUrl) : null
        if (slug) {
          const candidate = path.join(sandboxRoot, slug, 'worktrees', agent)
          if (existsSync(candidate)) {
            cwd = candidate
            agentWorktrees.set(agent, candidate)
          }
        }
      }
      if (!cwd) {
        return new Response('No worktree configured. Run SETUP first.', {
          status: 400,
          headers: corsHeaders,
        })
      }
      return buildWorktreeDiff(cwd)
        .then(
          (diff) =>
            new Response(diff || '', {
              headers: {
                'content-type': 'text/plain; charset=utf-8',
                ...corsHeaders,
              },
            }),
        )
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : 'Unknown error'
          return new Response(message, {
            status: 500,
            headers: corsHeaders,
          })
        })
    }
    if (url.pathname == '/vt' && req.headers.get('upgrade') === 'websocket') {
      if (server.upgrade(req)) return
      return new Response('Upgrade failed', { status: 400 })
    }
  },
  websocket: {
    async message(ws, message) {
      console.log(message)

      if (typeof message === 'string' && agents.includes(message)) {
        const agent = message
        const cwd = agentWorktrees.get(agent)
        if (!cwd) {
          console.warn('Missing worktree for agent', agent)
          sendAgentNotice(
            ws,
            agent,
            'No worktree configured. Run SETUP first.\r\n',
          )
          return
        }
        await stopAgentProcess(agent)
        const proc = Bun.spawn([agent], {
          cwd,
          env: { ...process.env },
          onExit(exitedProc, _exitCode, _signalCode, _error) {
            if (procs.get(agent) === exitedProc) {
              procs.delete(agent)
            }
          },
          terminal: {
            cols: defaultCols,
            rows: defaultRows,
            data(_terminal, data) {
              const encoded = Buffer.from(data).toString('base64')
              ws.send(
                JSON.stringify({
                  type: 'output',
                  agent,
                  data: encoded,
                }),
              )
            },
          },
        })
        procs.set(agent, proc)
      } else if (typeof message === 'string' && message.startsWith('{')) {
        try {
          const payload = JSON.parse(message)
          if (payload.type === 'wipe') {
            sendStatus(ws, 'wipe-status', 'start')
            try {
              await stopAllProcesses()
              wipeSandbox()
              sendStatus(ws, 'wipe-status', 'success')
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error'
              sendStatus(ws, 'wipe-status', 'error', { message: errorMessage })
            }
            return
          }
          if (payload.type === 'setup') {
            const repoUrl = payload.repoUrl
            if (!repoUrl || typeof repoUrl !== 'string') {
              sendStatus(ws, 'setup-status', 'error', {
                message: 'Missing repository URL',
              })
              return
            }
            try {
              sendStatus(ws, 'setup-status', 'start', { repoUrl })
              await ensureAgentWorktrees(repoUrl)
              sendStatus(ws, 'setup-status', 'success', { repoUrl })
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error'
              sendStatus(ws, 'setup-status', 'error', {
                repoUrl,
                message: errorMessage,
              })
              console.warn('Setup failed', error)
            }
            return
          }
          if (payload.type === 'input') {
            const agent = payload.agent
            if (!agent || typeof agent !== 'string') return
            if (!agents.includes(agent)) return
            if (typeof payload.data !== 'string') return
            procs.get(agent)?.terminal?.write(payload.data)
            return
          }
          if (payload.type === 'resize') {
            const agent = payload.agent
            if (!agent || typeof agent !== 'string') return
            if (!agents.includes(agent)) return
            const cols = Math.trunc(Number(payload.cols))
            const rows = Math.trunc(Number(payload.rows))
            if (!Number.isSafeInteger(cols) || !Number.isSafeInteger(rows))
              return
            if (cols < 2 || rows < 1) return
            if (cols > 2000 || rows > 1000) return
            try {
              procs.get(agent)?.terminal?.resize(cols, rows)
            } catch (error) {
              console.warn('Failed to resize terminal', {
                agent,
                cols,
                rows,
                error,
              })
            }
            return
          }
        } catch (error) {
          console.warn('Invalid message payload', error)
        }
      } else if (typeof message === 'string') {
        const [agent, input] = message.split(':')
        procs.get(agent)?.terminal?.write(input)
      }
    },
    open(_ws) {
      console.log('opening')
    },
    close(_ws, _code, _message) {
      console.log('closing')
      void stopAllProcesses().catch((error) => {
        console.warn('Failed to stop processes on socket close', error)
      })
    },
    drain(_ws) {
      console.log('draining')
    },
  },
})
