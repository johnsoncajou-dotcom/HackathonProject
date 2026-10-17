import { randomInt } from "node:crypto";

const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const preferredCells = [4, 0, 2, 6, 8, 1, 3, 5, 7];

function getWinner(board) {
  for (const [first, second, third] of winningLines) {
    if (board[first] && board[first] === board[second] && board[first] === board[third]) {
      return board[first];
    }
  }
  return null;
}

function findWinningMove(board, symbol) {
  // Reuse the same winning-line check for both CPU wins and defensive blocks.
  return board.findIndex((cell, index) => {
    if (cell) return false;
    const nextBoard = [...board];
    nextBoard[index] = symbol;
    return getWinner(nextBoard) === symbol;
  });
}

function chooseRandom(cells) {
  return cells.length ? cells[randomInt(cells.length)] : null;
}

function getEasyMove(board) {
  // Easy intentionally makes no tactical checks and samples every open square equally.
  return chooseRandom(board.flatMap((cell, index) => cell ? [] : [index]));
}

function getNormalMove(board) {
  // Normal checks immediate tactics first, then prefers strong opening positions.
  const win = findWinningMove(board, "O");
  if (win !== -1) return win;

  const block = findWinningMove(board, "X");
  if (block !== -1) return block;

  if (!board[4]) return 4;

  const openCorners = [0, 2, 6, 8].filter((index) => !board[index]);
  if (openCorners.length) return chooseRandom(openCorners);

  return chooseRandom([1, 3, 5, 7].filter((index) => !board[index]));
}

function getHardMove(board) {
  // Minimax scores wins sooner and delays losses while assuming optimal replies.
  function evaluate(position, turn, depth) {
    const winner = getWinner(position);
    if (winner === "O") return 10 - depth;
    if (winner === "X") return depth - 10;

    const availableCells = position.flatMap((cell, index) => cell ? [] : [index]);
    if (availableCells.length === 0) return 0;

    const scores = availableCells.map((index) => {
      const nextPosition = [...position];
      nextPosition[index] = turn;
      return evaluate(nextPosition, turn === "O" ? "X" : "O", depth + 1);
    });

    return turn === "O" ? Math.max(...scores) : Math.min(...scores);
  }

  let bestMove = null;
  let bestScore = -Infinity;

  // Try preferred positions first so equally strong moves produce predictable play.
  for (const index of preferredCells) {
    if (board[index]) continue;
    const nextBoard = [...board];
    nextBoard[index] = "O";
    const score = evaluate(nextBoard, "X", 1);

    if (score > bestScore) {
      bestMove = index;
      bestScore = score;
    }
  }

  return bestMove;
}

export function getCpuMove(board, difficulty) {
  // A full board has no legal response; unknown modes are programmer/configuration errors.
  if (!Array.isArray(board) || board.length !== 9 || !board.includes(null)) return null;

  if (difficulty === "easy") return getEasyMove(board);
  if (difficulty === "normal") return getNormalMove(board);
  if (difficulty === "hard") return getHardMove(board);

  throw new Error(`Unknown CPU difficulty: ${difficulty}`);
}
