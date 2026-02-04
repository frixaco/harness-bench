import { createFileRoute } from '@tanstack/react-router'
import { getGhosttyVT } from '@/lib/ghostty'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const vt = getGhosttyVT()

  return <div>HELLO WORLD</div>
}
