import agentModeMapping from './models.json'

const procs = new Map<string, Bun.Subprocess>()

const agents = Object.keys(agentModeMapping)
const defaultCols = 80
const defaultRows = 24

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
        let proc = Bun.spawn([agent], {
          cwd: process.env.HOME,
          env: { ...process.env },
          onExit(proc, exitCode, signalCode, error) {
            // exit handler
          },
          terminal: {
            cols: defaultCols,
            rows: defaultRows,
            data(terminal, data) {
              ws.send(data)
            },
          },
        })
        procs.set(agent, proc)
      } else if (typeof message === 'string' && message.startsWith('{')) {
        try {
          const payload = JSON.parse(message)
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
