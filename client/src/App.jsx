import { useState } from "react";
import { JoinScreen } from "./components/JoinScreen";
import VirtualOffice from "./VirtualOffice";
import { AudioControls } from "./components/AudioControls";
import { useMediaStream } from "./hooks/useMediaStream";

function App() {
  const [username, setUsername] = useState(null);
  const { localStream, isMuted, permissionGranted, startAudio, toggleMute } = useMediaStream();

  if (!username) {
    return <JoinScreen onJoin={setUsername} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#111827", minHeight: "100vh", padding: "20px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <h1 style={{ margin: 0, color: "#f9fafb", fontSize: "22px", fontWeight: 700, letterSpacing: "-0.5px" }}>
          🗣️ ProxiSpeak
        </h1>
        <span style={{ background: "#374151", color: "#9ca3af", padding: "3px 10px", borderRadius: "20px", fontSize: "13px" }}>
          Playing as <strong style={{ color: "#60a5fa" }}>{username}</strong>
        </span>
      </div>
      <VirtualOffice username={username} earshotRadius={100} localStream={localStream} />
      <AudioControls
        isMuted={isMuted}
        toggleMute={toggleMute}
        permissionGranted={permissionGranted}
        startAudio={startAudio}
      />
      <p style={{ color: "#6b7280", fontSize: "12px", marginTop: "12px" }}>
        Move with <kbd style={{ background: "#374151", color: "#e5e7eb", padding: "1px 5px", borderRadius: "3px" }}>WASD</kbd> or Arrow keys · Click canvas to move there
      </p>
    </div>
  );
}

export default App;