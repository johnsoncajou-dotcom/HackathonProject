import assert from "node:assert/strict";
import test from "node:test";
import { getBestMove, getMoveFeedback, getWinChance } from "./gameCoach.js";

// Exercise end-game values, both coaching models, and feedback for a player's chosen move.
test("returns the exact win chance for a completed win", () => {
  assert.equal(getWinChance(["X", "X", "X", "O", "O", null, null, null, null], "O", "X"), 1);
});

test("returns zero win chance for a completed draw", () => {
  assert.equal(getWinChance(["X", "O", "X", "X", "O", "O", "O", "X", "X"], "X", "X"), 0);
});

test("does not overstate the opening win chance against random play", () => {
  const suggestion = getBestMove(Array(9).fill(null), "X");

  assert.equal(suggestion.index, 0);
  assert.ok(suggestion.winChance > 0);
  assert.ok(suggestion.winChance < 1);
});

test("normal suggestions never lose against perfect play", () => {
  const board = Array(9).fill(null);
  const suggestion = getBestMove(board, "X", "normal");
  const feedback = getMoveFeedback(board, suggestion.index, "X", "normal");

  assert.equal(suggestion.outcome, 0);
  assert.equal(feedback.playedOutcome, 0);
  assert.match(feedback.message, /perfect play/);
});

test("rejects difficulties without an available coach", () => {
  assert.throws(() => getBestMove(Array(9).fill(null), "X", "hard"), /Unknown coach difficulty/);
  assert.throws(() => getMoveFeedback(Array(9).fill(null), 0, "X", "expert"), /Unknown coach difficulty/);
});

test("recognizes an immediate winning move", () => {
  const feedback = getMoveFeedback(["X", "X", null, "O", "O", null, null, null, null], 2, "X");

  assert.equal(feedback.playedWinChance, 1);
  assert.equal(feedback.bestMove.index, 2);
  assert.match(feedback.message, /winning move/);
});

test("identifies the best square when a move has a lower win chance", () => {
  const feedback = getMoveFeedback(["X", null, null, "O", "O", null, null, null, "X"], 1, "X");

  assert.equal(feedback.bestMove.index, 5);
  assert.ok(feedback.bestMove.winChance > feedback.playedWinChance);
  assert.match(feedback.message, /square 6/);
});

test("uses the supplied board and turn without mutating the board", () => {
  const board = Array(9).fill(null);
  const original = [...board];

  getWinChance(board, "X", "X");

  assert.deepEqual(board, original);
});
