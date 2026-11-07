import { useMemo, useRef, useState } from "react";

const COLORS = ["#0f172a", "#ffffff", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];

const initialItems = [
  {
    id: 1,
    type: "stroke",
    tool: "pen",
    color: "#7c3aed",
    width: 4,
    points: [{ x: 110, y: 80 }, { x: 220, y: 105 }, { x: 310, y: 95 }, { x: 430, y: 128 }],
  },
  {
    id: 2,
    type: "stroke",
    tool: "pen",
    color: "#10b981",
    width: 4,
    points: [{ x: 120, y: 200 }, { x: 260, y: 186 }, { x: 360, y: 240 }, { x: 520, y: 230 }],
  },
];

function clampPoint(point, width = 800, height = 420) {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  };
}

export function CollaborativeWhiteboard() {
  const boardRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#0f172a");
  const [items, setItems] = useState(initialItems);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [notes, setNotes] = useState([
    { id: 1, text: "Launch plan", tone: "#fde68a" },
    { id: 2, text: "Need stronger onboarding", tone: "#bfdbfe" },
    { id: 3, text: "Finalize spatial audio demo", tone: "#bbf7d0" },
  ]);
  const [draftItem, setDraftItem] = useState(null);

  const boardPoint = (event) => {
    const svg = boardRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 800,
      y: ((event.clientY - rect.top) / rect.height) * 420,
    };
  };

  const pushHistory = (currentItems) => {
    setHistory((prev) => [...prev, currentItems]);
    setRedoStack([]);
  };

  const commitItems = (nextItems) => {
    setItems(nextItems);
  };

  const startDrawing = (event) => {
    const point = clampPoint(boardPoint(event) || { x: 0, y: 0 });
    if (!point) return;

    if (tool === "pen" || tool === "eraser") {
      const nextStroke = {
        id: Date.now(),
        type: "stroke",
        tool,
        color: tool === "eraser" ? "#ffffff" : color,
        width: tool === "eraser" ? 20 : 4,
        points: [point],
      };

      setItems((current) => {
        pushHistory(current);
        return [...current, nextStroke];
      });
      setDraftItem(nextStroke);
      return;
    }

    const nextShape = {
      id: Date.now(),
      type: "shape",
      tool,
      color,
      width: 4,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
    };

    setItems((current) => {
      pushHistory(current);
      return [...current, nextShape];
    });
    setDraftItem(nextShape);
  };

  const moveDrawing = (event) => {
    const point = clampPoint(boardPoint(event) || { x: 0, y: 0 });
    if (!point || !draftItem) return;

    setItems((current) => {
      if (!current.length) return current;
      const next = current.map((item) => {
        if (item.id !== draftItem.id) return item;
        if (item.type === "stroke") {
          return { ...item, points: [...item.points, point] };
        }

        return {
          ...item,
          x2: point.x,
          y2: point.y,
        };
      });
      return next;
    });
  };

  const finishDrawing = () => {
    setDraftItem(null);
  };

  const undo = () => {
    setItems((current) => {
      if (!history.length) return current;
      const previous = history[history.length - 1];
      setRedoStack((prev) => [current, ...prev]);
      setHistory((prev) => prev.slice(0, -1));
      return previous;
    });
  };

  const redo = () => {
    setItems((current) => {
      if (!redoStack.length) return current;
      const next = redoStack[0];
      setHistory((prev) => [...prev, current]);
      setRedoStack((prev) => prev.slice(1));
      return next;
    });
  };

  const addNote = () => {
    const nextLabel = `Idea ${notes.length + 1}`;
    setNotes((current) => [...current, { id: Date.now(), text: nextLabel, tone: ["#fde68a", "#bfdbfe", "#bbf7d0", "#fbcfe8"][current.length % 4] }]);
  };

  const deleteNote = (id) => {
    setNotes((current) => current.filter((note) => note.id !== id));
  };

  const clearBoard = () => {
    if (!items.length) return;
    setHistory((prev) => [...prev, items]);
    setRedoStack([]);
    setItems([]);
  };

  const whiteboardSummary = useMemo(() => `${items.length} drawing items • ${notes.length} notes`, [items.length, notes.length]);

  const renderShape = (item) => {
    const x1 = item.x1;
    const y1 = item.y1;
    const x2 = item.x2;
    const y2 = item.y2;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    if (item.tool === "rect") {
      return <rect key={item.id} x={left} y={top} width={width} height={height} stroke={item.color} fill="none" strokeWidth={item.width} strokeLinecap="round" />;
    }

    if (item.tool === "circle") {
      return <ellipse key={item.id} cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.max(width / 2, 1)} ry={Math.max(height / 2, 1)} stroke={item.color} fill="none" strokeWidth={item.width} strokeLinecap="round" />;
    }

    return <line key={item.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={item.color} strokeWidth={item.width} strokeLinecap="round" />;
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
            <button type="button" className={tool === "pen" ? "tool-selected" : ""} onClick={() => setTool("pen")}>Pen</button>
            <button type="button" className={tool === "eraser" ? "tool-selected" : ""} onClick={() => setTool("eraser")}>Eraser</button>
            <button type="button" className={tool === "rect" ? "tool-selected" : ""} onClick={() => setTool("rect")}>Rect</button>
            <button type="button" className={tool === "circle" ? "tool-selected" : ""} onClick={() => setTool("circle")}>Circle</button>
            <button type="button" className={tool === "line" ? "tool-selected" : ""} onClick={() => setTool("line")}>Line</button>
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

          <div className="secondary-toolbar-group">
            <button type="button" className="clear-button" onClick={undo} disabled={!history.length}>Undo</button>
            <button type="button" className="clear-button" onClick={redo} disabled={!redoStack.length}>Redo</button>
            <button type="button" className="clear-button" onClick={clearBoard}>Clear</button>
            <button type="button" className="add-note-button" onClick={addNote}>Add note</button>
          </div>
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
            onPointerUp={finishDrawing}
            onPointerLeave={finishDrawing}
          >
            <rect x="0" y="0" width="800" height="420" fill="#f8fafc" rx="22" />
            <g>
              {items.map((item) => {
                if (item.type === "stroke") {
                  return (
                    <polyline
                      key={item.id}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={item.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={item.points.map((point) => `${point.x},${point.y}`).join(" ")}
                      opacity={item.tool === "eraser" ? 1 : 1}
                    />
                  );
                }

                return renderShape(item);
              })}
            </g>
          </svg>

          <div className="whiteboard-notes">
            {notes.map((note) => (
              <div key={note.id} className="sticky-note" style={{ background: note.tone }}>
                <span>{note.text}</span>
                <button type="button" className="note-delete" onClick={() => deleteNote(note.id)} aria-label={`Delete note ${note.text}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
