import { useMemo, useRef, useState } from "react";

const COLORS = ["#0f172a", "#ffffff", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#f472b6"];
const HISTORY_LIMIT = 20;

const INITIAL_STROKES = [
  { id: 1, kind: "freehand", tool: "pen", color: "#7c3aed", width: 4, points: [{ x: 110, y: 80 }, { x: 220, y: 105 }, { x: 310, y: 95 }, { x: 430, y: 128 }] },
  { id: 2, kind: "freehand", tool: "pen", color: "#10b981", width: 4, points: [{ x: 120, y: 200 }, { x: 260, y: 186 }, { x: 360, y: 240 }, { x: 520, y: 230 }] },
];

const INITIAL_NOTES = [
  { id: 1, text: "Launch plan", tone: "#fde68a" },
  { id: 2, text: "Need stronger onboarding", tone: "#bfdbfe" },
  { id: 3, text: "Finalize spatial audio demo", tone: "#bbf7d0" },
];

export function CollaborativeWhiteboard() {
  const boardRef = useRef(null);
  const strokesRef = useRef(INITIAL_STROKES);
  const notesRef = useRef(INITIAL_NOTES);
  const activeStrokeRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#0f172a");
  const [strokes, setStrokes] = useState(INITIAL_STROKES);
  const [notes, setNotes] = useState(INITIAL_NOTES);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  strokesRef.current = strokes;
  notesRef.current = notes;

  const commitSnapshot = () => {
    setHistory((current) => [...current.slice(-(HISTORY_LIMIT - 1)), { strokes: [...strokesRef.current], notes: [...notesRef.current] }]);
    setRedoStack([]);
  };

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

    if (tool === "eraser" || tool === "pen" || tool === "rect" || tool === "circle" || tool === "line") {
      commitSnapshot();
    }

    const isShapeTool = tool === "rect" || tool === "circle" || tool === "line";
    const nextStroke = {
      id: Date.now(),
      kind: isShapeTool ? tool : "freehand",
      tool,
      color: tool === "eraser" ? "#ffffff" : color,
      width: tool === "eraser" ? 18 : 4,
      points: !isShapeTool ? [point] : [],
      start: isShapeTool ? point : null,
      end: isShapeTool ? point : null,
    };

    activeStrokeRef.current = nextStroke.id;
    setStrokes((current) => [...current, nextStroke]);
  };

  const moveDrawing = (event) => {
    const point = boardPoint(event);
    if (!point || !activeStrokeRef.current) return;

    setStrokes((current) =>
      current.map((stroke) => {
        if (stroke.id !== activeStrokeRef.current) return stroke;
        if (stroke.kind === "freehand") {
          return { ...stroke, points: [...stroke.points, point] };
        }
        return { ...stroke, end: point };
      })
    );
  };

  const endDrawing = () => {
    if (!activeStrokeRef.current) return;
    const lastStroke = strokesRef.current[strokesRef.current.length - 1];
    if (lastStroke && lastStroke.kind === "freehand" && lastStroke.points.length < 2) {
      setStrokes((current) => current.slice(0, -1));
    }
    activeStrokeRef.current = null;
  };

  const clearBoard = () => {
    commitSnapshot();
    setStrokes([]);
  };

  const addNote = () => {
    commitSnapshot();
    const nextLabel = `Idea ${notesRef.current.length + 1}`;
    setNotes((current) => [...current, { id: Date.now(), text: nextLabel, tone: ["#fde68a", "#bfdbfe", "#bbf7d0", "#fbcfe8"][current.length % 4] }]);
  };

  const deleteNote = (noteId) => {
    commitSnapshot();
    setNotes((current) => current.filter((note) => note.id !== noteId));
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((current) => [{ strokes: [...strokesRef.current], notes: [...notesRef.current] }, ...current].slice(0, HISTORY_LIMIT));
    setHistory((current) => current.slice(0, -1));
    setStrokes(previous.strokes);
    setNotes(previous.notes);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory((current) => [...current.slice(-(HISTORY_LIMIT - 1)), { strokes: [...strokesRef.current], notes: [...notesRef.current] }]);
    setRedoStack((current) => current.slice(1));
    setStrokes(next.strokes);
    setNotes(next.notes);
  };

  const whiteboardSummary = useMemo(() => `${strokes.length} drawing strokes • ${notes.length} notes`, [notes.length, strokes.length]);

  const renderStrokeShape = (stroke) => {
    if (stroke.kind === "freehand") {
      return (
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
      );
    }

    if (!stroke.start || !stroke.end) return null;

    const x = Math.min(stroke.start.x, stroke.end.x);
    const y = Math.min(stroke.start.y, stroke.end.y);
    const width = Math.abs(stroke.end.x - stroke.start.x);
    const height = Math.abs(stroke.end.y - stroke.start.y);

    if (stroke.kind === "rect") {
      return <rect key={stroke.id} x={x} y={y} width={width} height={height} fill="none" stroke={stroke.color} strokeWidth={stroke.width} />;
    }

    if (stroke.kind === "circle") {
      const radiusX = width / 2;
      const radiusY = height / 2;
      return <ellipse key={stroke.id} cx={stroke.start.x} cy={stroke.start.y} rx={radiusX} ry={radiusY} fill="none" stroke={stroke.color} strokeWidth={stroke.width} />;
    }

    return <line key={stroke.id} x1={stroke.start.x} y1={stroke.start.y} x2={stroke.end.x} y2={stroke.end.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />;
  };

  return (
    <div className="workspace-card whiteboard-card">
      <div className="card-header-row">
        <h2>Brainstorming Room</h2>
        <span>{whiteboardSummary}</span>
      </div>

      <div className="whiteboard-shell">
        <div className="whiteboard-toolbar">
          <div className="tool-group">
            {[
              ["pen", "Pen"],
              ["eraser", "Eraser"],
              ["rect", "Rect"],
              ["circle", "Circle"],
              ["line", "Line"],
            ].map(([value, label]) => (
              <button key={value} type="button" className={tool === value ? "tool-selected" : ""} onClick={() => setTool(value)}>{label}</button>
            ))}
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

          <button type="button" className="clear-button" onClick={clearBoard}>Clear</button>
          <button type="button" className="clear-button" onClick={undo} disabled={history.length === 0}>Undo</button>
          <button type="button" className="clear-button" onClick={redo} disabled={redoStack.length === 0}>Redo</button>
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
            onPointerUp={endDrawing}
            onPointerLeave={endDrawing}
          >
            <rect x="0" y="0" width="800" height="420" fill="#f8fafc" rx="22" />
            <g>
              {strokes.map((stroke) => renderStrokeShape(stroke))}
            </g>
          </svg>

          <div className="whiteboard-notes">
            {notes.map((note) => (
              <div key={note.id} className="sticky-note" style={{ background: note.tone }}>
                <button type="button" className="note-delete" aria-label={`Delete ${note.text}`} onClick={() => deleteNote(note.id)}>×</button>
                <span>{note.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
