<p align="center">
  <img
    src="https://raw.githubusercontent.com/itstxti/battleship-online/main/public/favicon.svg"
    alt="Battleship Online"
    width="160"
  >
</p>

<h1 align="center">Battleship Online</h1>

<p align="center">
  A browser-based implementation of the classic <strong>Battleship</strong> game.
</p>

<p align="center">
  Play against the AI, challenge another player on the same device,
  or play online using a room code.
</p>

<p align="center">
  <strong>TypeScript</strong> ·
  <strong>Vite</strong> ·
  <strong>Vitest</strong> ·
  <strong>WebSockets</strong>
</p>

<p align="center">
  ───────────────────
</p>

## Features

* **Three game modes** — Solo, Local Multiplayer and Online Multiplayer.
* **Three AI levels** — Easy, Medium and Hard, each using a different search strategy.
* **Hit streaks** — Landing a hit lets you continue your turn.
* **Match statistics** — Review your shots, hits, ships sunk, hit streaks, accuracy and duration after each match.
* **Audio feedback** — Sound effects and background music during gameplay.

## Tech Stack

* TypeScript
* Vite
* Vitest
* jsdom
* Node.js WebSocket relay
* Vercel
* Render

The WebSocket relay has **zero external dependencies**.

> [!WARNING]
> Online multiplayer uses Render's free plan. The relay may sleep after periods of inactivity, so the first connection can take up to a minute while the server wakes up.

## Installation

Requires **Node.js 22.12 or newer**.

```bash
git clone https://github.com/itstxti/battleship-online.git
cd battleship-online
npm install
npm run dev
```

## Online Multiplayer

Start the WebSocket relay in a second terminal:

```bash
npm run server
```

Open the game in two browser tabs, create a room in one and join it using the generated room code in the other.

## How to Play

1. Place your five ships on the board.
2. Press **Ready** to lock your fleet.
3. Fire at the enemy board.
4. A hit lets you fire again.
5. Sink all enemy ships to win.

### AI Levels

All levels use the same targeting system. Once a ship is hit, the AI probes neighbouring cells and follows its orientation; the difference between levels is how they search for targets.

| Level      | Hunt strategy                                               |
| ---------- | ----------------------------------------------------------- |
| **Easy**   | Fires at random available cells.                            |
| **Medium** | Uses a checkerboard search pattern.                         |
| **Hard**   | Uses a probability heat map based on legal ship placements. |

### Controls

| Action           | Control                         |
| ---------------- | ------------------------------- |
| Select ship      | Click it in the fleet list      |
| Place ship       | Click a cell                    |
| Rotate ship      | `R` or right-click              |
| Cancel placement | `Esc`                           |
| Fire             | Click a cell on the enemy board |

## Screenshots

<p align="center">
  <img width="49%" alt="Intro menu" src="https://github.com/user-attachments/assets/fc5d4a16-50b0-453e-abf8-68f85b80240b" />
  <img width="49%" alt="Mode menu" src="https://github.com/user-attachments/assets/79ec80cd-b265-44c7-88e0-6d365e9b5271" />
</p>

<p align="center">
  <img width="49%"  alt="Difficult menu" src="https://github.com/user-attachments/assets/f6a8e44c-52d7-4218-8c46-356c2d6f61cc" />
  <img width="49%" alt="Online lobby" src="https://github.com/user-attachments/assets/87f96606-0fea-4def-8ac6-1ac8ca9cf054" />
</p>

<p align="center">
  <img width="49%" alt="Game" src="https://github.com/user-attachments/assets/a506df6f-c2da-4b3b-87b2-a928ae876354" />
  <img width="49%" alt="Match results" src="https://github.com/user-attachments/assets/3cd593cb-ccfd-4b0a-a8a4-fd82a2f08c01" />
</p>

## Development

Run the test suite:

```bash
npm test
```

Build for production:

```bash
npm run build
```

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

### Audio Attribution

**"Melancholic Synth Ambient Loop - Solitude"** by **SiriusS19YT**

Used under the **Creative Commons Attribution 4.0 International License (CC BY 4.0)**.

https://freesound.org/s/870146/
