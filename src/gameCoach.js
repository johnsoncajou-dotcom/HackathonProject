const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const preferredCells = [4, 0, 2, 6, 8, 1, 3, 5, 7];

// Coaching is available only in Easy and Normal; Hard intentionally has no coach.
function validateDifficulty(difficulty) {
  if (difficulty !== "easy" && difficulty !== "normal") {
    throw new Error(`Unknown coach difficulty: ${difficulty}`);
  }
}

function getWinner(board) {
  for (const [first, second, third] of winningLines) {
    if (board[first] && board[first] === board[second] && board[first] === board[third]) {
      return board[first];
    }
  }
  return null;
}

function createWinChanceCalculator(targetSymbol) {
  // Cache each board-and-turn probability because many move paths reach the same position.
  const memo = new Map();

  function calculate(board, turn) {
    const winner = getWinner(board);
    if (winner) return winner === targetSymbol ? 1 : 0;

    const availableCells = board.flatMap((cell, index) => cell ? [] : [index]);
    if (availableCells.length === 0) return 0;

    const key = `${board.map((cell) => cell ?? "-").join("")}:${turn}`;
    if (memo.has(key)) return memo.get(key);

    const nextTurn = turn === "X" ? "O" : "X";
    const chances = availableCells.map((index) => {
      const nextBoard = [...board];
      nextBoard[index] = turn;
      return calculate(nextBoard, nextTurn);
    });
    // The coached player chooses the best result; the opponent is modeled as random.
    const chance = turn === targetSymbol
      ? Math.max(...chances)
      : chances.reduce((total, value) => total + value, 0) / chances.length;

    memo.set(key, chance);
    return chance;
  }

  return calculate;
}

export function getBestMove(board, playerSymbol, difficulty = "easy") {
  validateDifficulty(difficulty);
  if (difficulty === "normal") return getNormalBestMove(board, playerSymbol);

  // Easy maximizes the player's result while averaging over random opponent choices.
  const calculate = createWinChanceCalculator(playerSymbol);
  const nextTurn = playerSymbol === "X" ? "O" : "X";
  let bestMove = null;

  for (const index of preferredCells) {
    if (board[index]) continue;

    const nextBoard = [...board];
    nextBoard[index] = playerSymbol;
    if (getWinner(nextBoard) === playerSymbol) {
      return { index, winChance: 1 };
    }

    const winChance = calculate(nextBoard, nextTurn);

    if (!bestMove || winChance > bestMove.winChance) {
      bestMove = { index, winChance };
    }
  }

  return bestMove;
}

function createPerfectPlayEvaluator(targetSymbol) {
  // A memoized minimax evaluator returns 1 for a win, 0 for a draw, and -1 for a loss.
  const memo = new Map();

  function evaluate(board, turn) {
    const winner = getWinner(board);
    if (winner) return winner === targetSymbol ? 1 : -1;

    const availableCells = board.flatMap((cell, index) => cell ? [] : [index]);
    if (availableCells.length === 0) return 0;

    const key = `${board.map((cell) => cell ?? "-").join("")}:${turn}`;
    if (memo.has(key)) return memo.get(key);

    const nextTurn = turn === "X" ? "O" : "X";
    const outcomes = availableCells.map((index) => {
      const nextBoard = [...board];
      nextBoard[index] = turn;
      return evaluate(nextBoard, nextTurn);
    });
    // Both sides choose their best outcome, producing perfect-play win/draw/loss advice.
    const outcome = turn === targetSymbol ? Math.max(...outcomes) : Math.min(...outcomes);

    memo.set(key, outcome);
    return outcome;
  }

  return evaluate;
}

function getPerfectPlayOutcome(board, turn, playerSymbol) {
  return createPerfectPlayEvaluator(playerSymbol)(board, turn);
}

function getNormalBestMove(board, playerSymbol) {
  const nextTurn = playerSymbol === "X" ? "O" : "X";
  const evaluate = createPerfectPlayEvaluator(playerSymbol);
  let bestMove = null;

  // Keep the first equally strong move to make recommendations consistent.
  for (const index of preferredCells) {
    if (board[index]) continue;

    const nextBoard = [...board];
    nextBoard[index] = playerSymbol;
    // Minimax weighs a guaranteed win above a draw and a draw above a loss.
    const outcome = evaluate(nextBoard, nextTurn);

    if (!bestMove || outcome > bestMove.outcome) {
      bestMove = { index, outcome };
    }
  }

  return bestMove;
}

export function getWinChance(board, turn, playerSymbol) {
  // Expose the coach's random-opponent estimate for a particular turn and board.
  return createWinChanceCalculator(playerSymbol)(board, turn);
}

export function getMoveFeedback(boardBeforeMove, moveIndex, playerSymbol, difficulty = "easy") {
  validateDifficulty(difficulty);
  // Compare the submitted move with the best alternative available in that same position.
  if (difficulty === "normal") {
    const bestMove = getNormalBestMove(boardBeforeMove, playerSymbol);
    const playedBoard = [...boardBeforeMove];
    playedBoard[moveIndex] = playerSymbol;
    const nextTurn = playerSymbol === "X" ? "O" : "X";
    const playedOutcome = getPerfectPlayOutcome(playedBoard, nextTurn, playerSymbol);
    const won = getWinner(playedBoard) === playerSymbol;

    if (won) {
      return {
        message: "Great finish—you spotted the winning move.",
        playedOutcome,
        bestMove: { index: moveIndex, outcome: playedOutcome },
      };
    }

    if (!bestMove || playedOutcome >= bestMove.outcome) {
      return {
        message: "Strong move—you chose one of your best options against perfect play.",
        playedOutcome,
        bestMove,
      };
    }

    return {
      message: `A stronger move was square ${bestMove.index + 1}. It protects against your opponent's best reply.`,
      playedOutcome,
      bestMove,
    };
  }

  const nextTurn = playerSymbol === "X" ? "O" : "X";
  const bestMove = getBestMove(boardBeforeMove, playerSymbol);
  const playedBoard = [...boardBeforeMove];
  playedBoard[moveIndex] = playerSymbol;
  const playedWinChance = getWinChance(playedBoard, nextTurn, playerSymbol);
  const won = getWinner(playedBoard) === playerSymbol;

  if (won) {
    return {
      message: "Great finish—you spotted the winning move.",
      playedWinChance,
      bestMove: { index: moveIndex, winChance: playedWinChance },
    };
  }

  if (!bestMove || playedWinChance >= bestMove.winChance - 1e-9) {
    return {
      message: "Strong move—you chose one of your best options.",
      playedWinChance,
      bestMove,
    };
  }

  return {
    message: `A better option was square ${bestMove.index + 1}. It gives about ${Math.round(bestMove.winChance * 100)}% estimated win chance, versus ${Math.round(playedWinChance * 100)}% after your move.`,
    playedWinChance,
    bestMove,
  };
}
