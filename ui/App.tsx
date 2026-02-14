export function App() {
  return (
    <WebSocketProvider>
      <Dashboard />
    </WebSocketProvider>
  );
}

export default App;

import "./index.css";
import { Dashboard } from "./ghostty-web";
import { WebSocketProvider } from "./lib/websocket";
