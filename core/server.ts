Bun.serve({
  fetch(req, server) {
    // upgrade the request to a WebSocket
    if (server.upgrade(req)) {
      return // do not return a Response
    }
    return new Response('Upgrade failed', { status: 500 })
  },
  websocket: {
    async message(ws, message) {
      let proc = Bun.spawn(['bun', '--version'], {
        cwd: './path/to/subdir', // specify a working directory
        env: { ...process.env, FOO: 'bar' }, // specify environment variables
        onExit(proc, exitCode, signalCode, error) {
          // exit handler
        },
      })

      proc.pid // process ID of subprocess

      proc = Bun.spawn(['cat'], {
        stdin: await fetch(
          'https://raw.githubusercontent.com/oven-sh/bun/main/examples/hashing.js',
        ),
      })

      const text = await proc.stdout.text()
      console.log(text) // "const input = "hello world".repeat(400); ..."
    }, // a message is received
    open(ws) {}, // a socket is opened
    close(ws, code, message) {}, // a socket is closed
    drain(ws) {}, // the socket is ready to receive more data
  }, // handlers
})
