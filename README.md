# ✳ Friendly Faceoff

Friendly Faceoff is a cozy tic-tac-toe game. Play against a friend in a private real-time room or play solo against the CPU. Choose a game mode before starting, then use the optional logic-based coach for tips.

> 🧠 The “AI Coach” is a local game-logic feature. It does not send the board, player names, or moves to an AI provider.

## ✨ What you can do

- 🏠 Create a private room and invite a friend with its room code, or choose solo play against the CPU.
- 🔄 Play live: both players see the board and turns update in real time.
- 🎚️ Choose a difficulty:
  - **Easy:** the solo CPU picks a random open square; the coach estimates your chances against random play.
  - **Normal:** the solo CPU takes immediate wins and blocks threats; the coach suggests moves using perfect-play analysis.
  - **Hard:** the solo CPU uses minimax for optimal play, and the coach is hidden.
- 💬 Get a short explanation of your last move and a highlighted suggestion on your turn (Easy and Normal).
- 🔁 Replay with the same players after a round finishes.
- ⚙️ After a round, choose **Change game settings** to return to setup and start a friend or CPU game with different settings.
- 💾 Save completed rounds to MongoDB, including the room mode, players, ordered moves, result, and timestamps.

In friend rooms, difficulty changes the coaching, not the player-versus-player rules. In solo games, it changes the CPU strategy as well.

## 🕹️ How to play

1. Enter a display name and choose **With a friend** or **Against the CPU**.
2. Choose Easy, Normal, or Hard.
3. For a friend game, share the room code and have the other player join. The creator's mode applies to both players.
4. Take turns placing X and O. In a CPU game, you play X and the computer plays O, responding automatically after your move.
5. In Easy or Normal mode, check the AI Coach card for feedback and a suggested square.
6. After a win or draw, either replay with the same players and settings, or choose **Change game settings** to return to setup and choose a different game type or difficulty.

Squares are numbered left-to-right, top-to-bottom:

```text
1 | 2 | 3
---------
4 | 5 | 6
---------
7 | 8 | 9
```

### 📊 What the coach percentage means

Easy mode's percentage is a calculated estimate—not a guarantee—of winning from the current board. The calculator assumes that you follow the best suggestions and that your opponent chooses randomly from the remaining squares.

Normal coaching evaluates positions against an opponent who always chooses the best reply. It reports the best result you can guarantee (win, draw, or loss) rather than an Easy-mode percentage. That is the coach's model; Normal CPU mode itself uses a faster tactical strategy, not full minimax.

## 🧰 Technologies and dependencies

### Runtime dependencies

