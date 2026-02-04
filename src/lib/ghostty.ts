let wasmInstance: WebAssembly.Instance | null = null
let wasmMemory: WebAssembly.Memory | null = null

export async function getGhosttyVT() {
  if (wasmInstance) return wasmInstance
  if (typeof window === 'undefined') return null

  const { instance } = await WebAssembly.instantiateStreaming(
    fetch('/ghostty-vt.wasm'),
    {
      env: {
        log: (ptr: number, len: number) => {
          const bytes = new Uint8Array(
            (instance.exports.memory as WebAssembly.Memory).buffer,
            ptr,
            len,
          )
          const text = new TextDecoder().decode(bytes)
          console.log('[wasm]', text)
        },
      },
    },
  )
  wasmInstance = instance
  wasmMemory = instance.exports.memory as WebAssembly.Memory
  return instance
}
