import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getBestMove, getMoveFeedback } from "./gameCoach.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

function App() {
  // Lobby selections stay local until a room is created; live game data comes from the server.
  const [socket, setSocket] = useState(null);
  const [connection, setConnection] = useState("disconnected");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [selectedGameType, setSelectedGameType] = useState("friend");
  const [selectedDifficulty, setSelectedDifficulty] = useState("easy");
  const [game, setGame] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const leavingGameRef = useRef(false);

  // Keep one socket per mounted app and disconnect it when React unmounts.
  useEffect(() => {
    const client = io(SERVER_URL, { autoConnect: false });
    // Socket events replace local state with the latest server snapshot; the server remains authoritative.
    client.on("connect", () => {
      setConnection("connected");
      setMessage("");
    });
    client.on("disconnect", () => {
      setConnection("disconnected");
      setBusy(false);
      if (leavingGameRef.current) {
        leavingGameRef.current = false;
        setMessage("");
        setGame(null);
        return;
      }
      setMessage("Connection lost. Reconnect to start a new game.");
      setGame(null);
    });
    client.on("room:state", (nextGame) => {
      setGame(nextGame);
      setBusy(false);
      setMessage("");
    });
    client.on("room:error", (errorMessage) => {
      setBusy(false);
      setMessage(errorMessage);
    });
    setSocket(client);

    return () => client.disconnect();
  }, []);

  function connectAnd(action) {
    const playerName = name.trim();
    if (!playerName) {
      setMessage("Add your name first to start playing.");
      return;
    }
    if (!socket) return;

    setBusy(true);
    setMessage("");
    if (!socket.connected) {
      const onConnect = () => {
        socket.off("connect_error", onConnectError);
        action(playerName);
      };
      const onConnectError = () => {
        socket.off("connect", onConnect);
        setBusy(false);
        setMessage("Couldn't reach the game server. Check that it is running.");
      };

      // Run only the action requested for this attempt, and discard it if the connection fails.
      socket.once("connect", onConnect);
      socket.once("connect_error", onConnectError);
      socket.connect();
    } else {
      action(playerName);
    }
  }

  // The backend creates the room and is authoritative for all game state.
  function createRoom(playerName) {
    socket.emit("room:create", {
      name: playerName,
      difficulty: selectedDifficulty,
      gameType: selectedGameType,
    });
  }

  function joinRoom(playerName) {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setBusy(false);
      setMessage("Enter the room code your friend shared.");
      return;
    }
    socket.emit("room:join", { name: playerName, code });
  }

  // Send only the chosen square; the server validates turn order and availability.
  function playCell(index) {
    if (!game || game.status !== "playing" || game.board[index]) return;
    socket.emit("game:move", { code: game.code, index });
  }

  function playAgain() {
    if (game) socket.emit("game:play-again", { code: game.code });
  }

  function changeGameSettings() {
    // Disconnect deliberately so the server releases this room before returning to setup.
    leavingGameRef.current = Boolean(socket?.connected);
    socket?.disconnect();
    setGame(null);
    setBusy(false);
    setMessage("");
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(game.code);
      setMessage("Room code copied!");
    } catch {
      setMessage("Couldn't copy automatically. Select and copy the room code.");
    }
  }

  // Derive turn and coach UI from the latest server-sent room snapshot.
  const myPlayer = game?.players.find((player) => player.id === socket?.id);
  const opponent = game?.players.find((player) => player.id !== socket?.id);
  const isMyTurn = myPlayer?.symbol === game?.turn && game?.status === "playing";
  const winner = game?.players.find((player) => player.symbol === game?.winner);
  const moves = game?.moves ?? [];
  const difficulty = game?.difficulty ?? "easy";
  const gameType = game?.gameType ?? "friend";
  // Hard mode hides coach UI in both friend rooms and CPU games.
  const coachEnabled = difficulty !== "hard";
  // Coach feedback reconstructs the pre-move board from ordered history so CPU replies do not skew it.
  const myLastMove = useMemo(() => {
    if (difficulty === "hard" || !myPlayer || !game?.board) return null;
    const lastPlayerMoveIndex = moves.findLastIndex((move) => move.symbol === myPlayer.symbol);
    if (lastPlayerMoveIndex < 0) return null;

    // Rebuild the position before this player's move; the live board may include a CPU reply.
    const boardBeforeMove = Array(9).fill(null);
    for (const move of moves.slice(0, lastPlayerMoveIndex)) {
      boardBeforeMove[move.index] = move.symbol;
    }
    const lastPlayerMove = moves[lastPlayerMoveIndex];
    return {
      ...getMoveFeedback(boardBeforeMove, lastPlayerMove.index, myPlayer.symbol, difficulty),
      moveIndex: lastPlayerMove.index,
    };
  }, [difficulty, moves, game?.board, myPlayer]);
  // Only calculate a suggested square on this player's turn and when coaching is enabled.
  const suggestion = useMemo(
    () => isMyTurn && coachEnabled ? getBestMove(game.board, myPlayer.symbol, difficulty) : null,
    [isMyTurn, coachEnabled, difficulty, game?.board, myPlayer?.symbol],
  );

  function turnLabel() {
    if (!game) return "";
    if (game.status === "waiting") return "Waiting for your friend to join…";
    if (game.status === "finished") {
      if (game.winner) {
        return game.winner === myPlayer?.symbol ? "You got it! Nice game." : `${winner?.name} takes this round!`;
      }
      return "It's a draw! Good game.";
    }
    return isMyTurn ? "Your turn — make a move!" : `${opponent?.name || "Your friend"} is thinking…`;
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Friendly Faceoff home">
          <span className="brand-mark" aria-hidden="true">✳</span>
          <span>friendly<span className="brand-light">faceoff</span></span>
        </a>
        <div className={`connection ${connection}`} aria-live="polite">
          <span className="connection-dot" />
          {connection === "connected" ? "Connected" : "Ready when you are"}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span>✦</span> GOOD GAMES, GOOD VIBES</div>
          <h1>A little friendly<br />competition?</h1>
          <p className="intro">Play with a friend or take on the CPU. Keep it fun.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">✦</span>
          <div className="mini-board">
            <span className="mini-cell mark-x">×</span><span className="mini-cell" />
            <span className="mini-cell mark-o">○</span><span className="mini-cell mark-o">○</span>
            <span className="mini-cell mark-x">×</span><span className="mini-cell" />
            <span className="mini-cell" /><span className="mini-cell mark-x">×</span>
            <span className="mini-cell mark-o">○</span>
          </div>
          <span className="art-note">your move!</span>
        </div>
      </section>

      {/* The lobby switches its available actions between friend rooms and solo CPU games. */}
      {!game ? (
        <section className="lobby-card">
          <div className="card-heading">
            <span className="step-badge">1</span>
            <div>
              <h2>First, what should we call you?</h2>
              <p>Your name will show up in the game.</p>
            </div>
          </div>
          <label className="field-label" htmlFor="player-name">YOUR NAME</label>
          <input
            id="player-name"
            className="text-field"
            value={name}
            onChange={(event) => setName(event.target.value.slice(0, 18))}
            onKeyDown={(event) => {
              if (event.key === "Enter") connectAnd(createRoom);
            }}
            placeholder="e.g. Sunny"
            maxLength={18}
            autoComplete="nickname"
          />
          <label className="field-label mode-label">WHO WOULD YOU LIKE TO PLAY?</label>
          <div className="game-type-options" role="group" aria-label="Choose who to play">
            <button
              className={`game-type-option ${selectedGameType === "friend" ? "selected" : ""}`}
              type="button"
              aria-pressed={selectedGameType === "friend"}
              onClick={() => setSelectedGameType("friend")}
            >
              <strong>With a friend</strong>
              <span>Create or join a room</span>
            </button>
            <button
              className={`game-type-option ${selectedGameType === "cpu" ? "selected" : ""}`}
              type="button"
              aria-pressed={selectedGameType === "cpu"}
              onClick={() => setSelectedGameType("cpu")}
            >
              <strong>Against the CPU</strong>
              <span>Play solo, no invite needed</span>
            </button>
          </div>
          <label className="field-label mode-label">
            GAME MODE{selectedGameType === "friend" ? " · SET BY ROOM CREATOR" : ""}
          </label>
          <div className="mode-options" role="group" aria-label="Choose game mode">
            {["easy", "normal", "hard"].map((mode) => (
              <button
                className={`mode-option ${selectedDifficulty === mode ? "selected" : ""}`}
                key={mode}
                type="button"
                aria-pressed={selectedDifficulty === mode}
                onClick={() => setSelectedDifficulty(mode)}
              >
                <strong>{mode[0].toUpperCase() + mode.slice(1)}</strong>
                <span>
                  {selectedGameType === "cpu"
                    ? mode === "easy" ? "Random CPU + coach" : mode === "normal" ? "Tactical CPU + coach" : "Perfect CPU · no coach"
                    : mode === "easy" ? "Coach tips" : mode === "normal" ? "Strategy coach" : "No coach"}
                </span>
              </button>
            ))}
          </div>
          <div className={`action-grid ${selectedGameType === "cpu" ? "solo-action-grid" : ""}`}>
            <button className="primary-button" onClick={() => connectAnd(createRoom)} disabled={busy}>
              <span className="button-icon">＋</span>
              {busy ? "Connecting…" : selectedGameType === "cpu" ? "Start a solo game" : "Create a room"}
              <span className="button-arrow">→</span>
            </button>
            {selectedGameType === "friend" && (
              <div className="join-row">
                <input
                  className="text-field code-field"
                  aria-label="Room code"
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value.slice(0, 6).toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") connectAnd(joinRoom);
                  }}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  autoCapitalize="characters"
                />
                <button className="secondary-button" onClick={() => connectAnd(joinRoom)} disabled={busy}>
                  Join a friend <span aria-hidden="true">↗</span>
                </button>
              </div>
            )}
          </div>
          {message && <p className="notice" role="alert">{message}</p>}
          <div className="how-it-works">
            <span className="how-icon">☻</span>
            <p><strong>How it works</strong><br />Create a room to invite a friend, or play solo against the CPU.</p>
          </div>
        </section>
      ) : (
        <section className="game-card">
          <div className="game-topline">
            <div>
              <div className="field-label">{gameType === "cpu" ? "SOLO GAME" : "YOUR ROOM"}</div>
              {gameType === "friend" && <div className="room-code">{game.code}</div>}
            </div>
            <span className={`mode-pill mode-${difficulty}`}>{difficulty} mode</span>
            {gameType === "friend" && (
              <button className="copy-button" onClick={copyRoomCode}>
                Copy code <span aria-hidden="true">⧉</span>
              </button>
            )}
          </div>
          <div className="players">
            {game.players.map((player) => (
              <div className={`player-chip ${player.id === socket?.id ? "is-you" : ""}`} key={player.symbol}>
                <span className={`player-mark ${player.symbol === "X" ? "mark-x" : "mark-o"}`}>
                  {player.symbol === "X" ? "×" : "○"}
                </span>
                <span>{player.name}{player.id === socket?.id ? " (you)" : player.id === "cpu-opponent" ? " (CPU)" : ""}</span>
              </div>
            ))}
            {gameType === "friend" && game.status === "waiting" && <div className="player-chip waiting-player">Waiting for friend…</div>}
          </div>
          <div className={`turn-banner ${game.status === "finished" ? "finished" : ""}`} aria-live="polite">
            <span>{game.status === "finished" ? "✦" : "●"}</span>
            {turnLabel()}
          </div>
          {coachEnabled && <section className={`coach-card coach-${difficulty}`} aria-live="polite" aria-label="AI game coach">
            <div className="coach-heading">
              <span className="coach-icon" aria-hidden="true">✦</span>
              <div>
                <h2>AI Coach <span>· {difficulty[0].toUpperCase() + difficulty.slice(1)}</span></h2>
                <p>{difficulty === "easy" ? "Win estimates assume a random-move opponent" : "Strategic advice assumes your opponent plays perfectly"}</p>
              </div>
            </div>
            {myLastMove && (
              <div className="coach-feedback">
                <strong>Your last move</strong>
                <p>{myLastMove.message}</p>
                {difficulty === "easy" ? (
                  <>
                    <span>Estimated win chance after your move: <strong>{formatPercent(myLastMove.playedWinChance)}</strong></span>
                    {myLastMove.bestMove.index !== myLastMove.moveIndex && myLastMove.bestMove.winChance > myLastMove.playedWinChance && (
                      <span className="coach-alternative">
                        Best alternative, square {myLastMove.bestMove.index + 1}: <strong>{formatPercent(myLastMove.bestMove.winChance)}</strong>
                      </span>
                    )}
                  </>
                ) : (
                  <span>Result against perfect play: <strong>{formatOutcome(myLastMove.playedOutcome)}</strong></span>
                )}
              </div>
            )}
            {suggestion ? (
              <div className="coach-suggestion">
                <strong>Suggested next move</strong>
                <p>Try square {suggestion.index + 1} <span>({difficulty === "easy" ? `${formatPercent(suggestion.winChance)} estimated win chance` : `${formatOutcome(suggestion.outcome)} against perfect play`})</span></p>
              </div>
            ) : game.status === "playing" ? (
              <p className="coach-wait">Your next suggestion will appear when it’s your turn.</p>
            ) : (
              <p className="coach-wait">This round is over. Play another round for new suggestions.</p>
            )}
            <p className="coach-footnote">{difficulty === "easy" ? "Win chances assume you follow the best suggestions and your opponent picks randomly." : "Normal tips use perfect-play strategy and aim for the best result you can guarantee."}</p>
          </section>}
          {!coachEnabled && (
            <p className="hard-mode-note">
              {gameType === "cpu"
                ? "The CPU uses perfect-play strategy. Coaching is turned off in Hard mode."
                : "Hard mode selected: AI coaching is turned off for both players."}
            </p>
          )}
          {/* Board indices are shared with the server and coach, from top-left (0) to bottom-right (8). */}
          <div className="board" role="group" aria-label="Tic-tac-toe board">
            {game.board.map((cell, index) => (
              <button
                className={`board-cell ${cell ? "occupied" : ""} ${cell === "X" ? "mark-x" : cell === "O" ? "mark-o" : ""} ${suggestion?.index === index ? "suggested" : ""}`}
                key={index}
                onClick={() => playCell(index)}
                disabled={!isMyTurn || Boolean(cell)}
                aria-label={`Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}${cell ? `, ${cell}` : ", empty"}${suggestion?.index === index ? ", AI suggested move" : ""}`}
              >
                {cell === "X" ? "×" : cell === "O" ? "○" : ""}
              </button>
            ))}
          </div>
          {/* Finished games can be replayed with the same settings or exited to change them. */}
          {game.status === "finished" && (
            <>
              <button className="primary-button replay-button" onClick={playAgain}>
                Play another round <span className="button-arrow">↻</span>
              </button>
              <button className="secondary-button settings-button" onClick={changeGameSettings}>
                Change game settings
              </button>
            </>
          )}
          {message && <p className="notice" role="alert">{message}</p>}
          <p className="share-hint">
            {gameType === "cpu" ? "You're playing solo against the computer." : "Send the room code to your friend to get started."}
          </p>
        </section>
      )}

      <footer className="footer">
        <span>✦ &nbsp;A tiny game for two</span>
        <span>Keep it kind. Keep it fun.</span>
      </footer>
    </main>
  );
}

function formatPercent(chance) {
  return `${Math.round(chance * 100)}%`;
}

function formatOutcome(outcome) {
  if (outcome > 0) return "Win";
  if (outcome < 0) return "Loss";
  return "Draw";
}

export default App;
