import React from 'react';
import { Menu, Users, Settings, LogOut, Search, Bell, Mic, Volume2, SlidersHorizontal, X } from 'lucide-react';
import './Header.css';

/** Header component with team selector, online count, search, notifications, profile dropdown */
export const Header = ({ onlineCount, username, avatarUrl, onProfileClick }) => {
  return (
    <header className="app-header glass">
      <div className="team-selector">Team Alpha</div>
      <div className="online-count">{onlineCount} online</div>
      <div className="header-actions">
        <button className="icon-btn" aria-label="Search"><Search size={20} /></button>
        <button className="icon-btn" aria-label="Notifications"><Bell size={20} /></button>
        <button className="profile-btn" onClick={onProfileClick} aria-label="Profile">
          <img src={avatarUrl || "https://api.dicebear.com/6.x/identicon/svg?seed=" + encodeURIComponent(username)} alt="profile" className="avatar" />
        </button>
      </div>
    </header>
  );
};

