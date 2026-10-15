import { useState, useEffect, useRef, useCallback } from 'react';

// World map boundaries (matches server WORLD_BOUNDS in userManager.js: 0 to 2000)
const BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 2000,
  maxY: 2000,
};

export function useMovement({ startX = 100, startY = 100, onPositionChange, speed = 4 }) {
  const [coords, setCoords] = useState({ x: startX, y: startY });
  const destination = useRef(null);
  const activeKeys = useRef({});
  const lastEmit = useRef(0);

  // throttle socket emits to ~15 per sec
  const emitPosition = useCallback((x, y) => {
    const now = Date.now();
    if (now - lastEmit.current > 66) {
      lastEmit.current = now;
      if (onPositionChange) {
        onPositionChange(Math.round(x), Math.round(y));
      }
    }
  }, [onPositionChange]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
        activeKeys.current[k] = true;
        destination.current = null;
      }
    };

    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      delete activeKeys.current[k];
    };

    const onBlur = () => {
      activeKeys.current = {};
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    let frameId;

    const loop = () => {
      setCoords((prev) => {
        let { x, y } = prev;
        let didMove = false;

        let dx = 0;
        let dy = 0;

        if (activeKeys.current['w'] || activeKeys.current['arrowup']) dy -= speed;
        if (activeKeys.current['s'] || activeKeys.current['arrowdown']) dy += speed;
        if (activeKeys.current['a'] || activeKeys.current['arrowleft']) dx -= speed;
        if (activeKeys.current['d'] || activeKeys.current['arrowright']) dx += speed;

        if (dx !== 0 || dy !== 0) {
          x += dx;
          y += dy;
          didMove = true;
        } else if (destination.current) {
          // click to move interpolation
          const tx = destination.current.x;
          const ty = destination.current.y;
          const dist = Math.hypot(tx - x, ty - y);

          if (dist > speed) {
            x += ((tx - x) / dist) * speed;
            y += ((ty - y) / dist) * speed;
            didMove = true;
          } else {
            x = tx;
            y = ty;
            destination.current = null;
            didMove = true;
          }
        }

        // keep inside world bounds
        x = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, x));
        y = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, y));

        if (didMove) {
          emitPosition(x, y);
          return { x, y };
        }

        return prev;
      });

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [speed, emitPosition]);

  const setTarget = useCallback((targetX, targetY) => {
    destination.current = {
      x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, targetX)),
      y: Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, targetY)),
    };
  }, []);

  return {
    coords,
    setTarget,
  };
}