| Package | What it does |
| --- | --- |
| [React](https://react.dev/) and [React DOM](https://react.dev/) | Build the interactive lobby, game board, and coach interface. |
| [Socket.IO Client](https://socket.io/) | Connect each browser to the live game server. |
| [Express](https://expressjs.com/) | Provide the Node.js HTTP server and health endpoint. |
| [Socket.IO](https://socket.io/) | Send room, turn, and board updates between players in real time. |
| [Mongoose](https://mongoosejs.com/) | Define match records and save them to MongoDB. |
| [dotenv](https://github.com/motdotla/dotenv) | Load private/local settings from `.env` into the server process. |

### Development dependencies

| Package | What it does |
| --- | --- |
| [Vite](https://vite.dev/) | Run the frontend development server and create the production build. |
| [Vite React plugin](https://github.com/vitejs/vite/tree/main/packages/plugin-react) | Enable React support in Vite. |
| [concurrently](https://github.com/open-cli-tools/concurrently) | Start the frontend and backend together with one command. |

### Built-in Node.js modules

The server uses `node:crypto` for random room codes and `node:http` to host Express and Socket.IO on the same server. Tests use Node's built-in `node:test` and `node:assert` modules; no separate test framework is required. The stylesheet also loads DM Sans and Manrope from Google Fonts, with a sans-serif fallback if those fonts are unavailable.

## ✅ Requirements

- **Node.js 20 or newer** and npm
- **MongoDB Community Server** running locally, or a MongoDB connection string such as a MongoDB Atlas URI

## 🚀 Run the app on your computer

### 1. Start MongoDB

Install MongoDB Community Server for your operating system if it is not already installed. Start the MongoDB service using your installation method. For a manual installation, create a data directory and run:

```sh
mkdir -p ./data/db
mongod --dbpath ./data/db --bind_ip 127.0.0.1 --port 27017
```

Keep that terminal open while using the app. If you use MongoDB Atlas or another MongoDB server, use its connection string in the next step instead.

### 2. Configure the game server

In a second terminal, go to the project folder and create your local environment file:

```sh
cp .env.example .env
```

The example file is already configured for MongoDB on your computer. If using another database, edit `MONGODB_URI` in `.env`. **Never commit `.env` or share a database password publicly.**

| Setting | Purpose | Example |
| --- | --- | --- |
| `PORT` | Port used by the game server | `3001` |
| `MONGODB_URI` | MongoDB connection string for saved match records | `mongodb://127.0.0.1:27017/friendly-faceoff` |
| `CLIENT_ORIGIN` | Browser origin allowed to connect to the game server | `http://localhost:5173` |
| `VITE_SERVER_URL` *(optional)* | Game-server URL used by the frontend | `http://localhost:3001` |

`VITE_SERVER_URL` is optional for local use. Set it in a frontend environment file if your game server runs at a different address.

### 3. Install packages and run

From the project folder:

```sh
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. Choose **Against the CPU** for a solo game, or choose **With a friend** and share the generated room code.

The development command starts:

- 🌐 Vite frontend: `http://localhost:5173`
- 🎮 Node.js + Socket.IO game server: `http://localhost:3001`
- 🗄️ MongoDB: `mongodb://127.0.0.1:27017/friendly-faceoff` (when using the example configuration)

To check the backend and database connection, visit **http://localhost:3001/api/health**. A healthy response looks like:

```json
{ "status": "ok", "database": "connected" }
```

## 🧪 Tests and production build

Run the coach and CPU strategy tests:

```sh
npm test
```

Build the static frontend files:

```sh
npm run build
```

Vite writes the production frontend to `dist/`. `npm run preview` serves that frontend build locally for a quick check. The game server still needs to be running separately.

## 🗂️ Project map

| Path | Contents |
| --- | --- |
| `src/App.jsx` | React screens, lobby actions, live room state, board, and coach UI. |
| `src/main.jsx` | Frontend entry point: mounts React and loads the stylesheet. |
| `src/styles.css` | Layout, colors, responsive styles, board, and coach appearance. |
| `src/gameCoach.js` | Local tic-tac-toe solver, win estimates, and move feedback. |
| `src/gameCoach.test.js` | Automated tests for move selection and coach calculations. |
| `server/index.js` | Express health endpoint, Socket.IO rooms, turn validation, and match saving. |
| `server/cpu.js` | Easy, Normal, and Hard computer opponent strategies. |
| `server/cpu.test.js` | Automated tests for CPU moves and difficulty strategies. |
| `server/models/Match.js` | MongoDB schema for completed matches. |
| `index.html` | HTML page Vite uses to load the React app. |
| `vite.config.js` | Vite and React development/build configuration. |
| `package.json` | Package list and commands such as `npm run dev`, `npm test`, and `npm run build`. |
| `.env.example` | Safe-to-share example environment settings. Copy this to `.env` for local configuration. |

## 🔁 How the app works inside

1. The browser connects to the Node.js server using Socket.IO.
2. The room creator chooses the room's difficulty. The server keeps the room code, game type, board, move history, players, current turn, result, and difficulty in memory and shares updates with both browsers.
3. The server checks every submitted move: the player must be in the room, it must be their turn, and the square must be available.
4. When the board is won or drawn, the server saves the completed match to MongoDB.
5. CPU moves are selected by the server: Easy picks a random open square, Normal prioritizes wins and blocks before using positional choices, and Hard uses minimax to play optimally.
6. Easy and Normal coaching is calculated in the browser using the board and move history. The Easy probability uses a random-opponent model; Normal uses a perfect-play minimax model.

## 💾 What gets saved

Each completed match records:

- Room code, game type (friend or CPU), and selected difficulty
- Both display names and X/O symbols, including the CPU in solo games
- Ordered moves (board square and symbol)
- Winner's X/O symbol, or a draw result
- Creation and update timestamps

Players do not need accounts. Names are temporary display names associated with that match.

## ⚠️ Current limitations

- CPU rooms are solo games and cannot be joined by another player.
- Closing or refreshing a solo game disconnects it; start a new solo game to play again.
- Changing settings leaves the completed room. The other friend-room player returns to a waiting room and can invite someone else.
- If someone disconnects from a friend room, the current round resets; the remaining player becomes X and the room waits for a new player.
- Active room state is held in server memory. Restarting the server ends games that have not finished.
- Completed match records are stored, but there is not yet a match-history screen or user accounts.
- `localhost` addresses only work on the computer running the app. To share the site over the internet, deploy the frontend and game server and use a hosted MongoDB database. Set production `VITE_SERVER_URL` and `CLIENT_ORIGIN` to the deployed URLs.

## 🛠️ Troubleshooting

| Problem | Check |
| --- | --- |
| Browser page is blank or cannot load | Make sure `npm run dev` is still running and open `http://localhost:5173`. |
| “Couldn't reach the game server” | Check that the server started on port 3001 and visit `/api/health`. |
| Database connection error | Make sure MongoDB is running and `MONGODB_URI` in `.env` is correct. |
| “Couldn't find that room” | Confirm the room creator's server is still running and recheck the six-character code. |
| Port is already in use | Stop the other process using that port, or choose another `PORT` and update `VITE_SERVER_URL`. |
