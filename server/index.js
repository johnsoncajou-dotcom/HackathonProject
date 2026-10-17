import "dotenv/config";
import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { getCpuMove } from "./cpu.js";
import Match from "./models/Match.js";

const PORT = Number(process.env.PORT || 3001);
const MONGODB_URI = process.env.MONGODB_URI;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const rooms = new Map();
const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure MongoDB.");
}

const app = express();
// Keep the health route lightweight while exposing database readiness separately.
app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGIN } });

function publicRoom(room) {
  // Keep room state serializable and omit internal server-only details.
  return {
    code: room.code,
    board: room.board,
    moves: room.moves,
    gameType: room.gameType,
    difficulty: room.difficulty,
    players: room.players.map(({ id, name, symbol }) => ({ id, name, symbol })),
    turn: room.turn,
    winner: room.winner,
    status: room.status,
  };
}

function sendRoom(room) {
  // All room members receive the same authoritative snapshot after each state change.
  io.to(room.code).emit("room:state", publicRoom(room));
}

function emitError(socket, message) {
  socket.emit("room:error", message);
}

async function finishGame(room, winner) {
  // Mark it finished before the database write; clients still receive the finished state if saving fails.
  room.winner = winner;
  room.status = "finished";
  const result = winner ? "win" : "draw";
  try {
    await Match.create({
      roomCode: room.code,
      gameType: room.gameType,
      difficulty: room.difficulty,
      players: room.players.map(({ name, symbol }) => ({ name, symbol })),
      moves: room.moves,
      winner,
      result,
    });
    return null;
  } catch (error) {
    console.error("Unable to save completed match:", error);
    return "This round finished, but we couldn't save it. Please try again later.";
  }
}

function normalizeName(name) {
  // Treat display names as untrusted input and keep them small for the UI and database.
  return typeof name === "string" ? name.trim().slice(0, 18) : "";
}

