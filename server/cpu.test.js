import assert from "node:assert/strict";
import test from "node:test";
import { getCpuMove } from "./cpu.js";

test("easy CPU chooses an open square", () => {
  const board = ["X", null, "O", null, "X", null, null, null, null];
  const move = getCpuMove(board, "easy");

  assert.equal(board[move], null);
});

test("normal CPU takes an immediate winning move", () => {
  const board = ["O", "O", null, "X", "X", null, null, null, null];

  assert.equal(getCpuMove(board, "normal"), 2);
});

test("normal CPU blocks an immediate human win", () => {
  const board = ["X", "X", null, "O", null, null, null, null, null];

  assert.equal(getCpuMove(board, "normal"), 2);
});

test("hard CPU takes an immediate winning move", () => {
  const board = ["O", "O", null, null, "X", null, null, null, "X"];

  assert.equal(getCpuMove(board, "hard"), 2);
});

test("hard CPU blocks an immediate human win", () => {
  const board = ["X", "X", null, "O", null, null, null, null, null];

  assert.equal(getCpuMove(board, "hard"), 2);
});

test("hard CPU cannot be forced to lose from any reachable position", () => {
  // Explore every human continuation while allowing the CPU to choose its minimax response.
  const winningLines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const visited = new Set();

  function winner(board) {
    const line = winningLines.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]);
    return line ? board[line[0]] : null;
  }

  function explore(board, turn) {
    const key = `${board.map((cell) => cell ?? "-").join("")}:${turn}`;
    if (visited.has(key)) return;
    visited.add(key);

    const result = winner(board);
    if (result) {
      assert.notEqual(result, "X");
      return;
    }
    if (board.every(Boolean)) return;

    if (turn === "O") {
      const index = getCpuMove(board, "hard");
      assert.ok(Number.isInteger(index));
      const nextBoard = [...board];
      nextBoard[index] = "O";
      explore(nextBoard, "X");
      return;
    }

    for (let index = 0; index < board.length; index += 1) {
      if (board[index]) continue;
      const nextBoard = [...board];
      nextBoard[index] = "X";
      explore(nextBoard, "O");
    }
  }

  explore(Array(9).fill(null), "X");
});

test("returns no move for a full board", () => {
  const board = ["X", "O", "X", "X", "O", "O", "O", "X", "X"];

  assert.equal(getCpuMove(board, "hard"), null);
});

test("rejects an unknown CPU difficulty", () => {
  assert.throws(() => getCpuMove(Array(9).fill(null), "expert"), /Unknown CPU difficulty/);
});
