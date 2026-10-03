# Battleship Online

A browser-based version of the classic Battleship game featuring AI, local multiplayer, and online multiplayer.

## Game Modes

| Mode               | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| Solo               | Play against the AI                                             |
| Local Multiplayer  | Two players on the same device                                  |
| Online Multiplayer | Two players on different devices, connected through a room code |

## Tech Stack

* TypeScript
* Vite
* Vitest and jsdom
* Node.js WebSocket relay (zero dependencies)
* Vercel for the frontend
* Render for the WebSocket relay

> [!WARNING]
> Online multiplayer uses Render's free plan. The relay may sleep after periods of inactivity, so the first connection can take up to a minute while the server wakes up.

## Project Structure

```text
src/
  game/        Game rules, AI and multiplayer protocol
  online/      Online lobby and relay client
  placement/   Fleet placement
  battle/      Battle logic
  ui/          Rendering
server/        WebSocket relay
docs/          Screenshots
```

## Installation

Requires Node.js 22 or newer.

```bash
git clone https://github.com/itstxti/battleship-online.git
cd battleship-online
npm install
npm run dev
```

### Online Multiplayer

To use online multiplayer locally, start the WebSocket relay in a second terminal:

```bash
npm run server
```

Then open the game in two browser tabs. Create a room in one tab and join it using the room code in the other.

## How to Play

1. Place your five ships on your board.
2. Press the **Ready** button to lock your fleet.
3. Take turns firing at the enemy board. A successful hit gives you another shot.
4. Sink all enemy ships to win.

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
  <img width="33%" alt="Solo game" src="https://github.com/user-attachments/assets/9780d272-bdf4-4aa9-99f0-4f30a8e75571" />
  <img width="33%" alt="Local multiplayer" src="https://github.com/user-attachments/assets/c10c32ff-4590-4af5-a035-53bb4f16a058" />
  <img width="33%" alt="Online multiplayer" src="https://github.com/user-attachments/assets/e27a7d7c-ddae-4987-97f6-be35adf0fc91" />
</p>
