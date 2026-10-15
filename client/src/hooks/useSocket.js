import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

export function useSocket(username) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [myId, setMyId] = useState(null);
  const [users, setUsers] = useState(new Map());

  useEffect(() => {
    if (!username) return;

    const s = io(SERVER_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });
    socketRef.current = s;

    s.on('connect', () => {
      setIsConnected(true);
      setMyId(s.id);
      // join with starting coordinates matching server default (100, 100)
      s.emit('join', { username, x: 100, y: 100 });
    });

    s.on('disconnect', () => {
      setIsConnected(false);
      setMyId(null);
      setUsers(new Map());
    });

    // 1. Snapshot of players (supports users:list and legacy current-players)
    const handleUsersList = (players) => {
      const map = new Map();
      const list = Array.isArray(players) ? players : Object.values(players || {});
      list.forEach((u) => {
        const id = u.socketId || u.id;
        if (id && id !== s.id) {
          map.set(id, {
            socketId: id,
            id,
            username: u.username || `User_${id.slice(0, 4)}`,
            x: u.x,
            y: u.y,
          });
        }
      });
      setUsers(map);
    };
    s.on('users:list', handleUsersList);
    s.on('current-players', handleUsersList);

    // 2. New player joined (supports user:joined and legacy player-joined)
    const handleUserJoined = (user) => {
      const id = user.socketId || user.id;
      if (id && id !== s.id) {
        setUsers((prev) => {
          const next = new Map(prev);
          next.set(id, {
            socketId: id,
            id,
            username: user.username || `User_${id.slice(0, 4)}`,
            x: user.x,
            y: user.y,
          });
          return next;
        });
      }
    };
    s.on('user:joined', handleUserJoined);
    s.on('player-joined', handleUserJoined);

    // 3. Player moved (supports user:moved and legacy player-moved)
    const handleUserMoved = (coords) => {
      const id = coords.socketId || coords.id;
      if (!id || id === s.id) return;
      setUsers((prev) => {
        const current = prev.get(id);
        if (!current) return prev;
        const next = new Map(prev);
        next.set(id, {
          ...current,
          x: coords.x,
          y: coords.y,
        });
        return next;
      });
    };
    s.on('user:moved', handleUserMoved);
    s.on('player-moved', handleUserMoved);

    // 4. Player disconnected (supports user:left and legacy player-disconnected)
    const handleUserLeft = (data) => {
      const id = typeof data === 'object' && data !== null ? (data.socketId || data.id) : data;
      if (!id) return;
      setUsers((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    };
    s.on('user:left', handleUserLeft);
    s.on('player-disconnected', handleUserLeft);

    return () => {
      s.disconnect();
    };
  }, [username]);

  const sendMove = useCallback((x, y) => {
    if (socketRef.current && isConnected) {
      // Emit standardized 'move' and legacy 'player-move' for dual-compatibility
      socketRef.current.emit('move', { x, y });
      socketRef.current.emit('player-move', { x, y });
    }
  }, [isConnected]);

  return {
    socket: socketRef.current,
    isConnected,
    myId,
    users,
    sendMove,
  };
}
