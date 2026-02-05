const procs = new Map<string, Bun.Subprocess>()

const agents = ['amp', 'droid', 'pi', 'codex', 'claude', 'opencode']

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
            cols: 80,
            rows: 24,
            data(terminal, data) {
              ws.send(data)
            },
          },
        })
        procs.set(agent, proc)
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
