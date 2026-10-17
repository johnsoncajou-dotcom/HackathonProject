import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

function App() {
  const [socket, setSocket] = useState(null);
  const [connection, setConnection] = useState("disconnected");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [game, setGame] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = io(SERVER_URL, { autoConnect: false });
    client.on("connect", () => {
      setConnection("connected");
      setBusy(false);
      setMessage("");
    });
    client.on("disconnect", () => {
      setConnection("disconnected");
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
      setMessage("Add your name first so your friend knows who's who.");
      return;
    }
    if (!socket) return;

    setBusy(true);
    setMessage("");
    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => action(playerName));
      socket.once("connect_error", () => {
        setBusy(false);
        setMessage("Couldn't reach the game server. Check that it is running.");
      });
    } else {
      action(playerName);
    }
  }

  function createRoom(playerName) {
    socket.emit("room:create", { name: playerName });
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

  function playCell(index) {
    if (!game || game.status !== "playing" || game.board[index]) return;
    socket.emit("game:move", { code: game.code, index });
  }

  function playAgain() {
    if (game) socket.emit("game:play-again", { code: game.code });
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(game.code);
      setMessage("Room code copied!");
    } catch {
      setMessage("Couldn't copy automatically. Select and copy the room code.");
    }
  }

  const myPlayer = game?.players.find((player) => player.id === socket?.id);
  const opponent = game?.players.find((player) => player.id !== socket?.id);
  const isMyTurn = myPlayer?.symbol === game?.turn && game?.status === "playing";
  const winner = game?.players.find((player) => player.symbol === game?.winner);

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
          <p className="intro">Invite someone you like. Take turns. Keep it fun.</p>
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
          <div className="action-grid">
            <button className="primary-button" onClick={() => connectAnd(createRoom)} disabled={busy}>
              <span className="button-icon">＋</span>
              {busy ? "Connecting…" : "Create a room"}
              <span className="button-arrow">→</span>
            </button>
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
          </div>
          {message && <p className="notice" role="alert">{message}</p>}
          <div className="how-it-works">
            <span className="how-icon">☻</span>
            <p><strong>How it works</strong><br />Make a room, share the code, and play tic-tac-toe together.</p>
          </div>
        </section>
      ) : (
        <section className="game-card">
          <div className="game-topline">
            <div>
              <div className="field-label">YOUR ROOM</div>
              <div className="room-code">{game.code}</div>
            </div>
            <button className="copy-button" onClick={copyRoomCode}>
              Copy code <span aria-hidden="true">⧉</span>
            </button>
          </div>
          <div className="players">
            {game.players.map((player) => (
              <div className={`player-chip ${player.id === socket?.id ? "is-you" : ""}`} key={player.symbol}>
                <span className={`player-mark ${player.symbol === "X" ? "mark-x" : "mark-o"}`}>
                  {player.symbol === "X" ? "×" : "○"}
                </span>
                <span>{player.name}{player.id === socket?.id ? " (you)" : ""}</span>
              </div>
            ))}
            {game.status === "waiting" && <div className="player-chip waiting-player">Waiting for friend…</div>}
          </div>
          <div className={`turn-banner ${game.status === "finished" ? "finished" : ""}`} aria-live="polite">
            <span>{game.status === "finished" ? "✦" : "●"}</span>
            {turnLabel()}
          </div>
          <div className="board" role="group" aria-label="Tic-tac-toe board">
            {game.board.map((cell, index) => (
              <button
                className={`board-cell ${cell ? "occupied" : ""} ${cell === "X" ? "mark-x" : cell === "O" ? "mark-o" : ""}`}
                key={index}
                onClick={() => playCell(index)}
                disabled={!isMyTurn || Boolean(cell)}
                aria-label={`Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}${cell ? `, ${cell}` : ", empty"}`}
              >
                {cell === "X" ? "×" : cell === "O" ? "○" : ""}
              </button>
            ))}
          </div>
          {game.status === "finished" && (
            <button className="primary-button replay-button" onClick={playAgain}>
              Play another round <span className="button-arrow">↻</span>
            </button>
          )}
          {message && <p className="notice" role="alert">{message}</p>}
          <p className="share-hint">Send the room code to your friend to get started.</p>
        </section>
      )}

      <footer className="footer">
        <span>✦ &nbsp;A tiny game for two</span>
        <span>Keep it kind. Keep it fun.</span>
      </footer>
    </main>
  );
}

export default App;