function createRoomCode() {
  // Avoid ambiguous characters and retry the rare case of a code already in use.
  let code;
  do {
    code = Array.from({ length: 6 }, () => ROOM_CODE_CHARACTERS[randomInt(ROOM_CODE_CHARACTERS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

io.on("connection", (socket) => {
  // Friend rooms wait for a second socket; CPU rooms start immediately with the player as X.
  socket.on("room:create", (payload) => {
    const { name, difficulty, gameType = "friend" } = payload ?? {};
    const playerName = normalizeName(name);
    if (!playerName) return emitError(socket, "Enter a name before creating a room.");
    if (!["friend", "cpu"].includes(gameType)) {
      return emitError(socket, "Choose to play with a friend or against the CPU.");
    }
    if (!["easy", "normal", "hard"].includes(difficulty)) {
      return emitError(socket, "Choose an Easy, Normal, or Hard game mode.");
    }

    // Codes are generated server-side, and every board starts with X's turn.
    const code = createRoomCode();
    const room = {
      code,
      board: Array(9).fill(null),
      moves: [],
      gameType,
      difficulty,
      players: [{ id: socket.id, name: playerName, symbol: "X" }],
      turn: "X",
      winner: null,
      status: gameType === "cpu" ? "playing" : "waiting",
    };
    if (gameType === "cpu") {
      room.players.push({ id: "cpu-opponent", name: "Friendly Faceoff CPU", symbol: "O" });
    }
    rooms.set(code, room);
    socket.join(code);
    sendRoom(room);
  });

  socket.on("room:join", (payload) => {
    const { name, code } = payload ?? {};
    const playerName = normalizeName(name);
    const roomCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!playerName) return emitError(socket, "Enter a name before joining a room.");
    const room = rooms.get(roomCode);
    if (!room) return emitError(socket, "We couldn't find that room. Double-check the code.");
    if (room.status !== "waiting" || room.players.length >= 2) {
      return emitError(socket, "That room is already full. Ask your friend for a new code.");
    }
    if (room.players.some(({ id }) => id === socket.id)) {
      return emitError(socket, "You're already in that room.");
    }

    // A friend always joins as O; the creator's difficulty and game type stay authoritative.
    room.players.push({ id: socket.id, name: playerName, symbol: "O" });
    room.status = "playing";
    socket.join(roomCode);
    sendRoom(room);
  });

  socket.on("game:move", async (payload) => {
    const { code, index } = payload ?? {};
    const roomCode = typeof code === "string" ? code.toUpperCase() : "";
    const room = rooms.get(roomCode);
    const player = room?.players.find(({ id }) => id === socket.id);
    if (!room || !player) return emitError(socket, "You're not in that game.");
    if (room.status !== "playing") return emitError(socket, "This game isn't ready for a move yet.");
    if (room.gameType === "cpu" && player.symbol !== "X") {
      return emitError(socket, "Only the player can submit a move in this game.");
    }
    // Validate membership, active state, bounds, vacancy, and turn before mutating shared state.
    if (!Number.isInteger(index) || index < 0 || index > 8 || room.board[index]) {
      return emitError(socket, "That spot isn't available. Try another one.");
    }
    if (player.symbol !== room.turn) return emitError(socket, "It's your friend's turn.");

    // The server owns the board and turn order; clients submit only a square selection.
    room.board[index] = player.symbol;
    room.moves.push({ index, symbol: player.symbol });
    const winningLine = winningLines.find((line) => line.every((cell) => room.board[cell] === player.symbol));
    // Check the human move before generating a CPU reply or handing the turn to the other player.
    let persistenceError = null;
    if (winningLine) {
      persistenceError = await finishGame(room, player.symbol);
    } else if (room.board.every(Boolean)) {
      persistenceError = await finishGame(room, null);
    } else if (room.gameType === "cpu") {
      // Resolve the CPU response before broadcasting, so every client sees a complete turn.
      const cpuIndex = getCpuMove(room.board, room.difficulty);
      if (cpuIndex === null) {
        return emitError(socket, "The CPU couldn't find an available square.");
      }
      room.board[cpuIndex] = "O";
      room.moves.push({ index: cpuIndex, symbol: "O" });
      const cpuWon = winningLines.some((line) => line.every((cell) => room.board[cell] === "O"));
      if (cpuWon) {
        persistenceError = await finishGame(room, "O");
      } else if (room.board.every(Boolean)) {
        persistenceError = await finishGame(room, null);
      } else {
        room.turn = "X";
      }
    } else {
      room.turn = player.symbol === "X" ? "O" : "X";
    }
    sendRoom(room);
    if (persistenceError) io.to(room.code).emit("room:error", persistenceError);
  });

  socket.on("game:play-again", (payload) => {
    const { code } = payload ?? {};
    const roomCode = typeof code === "string" ? code.toUpperCase() : "";
    const room = rooms.get(roomCode);
    if (!room?.players.some(({ id }) => id === socket.id)) {
      return emitError(socket, "You're not in that game.");
    }
    if (room.status !== "finished") {
      return emitError(socket, "This round is still in progress.");
    }
    if (room.players.length !== 2) return emitError(socket, "Both players need to be here to play again.");

    // A replay keeps the room and its mode but starts a clean board and move history.
    room.board = Array(9).fill(null);
    room.moves = [];
    room.turn = "X";
    room.winner = null;
    room.status = "playing";
    sendRoom(room);
  });

  // Solo rooms end with their player's connection; friend rooms reset and remain joinable.
  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      const hadPlayer = room.players.some(({ id }) => id === socket.id);
      if (!hadPlayer) continue;
      if (room.gameType === "cpu") {
        rooms.delete(code);
        continue;
      }
      room.status = "waiting";
      room.board = Array(9).fill(null);
      room.moves = [];
      room.turn = "X";
      room.winner = null;
      room.players = room.players.filter(({ id }) => id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(code);
      } else {
        // Promote the remaining player to X so a replacement can always join as O.
        room.players[0].symbol = "X";
        sendRoom(room);
        io.to(code).emit("room:error", "Your friend left. This room is open if you'd like to invite someone else.");
      }
    }
  });
});

await mongoose.connect(MONGODB_URI);
httpServer.listen(PORT, () => {
  console.log(`Friendly Faceoff server listening on http://localhost:${PORT}`);
});
