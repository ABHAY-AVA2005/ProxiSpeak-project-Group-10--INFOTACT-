const roomUsers = [
  { id: 1, name: "Abhishek", x: 18, y: 58, color: "#8ae3d8", title: "AB" },
  { id: 2, name: "Tanvi", x: 38, y: 46, color: "#ffc8b1", title: "TD" },
  { id: 3, name: "Kajal", x: 24, y: 79, color: "#c9b5ff", title: "KK" },
  { id: 4, name: "Sai Kiran", x: 71, y: 72, color: "#8dc5ff", title: "SK" },
  { id: 5, name: "Bhavesh", x: 56, y: 46, color: "#afefc7", title: "BH" },
  { id: 6, name: "You", x: 50, y: 75, color: "#7dc2ff", title: "YOU" },
];

function VirtualOffice({ users = roomUsers, selectedMemberId, onSelectMember }) {
  return (
    <div className="office-map" role="img" aria-label="Virtual office floor plan">
      <div className="room meeting-room">
        <span className="room-label">Meeting Room</span>
        <div className="meeting-table">
          <div className="meeting-chair top" />
          <div className="meeting-chair bottom" />
          <div className="meeting-chair left" />
          <div className="meeting-chair right" />
          <span>◉</span>
        </div>
        <div className="plant plant-one">🌿</div>
      </div>

      <div className="room lounge-room">
        <span className="room-label">Lounge</span>
        <div className="sofa">▰ ▰ ▰</div>
        <div className="coffee-table">☕</div>
        <span className="plant">🪴</span>
      </div>

      <div className="room focus-room">
        <span className="room-label">Focus Zone</span>
        {[1, 2, 3].map((item) => (
          <div className="focus-desk" key={item}>
            <div className="monitor">▣</div>
            <div className="desk-chair">▰</div>
          </div>
        ))}
      </div>

      <div className="central-sign">
        <div className="brand-icon">◉</div>
        <div>
          <strong>ProxiSpeak</strong>
          <small>Work · Talk · Connect</small>
        </div>
      </div>

      <div className="workstation workstation-one">
        <span>▣</span>
        <span>▣</span>
        <small>Workstation</small>
      </div>

      <div className="workstation workstation-two">
        <span>▣</span>
        <span>▣</span>
        <small>Workstation</small>
      </div>

      <div className="workstation workstation-three">
        <span>▣</span>
        <small>Workstation</small>
      </div>

      <div className="room pantry-room">
        <span className="room-label">Pantry</span>
        <span className="pantry-icon">☕</span>
        <span>🥤</span>
      </div>

      <span className="decor plant-a">🪴</span>
      <span className="decor plant-b">🌿</span>
      <span className="decor plant-c">🪴</span>
      <span className="decor plant-d">🌿</span>

      {users.map((user) => (
        <button
          key={user.id}
          type="button"
          className={selectedMemberId === user.id ? "avatar-marker avatar-selected" : "avatar-marker"}
          style={{ left: `${user.x}%`, top: `${user.y}%` }}
          onClick={() => onSelectMember && onSelectMember(user.id)}
          title={user.name}
        >
          <div className="avatar-circle" style={{ background: user.color }}>
            {user.title}
          </div>
          <div className="avatar-name">{user.name}</div>
          <span className="avatar-status" />
        </button>
      ))}

      <div className="player-marker" style={{ left: "50%", top: "75%" }}>
        <div className="player-glow">
          <div className="player-avatar">YOU</div>
        </div>
      </div>

      <div className="map-instruction">Double-click anywhere to move</div>
    </div>
  );
}

export default VirtualOffice;
