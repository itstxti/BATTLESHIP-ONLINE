# Battleship Online

A browser-based implementation of the classic **Battleship** game, built with TypeScript and Vite.

Play against the AI, challenge another player on the same device, or play online using a room code.

## Game Modes

| Mode                   | Description                                        |
| ---------------------- | -------------------------------------------------- |
| **Solo**               | Play against the AI                                |
| **Local Multiplayer**  | Two players on the same device                     |
| **Online Multiplayer** | Two players on different devices using a room code |

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

Clone the repository:

```bash
git clone https://github.com/itstxti/battleship-online.git
cd battleship-online
```

Install the dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

## Online Multiplayer

To use online multiplayer locally, start the WebSocket relay in a second terminal:

```bash
npm run server
```

Then open the game in two browser tabs.

Create a room in one tab and join it using the generated room code in the other.

## How to Play

1. Place your five ships on the board.
2. Press **Ready** to lock your fleet.
3. Take turns firing at the enemy board.
4. A successful hit gives you another shot.
5. Sink all enemy ships to win.

### Controls

| Action           | Control                         |
| ---------------- | ------------------------------- |
| Select ship      | Click it in the fleet list      |
| Place ship       | Click a cell                    |
| Rotate ship      | `R` or right-click              |
| Cancel placement | `Esc`                           |
| Fire             | Click a cell on the enemy board |

### Match Results

When a match ends, a results screen shows **Victory** or **Defeat** with shots,
hits, accuracy, ships sunk and match duration, plus a **New Game** button.
Stats cover the current match only and work in Solo, Local and Online modes.
In Local multiplayer the winner's stats are shown. In Online mode, New Game
returns to the lobby to find a new opponent.

## Screenshots
<p align="center">
  <img width="49%" alt="image" src="https://github.com/user-attachments/assets/fc5d4a16-50b0-453e-abf8-68f85b80240b" />
  <img width="49%" alt="image" src="https://github.com/user-attachments/assets/79ec80cd-b265-44c7-88e0-6d365e9b5271" />
</p>

<p align="center">
  <img width="49%" alt="image" src="https://github.com/user-attachments/assets/87f96606-0fea-4def-8ac6-1ac8ca9cf054" />
  <img width="49%" alt="image" src="https://github.com/user-attachments/assets/f62b7552-c79c-425d-91d3-4800dc06dbb1" />
</p>

<p align="center">
  <img width="49%" alt="image" src="https://github.com/user-attachments/assets/061bbed3-b10c-48ee-9f0b-6228869c5d4b" />
  <img width="49%" alt="image" src="https://github.com/user-attachments/assets/a506df6f-c2da-4b3b-87b2-a928ae876354" />
</p>

## Development

The project includes automated tests using **Vitest** and **jsdom**.

Run the test suite with:

```bash
npm test
```

For a production build:

```bash
npm run build
```

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

### Audio Attribution

The following audio asset is used under the **Creative Commons Attribution 4.0 International License (CC BY 4.0)**:

**"Melancholic Synth Ambient Loop - Solitude"** by **SiriusS19YT**

https://freesound.org/s/870146/

License: **CC BY 4.0**
