// Canvas boundary constants (matching client/src/VirtualOffice.jsx dimensions: 1000 x 600)
const CANVAS_BOUNDS = {
    MIN_X: 0,
    MAX_X: 1000,
    MIN_Y: 0,
    MAX_Y: 600,
};

// Debounce configuration: wait 1000ms after last movement before writing to MongoDB
const DB_DEBOUNCE_MS = 1000;

// Defensive coordinate validation helper
function isValidCoordinate(x, y) {
    return (
        typeof x === "number" &&
        typeof y === "number" &&
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= CANVAS_BOUNDS.MIN_X &&
        x <= CANVAS_BOUNDS.MAX_X &&
        y >= CANVAS_BOUNDS.MIN_Y &&
        y <= CANVAS_BOUNDS.MAX_Y
    );
}

module.exports = {
    CANVAS_BOUNDS,
    DB_DEBOUNCE_MS,
    isValidCoordinate,
};
