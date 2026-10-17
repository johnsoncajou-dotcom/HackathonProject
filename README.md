# Friendly Faceoff

A friendly, real-time tic-tac-toe game for two players. Create a room, share its six-character code, and play in the browser. Completed rounds are saved to MongoDB.

## Requirements

- Node.js 20 or newer with npm
- MongoDB running locally, or a MongoDB connection string

## Run locally

1. Start MongoDB locally, or get a MongoDB connection string. For a local server, run `mongod --dbpath ./data/db --bind_ip 127.0.0.1 --port 27017` (create `./data/db` first).
2. Copy `.env.example` to `.env`. Its default URI uses a local MongoDB database; change `MONGODB_URI` if you are using a different database.
3. Install dependencies with `npm install`.
4. Start the frontend and game server together with `npm run dev`.
5. Open `http://localhost:5173` in two browser windows. Create a room in one and join with its code in the other.

The game server runs at `http://localhost:3001`; `GET /api/health` reports server and database status. To point the frontend at a different server, set `VITE_SERVER_URL` in a frontend environment file.

## Saved match data

Completed rounds are saved to MongoDB with the room code, player display names and symbols, ordered moves, winner (or draw), result, and creation/update timestamps. No player accounts are created. In-progress room state lives in server memory, so restarting the game server ends active games.
