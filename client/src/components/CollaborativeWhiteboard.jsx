import { useMemo, useRef, useState } from "react";

const COLORS = ["#0f172a", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];

export function CollaborativeWhiteboard() {
  const boardRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#0f172a");
  const [strokes, setStrokes] = useState([
    { id: 1, color: "#7c3aed", width: 4, points: [{ x: 110, y: 80 }, { x: 220, y: 105 }, { x: 310, y: 95 }, { x: 430, y: 128 }] },
    { id: 2, color: "#10b981", width: 4, points: [{ x: 120, y: 200 }, { x: 260, y: 186 }, { x: 360, y: 240 }, { x: 520, y: 230 }] },
  ]);
  const [notes, setNotes] = useState([
    { id: 1, text: "Launch plan", tone: "#fde68a" },
    { id: 2, text: "Need stronger onboarding", tone: "#bfdbfe" },
    { id: 3, text: "Finalize spatial audio demo", tone: "#bbf7d0" },
  ]);

  const boardPoint = (event) => {
    const svg = boardRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 800,
      y: ((event.clientY - rect.top) / rect.height) * 420,
    };
  };

  const startDrawing = (event) => {
    const point = boardPoint(event);
    if (!point) return;

    const nextStroke = {
      id: Date.now(),
      color,
      width: tool === "eraser" ? 18 : 4,
      points: [point],
    };

    setStrokes((current) => [...current, nextStroke]);
  };

  const moveDrawing = (event) => {
    const point = boardPoint(event);
    if (!point) return;
    setStrokes((current) => {
      if (!current.length) return current;
      const last = current[current.length - 1];
      return [
        ...current.slice(0, -1),
        {
          ...last,
          points: [...last.points, point],
        },
      ];
    });
  };

  const addNote = () => {
    const nextLabel = `Idea ${notes.length + 1}`;
    setNotes((current) => [...current, { id: Date.now(), text: nextLabel, tone: ["#fde68a", "#bfdbfe", "#bbf7d0", "#fbcfe8"][current.length % 4] }]);
  };

  const whiteboardSummary = useMemo(() => `${strokes.length} drawing strokes • ${notes.length} notes`, [notes.length, strokes.length]);

  return (
    <div className="workspace-card whiteboard-card">
      <div className="card-header-row">
        <h2>Brainstorming Room</h2>
        <span>{whiteboardSummary}</span>
      </div>

      <div className="whiteboard-shell">
        <div className="whiteboard-toolbar">
          <div className="tool-group">
            <button type="button" className={tool === "pen" ? "tool-selected" : ""} onClick={() => setTool("pen")}>Pen</button>
            <button type="button" className={tool === "eraser" ? "tool-selected" : ""} onClick={() => setTool("eraser")}>Eraser</button>
          </div>

          <div className="color-picker" aria-label="Select whiteboard color">
            {COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Choose ${swatch} stroke`}
                className={color === swatch ? "swatch selected" : "swatch"}
                style={{ background: swatch }}
                onClick={() => setColor(swatch)}
              />
            ))}
          </div>

          <button type="button" className="clear-button" onClick={() => setStrokes([])}>Clear</button>
          <button type="button" className="add-note-button" onClick={addNote}>Add note</button>
        </div>

        <div className="whiteboard-surface">
          <svg
            ref={boardRef}
            viewBox="0 0 800 420"
            className="whiteboard-svg"
            onPointerDown={startDrawing}
            onPointerMove={(event) => {
              if (event.buttons === 1) moveDrawing(event);
            }}
            onPointerUp={() => setStrokes((current) => current)}
          >
            <rect x="0" y="0" width="800" height="420" fill="#f8fafc" rx="22" />
            <g>
              {strokes.map((stroke) => (
                <polyline
                  key={stroke.id}
                  fill="none"
                  stroke={stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  opacity={stroke.width > 12 ? 0.55 : 1}
                />
              ))}
            </g>
          </svg>

          <div className="whiteboard-notes">
            {notes.map((note) => (
              <div key={note.id} className="sticky-note" style={{ background: note.tone }}>
                {note.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
