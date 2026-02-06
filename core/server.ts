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
    if (url.pathname == '/vt' && req.headers.get('upgrade') === 'websocket') {
      if (server.upgrade(req)) return
      return new Response('Upgrade failed', { status: 400 })
    }
  },
  websocket: {
    async message(ws, message) {
      console.log(message)

      if (typeof message === 'string' && agents.includes(message)) {
        let agent = message
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
        let proc = Bun.spawn([agent], {
          cwd,
          env: { ...process.env },
          onExit(proc, exitCode, signalCode, error) {
            // exit handler
          },
          terminal: {
            cols: defaultCols,
            rows: defaultRows,
            data(terminal, data) {
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
              wipeSandbox()
              sendStatus(ws, 'wipe-status', 'success')
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Unknown error'
              sendStatus(ws, 'wipe-status', 'error', { message })
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
              const message =
                error instanceof Error ? error.message : 'Unknown error'
              sendStatus(ws, 'setup-status', 'error', { repoUrl, message })
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
            const cols = Number(payload.cols)
            const rows = Number(payload.rows)
            if (!Number.isFinite(cols) || !Number.isFinite(rows)) return
            procs.get(agent)?.terminal?.resize(cols, rows)
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
    open(ws) {
      console.log('opening')
    },
    close(ws, code, message) {
      console.log('closing')

      for (const [_agent, proc] of procs) {
        proc.terminal?.close()
      }
    },
    drain(ws) {
      console.log('draining')
    },
  },
})
