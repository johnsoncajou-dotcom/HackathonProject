import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true },
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
    winner: { type: String, default: null },
    result: { type: String, enum: ["win", "draw"], required: true },
  },
  { timestamps: true },
);

export default mongoose.model("Match", matchSchema);
