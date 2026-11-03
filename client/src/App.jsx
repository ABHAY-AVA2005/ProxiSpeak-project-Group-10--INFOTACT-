import { useState } from "react";
import { JoinScreen } from "./components/JoinScreen";
import VirtualOffice from "./VirtualOffice";
import { AudioControls } from "./components/AudioControls";
import { useMediaStream } from "./hooks/useMediaStream";

function App() {
  const [username, setUsername] = useState(() => {
    return sessionStorage.getItem("proxispeak_username") || null;
  });
  const { localStream, isMuted, permissionGranted, error, startAudio, toggleMute } = useMediaStream();

  const handleJoin = (name) => {
    sessionStorage.setItem("proxispeak_username", name);
    setUsername(name);
  };

  if (!username) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-kicker">ProxiSpeak</div>
            <div className="brand-subtitle">Spatial office workspace</div>
          </div>
        </div>

        <div className="status-chip">
          <span className="status-dot" />
          Live · <strong>{username}</strong>
        </div>
      </header>

      <main className="workspace-shell">
        <div className="workspace-toolbar">
          <div>
            <p className="workspace-label">HQ floor plan</p>
            <h1>Productive collaboration, by proximity</h1>
          </div>
          <div className="workspace-stats">
            <div className="stat-box">
              <span className="stat-label">Earshot</span>
              <strong>100px</strong>
            </div>
            <div className="stat-box">
              <span className="stat-label">Mode</span>
              <strong>Live</strong>
            </div>
          </div>
        </div>

        <VirtualOffice username={username} earshotRadius={100} localStream={localStream} />
      </main>

      <AudioControls
        isMuted={isMuted}
        toggleMute={toggleMute}
        permissionGranted={permissionGranted}
        startAudio={startAudio}
        error={error}
      />

      <p className="helper-text">
        Move with <kbd>WASD</kbd> or arrow keys · Click anywhere to move
      </p>
    </div>
  );
}

export default App;