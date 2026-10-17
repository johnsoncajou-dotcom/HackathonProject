import "dotenv/config";
import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import mongoose from "mongoose";
import { Server } from "socket.io";
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
app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: CLIENT_ORIGIN } });

function publicRoom(room) {
  return {
    code: room.code,
    board: room.board,
    players: room.players.map(({ id, name, symbol }) => ({ id, name, symbol })),
    turn: room.turn,
    winner: room.winner,
    status: room.status,
  };
}

function sendRoom(room) {
  io.to(room.code).emit("room:state", publicRoom(room));
}

function emitError(socket, message) {
  socket.emit("room:error", message);
}

async function finishGame(room, winner) {
  room.winner = winner;
  room.status = "finished";
  const result = winner ? "win" : "draw";
  try {
    await Match.create({
      roomCode: room.code,
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
  return typeof name === "string" ? name.trim().slice(0, 18) : "";
}

function createRoomCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => ROOM_CODE_CHARACTERS[randomInt(ROOM_CODE_CHARACTERS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name } = {}) => {
    const playerName = normalizeName(name);
    if (!playerName) return emitError(socket, "Enter a name before creating a room.");

    const code = createRoomCode();
    const room = {
      code,
      board: Array(9).fill(null),
      moves: [],
      players: [{ id: socket.id, name: playerName, symbol: "X" }],
      turn: "X",
      winner: null,
      status: "waiting",
    };
    rooms.set(code, room);
    socket.join(code);
    sendRoom(room);
  });

  socket.on("room:join", ({ name, code } = {}) => {
    const playerName = normalizeName(name);
    const roomCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!playerName) return emitError(socket, "Enter a name before joining a room.");
    const room = rooms.get(roomCode);
    if (!room) return emitError(socket, "We couldn't find that room. Double-check the code.");
    if (room.status !== "waiting" || room.players.length >= 2) {
      return emitError(socket, "That room is already full. Ask your friend for a new code.");
    }

    room.players.push({ id: socket.id, name: playerName, symbol: "O" });
    room.status = "playing";
    socket.join(roomCode);
    sendRoom(room);
  });

  socket.on("game:move", async ({ code, index } = {}) => {
    const roomCode = typeof code === "string" ? code.toUpperCase() : "";
    const room = rooms.get(roomCode);
    const player = room?.players.find(({ id }) => id === socket.id);
    if (!room || !player) return emitError(socket, "You're not in that game.");
    if (room.status !== "playing") return emitError(socket, "This game isn't ready for a move yet.");
    if (!Number.isInteger(index) || index < 0 || index > 8 || room.board[index]) {
      return emitError(socket, "That spot isn't available. Try another one.");
    }
    if (player.symbol !== room.turn) return emitError(socket, "It's your friend's turn.");

    room.board[index] = player.symbol;
    room.moves.push({ index, symbol: player.symbol });
    const winningLine = winningLines.find((line) => line.every((cell) => room.board[cell] === player.symbol));
    let persistenceError = null;
    if (winningLine) {
      persistenceError = await finishGame(room, player.symbol);
    } else if (room.board.every(Boolean)) {
      persistenceError = await finishGame(room, null);
    } else {
      room.turn = player.symbol === "X" ? "O" : "X";
    }
    sendRoom(room);
    if (persistenceError) io.to(room.code).emit("room:error", persistenceError);
  });

  socket.on("game:play-again", ({ code } = {}) => {
    const roomCode = typeof code === "string" ? code.toUpperCase() : "";
    const room = rooms.get(roomCode);
    if (!room?.players.some(({ id }) => id === socket.id)) {
      return emitError(socket, "You're not in that game.");
    }
    if (room.players.length !== 2) return emitError(socket, "Both players need to be here to play again.");

    room.board = Array(9).fill(null);
    room.moves = [];
    room.turn = "X";
    room.winner = null;
    room.status = "playing";
    sendRoom(room);
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      const hadPlayer = room.players.some(({ id }) => id === socket.id);
      if (!hadPlayer) continue;
      room.status = "waiting";
      room.board = Array(9).fill(null);
      room.moves = [];
      room.turn = "X";
      room.winner = null;
      room.players = room.players.filter(({ id }) => id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(code);
      } else {
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
