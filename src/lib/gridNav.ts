/**
 * Position reached from `id` with an arrow key, in a grid of visual rows (month groups may end
 * with a short row). ←/→ walk the flat order across rows; ↑/↓ keep the column, clamped to the
 * length of the target row. Returns null at the edges: navigation never wraps.
 */
export function gridNeighbour<T extends { id: string }>(
  rows: T[][],
  id: string,
  key: string,
): [row: number, col: number] | null {
  const r = rows.findIndex(row => row.some(item => item.id === id));
  if (r === -1) return null;
  const c = rows[r].findIndex(item => item.id === id);

  switch (key) {
    case 'ArrowLeft':
      if (c > 0) return [r, c - 1];
      return r > 0 ? [r - 1, rows[r - 1].length - 1] : null;
    case 'ArrowRight':
      if (c < rows[r].length - 1) return [r, c + 1];
      return r < rows.length - 1 ? [r + 1, 0] : null;
    case 'ArrowUp':
      return r > 0 ? [r - 1, Math.min(c, rows[r - 1].length - 1)] : null;
    case 'ArrowDown':
      return r < rows.length - 1 ? [r + 1, Math.min(c, rows[r + 1].length - 1)] : null;
    default:
      return null;
  }
}
