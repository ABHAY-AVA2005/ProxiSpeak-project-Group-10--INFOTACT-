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

    s.on('users:list', (list) => {
      const map = new Map();
      list.forEach((u) => map.set(u.socketId, u));
      setUsers(map);
    });

    s.on('user:joined', (user) => {
      setUsers((prev) => new Map(prev).set(user.socketId, user));
    });

    s.on('user:left', ({ socketId }) => {
      setUsers((prev) => {
        const next = new Map(prev);
        next.delete(socketId);
        return next;
      });
    });

    return () => {
      s.disconnect();
    };
  }, [username]);

  const sendMove = useCallback((x, y) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('move', { x, y });
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
