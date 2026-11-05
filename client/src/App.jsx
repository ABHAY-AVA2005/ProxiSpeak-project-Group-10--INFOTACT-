import { useMemo, useState } from "react";
import VirtualOffice from "./VirtualOffice";

const navItems = ["Office", "Team", "Chat", "Meetings", "Settings"];

const memberList = [
  { id: 1, name: "Abhishek Bhalla", status: "In Office · Near You", color: "#f7d37e", initials: "AB" },
  { id: 2, name: "Tanvi Dighe", status: "In Office · 12m ago", color: "#f4b4ae", initials: "TD" },
  { id: 3, name: "Kajal Kumari Singh", status: "In Office · 14m ago", color: "#9bd7c7", initials: "KS" },
  { id: 4, name: "Sai Kiran Goudavarthi", status: "In Office · 20m ago", color: "#a6b2ff", initials: "SK" },
  { id: 5, name: "Ganesh Dharavath", status: "In Office · 25m ago", color: "#f0b6e5", initials: "GD" },
  { id: 6, name: "Rohit Sharma", status: "In Office · 30m ago", color: "#f1c48a", initials: "RS" },
  { id: 7, name: "Harsha Vardhan", status: "In Office · 32m ago", color: "#d1b1ff", initials: "HV" },
  { id: 8, name: "Deepika Reddy", status: "In Office · 40m ago", color: "#9fd8ff", initials: "DR" },
  { id: 9, name: "Venkatesh", status: "In Office · 42m ago", color: "#c2d8a8", initials: "V" },
];

const roomUsers = [
  { id: 1, name: "Abhishek", x: 18, y: 58, color: "#8ae3d8", title: "AB" },
  { id: 2, name: "Tanvi", x: 38, y: 46, color: "#ffc8b1", title: "TD" },
  { id: 3, name: "Kajal", x: 24, y: 79, color: "#c9b5ff", title: "KK" },
  { id: 4, name: "Sai Kiran", x: 71, y: 72, color: "#8dc5ff", title: "SK" },
  { id: 5, name: "Bhavesh", x: 56, y: 46, color: "#afefc7", title: "BH" },
  { id: 6, name: "You", x: 50, y: 75, color: "#7dc2ff", title: "YOU" },
];

function App() {
  const [activeTab, setActiveTab] = useState("Office");
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(memberList[0].id);

  const filteredMembers = useMemo(() => {
    return memberList.filter((member) =>
      member.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  return (
    <div className="proxi-app">
      <aside className="sidebar">
        <div className="brand" aria-label="ProxiSpeak brand">
          <div className="brand-icon">◉</div>
          <h2>ProxiSpeak</h2>
          <span>Virtual Office</span>
        </div>

        <nav className="navigation" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item}
              className={activeTab === item ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setActiveTab(item)}
            >
              <span>{item === "Office" ? "⌂" : item === "Team" ? "◉" : item === "Chat" ? "◌" : item === "Meetings" ? "▣" : "⚙"}</span>
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="online-card">
            <div className="online-indicator" />
            <div>
              <strong>You&apos;re Online</strong>
              <small>In Office · Floor 1</small>
            </div>
          </div>

          <div className="sidebar-promo">
            <strong>Build. Connect. Grow.</strong>
            <div className="promo-wave">▁▂▃▄▅▆▇</div>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="team-selector" type="button">● Team Alpha ▾</button>
            <div className="online-count">◉ 50 Online</div>
          </div>

          <div className="topbar-right">
            <button className="round-icon" type="button" aria-label="Search">⌕</button>
            <button className="round-icon notification" type="button" aria-label="Notifications">◔</button>
            <button className="profile-button" type="button" aria-label="Profile">A</button>
          </div>
        </header>

        <section className="workspace">
          <div className="office-board">
            <VirtualOffice users={roomUsers} selectedMemberId={selectedMember} onSelectMember={setSelectedMember} />

            <aside className="team-panel">
              <div className="panel-heading">
                <div>
                  <span className="team-icon">◉</span>
                  <strong>Online Users (50)</strong>
                </div>
              </div>

              <input
                className="team-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teammates..."
                aria-label="Search users"
              />

              <div className="team-list">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={selectedMember === member.id ? "team-member active" : "team-member"}
                    onClick={() => setSelectedMember(member.id)}
                  >
                    <div className="team-avatar" style={{ background: member.color }}>{member.initials}</div>
                    <div className="team-member-info">
                      <strong>{member.name}</strong>
                      <small>{member.status}</small>
                    </div>
                    <span className="member-online" />
                  </button>
                ))}
              </div>
            </aside>
          </div>

          <div className="bottom-area">
            <div className="voice-controls" aria-label="Voice controls">
              <button className="control-button mic" type="button">◉</button>
              <button className="control-button" type="button">◍</button>
              <div className="proximity-control">
                <span>Proximity: 100px</span>
                <select defaultValue="100px" aria-label="Proximity range">
                  <option value="50px">50px</option>
                  <option value="100px">100px</option>
                  <option value="150px">150px</option>
                  <option value="200px">200px</option>
                </select>
              </div>
              <button className="control-button" type="button">◐</button>
              <button className="control-button hangup" type="button">✆</button>
            </div>

            <div className="nearby-panel">
              <div className="sound-wave">▤▤▤</div>
              <div>
                <strong>Nearby Voices</strong>
                <small>3 people</small>
              </div>
              <div className="nearby-arrow">▴</div>
            </div>
          </div>

          <div className="office-footer">
            <span>Meeting Room</span>
            <span>Focus Zone</span>
            <span>Lounge</span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;