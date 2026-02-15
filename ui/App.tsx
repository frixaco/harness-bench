export function App() {
  return (
    <WebSocketProvider>
      <Dashboard />
      <Toaster />
    </WebSocketProvider>
  );
}

export default App;

import "./styles.css";
import { Dashboard } from "./ghostty-web";
import { WebSocketProvider } from "./lib/websocket";
import { Toaster } from "./components/sonner";
