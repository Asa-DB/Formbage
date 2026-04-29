# Formbage

Formbage is a classroom party game: a teacher hosts a room, students join with a code, each round students submit fake answers to a prompt, then everyone tries to spot the real one. It is browser-based, and inspired by the game *Fibbage*. 

## Current Status

This repo is intentionally barebones. It is still in the conceptualization/prototype stage, and the current implementation exists mainly to validate the core classroom game loop rather than present a polished or complete product.

Right now, the focus is on proving the idea, testing whether the interaction pattern works, and keeping the code simple enough to change quickly as the concept evolves.

## Purpose

The project exists to turn teacher written prompts into a simple live multiplayer game. The goal is engagement: students bluff, vote, and score points without needing accounts, installs, or a database. At this stage, that goal is still being explored in a minimal form rather than built out as a full platform.

Instead of basic trivia, it focuses on having real and practical understanding. Students have to know the concept well enough to produce believable responses, which works especially well for subjects like programming or other skill-based topics.

Players earn points for selecting the correct answer, but the main reward comes from tricking others into choosing their fake answers, making engagement and comprehension equally important.

The result is a competitive, social learning system that increases participation and encourages deeper understanding through play.

## How It Works

1. The teacher creates a 4-letter room.
2. Students join with a name and room code.
3. The teacher picks a prompt from the local prompt manager.
4. Students submit fake answers.
5. The server mixes those answers with the real one and sends the list back for voting.
6. Players get `1000` points for picking the real answer; answer writers get `500` points per student fooled.
7. Results and the leaderboard are broadcast to everyone.

Notes:
- Prompts are managed in the teacher browser and saved in `localStorage`.
- Game state lives in server memory, so rooms reset when the server restarts.
- If the teacher disconnects, the room closes for everyone.

## Tech Stack

- Node.js
- Express 5 for static hosting
- Socket.IO for real-time room/game events
- Plain HTML, CSS, and vanilla JavaScript on the client

## Project Shape

This structure is deliberately small at the moment so the concept can be iterated on quickly.

- [server.js](/home/asaf/Formbage/server.js) holds room state, round flow, scoring, and Socket.IO events.
- [public/client.js](/home/asaf/Formbage/public/client.js) drives the teacher and student UIs.
- [public/teacher.html](/home/asaf/Formbage/public/teacher.html), [public/student.html](/home/asaf/Formbage/public/student.html), and [public/index.html](/home/asaf/Formbage/public/index.html) are the pages.
- [public/style.css](/home/asaf/Formbage/public/style.css) contains the shared styling.

## Run Locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.
