import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    // Persist one completed round, including enough metadata to distinguish CPU games.
    roomCode: { type: String, required: true },
    gameType: { type: String, enum: ["friend", "cpu"], default: "friend" },
    difficulty: { type: String, enum: ["easy", "normal", "hard"], default: "easy" },
    players: {
      type: [{ name: { type: String, required: true }, symbol: { type: String, required: true } }],
      required: true,
    },
    moves: {
      type: [{
        index: { type: Number, required: true, min: 0, max: 8 },
        symbol: { type: String, enum: ["X", "O"], required: true },
      }],
      required: true,
    },
    // winner is the winning symbol; null represents a draw.
    winner: { type: String, default: null },
    result: { type: String, enum: ["win", "draw"], required: true },
  },
  // Mongoose supplies createdAt and updatedAt for saved match records.
  { timestamps: true },
);

export default mongoose.model("Match", matchSchema);
