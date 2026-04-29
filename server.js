const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PHASES = {
  LOBBY: "LOBBY",
  PICK_WRITERS: "PICK_WRITERS",
  SUBMITTING: "SUBMITTING",
  REVEALING: "REVEALING",
  VOTING: "VOTING",
  RESULTS: "RESULTS",
};

const SUBMIT_MS = 25000;
const VOTE_MS = 18000;
const PICK_WRITERS_MS = 1500;
const REVEALING_MS = 2500;

const rooms = {};
const players = {};
const prompts = {};

app.use(express.static(path.join(__dirname, "public")));

function makeRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";

  while (!code || rooms[code]) {
    code = "";
    for (let i = 0; i < 4; i += 1) {
      code += letters[Math.floor(Math.random() * letters.length)];
    }
  }

  return code;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function shuffle(list) {
  const copy = [...list];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }

  return copy;
}

function getRoom(roomCode) {
  return rooms[roomCode];
}

function getRoomStudents(room) {
  return room.studentIds.map((id) => players[id]).filter(Boolean);
}

function getSortedStudents(room) {
  return getRoomStudents(room).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function getRoundPlayerIds(room) {
  if (!room.currentRound) {
    return [];
  }

  return room.currentRound.playerIds.filter((id) => players[id]);
}

function getRoundWriterIds(room) {
  if (!room.currentRound) {
    return [];
  }

  return room.currentRound.writerIds.filter((id) => players[id]);
}

function clearRoomTimer(room) {
  if (room.timerId) {
    clearTimeout(room.timerId);
    room.timerId = null;
  }

  room.phaseEndsAt = null;
}

function setRoomTimer(room, durationMs, onEnd, showCountdown) {
  clearRoomTimer(room);
  room.phaseEndsAt = showCountdown ? Date.now() + durationMs : null;

  room.timerId = setTimeout(() => {
    const currentRoom = rooms[room.code];
    if (!currentRoom) {
      return;
    }

    currentRoom.timerId = null;
    currentRoom.phaseEndsAt = null;
    onEnd(currentRoom);
  }, durationMs);
}

function pickRoundWriters(room) {
  const studentIds = getRoomStudents(room).map((student) => student.id);
  const target = Math.min(3, studentIds.length);
  const chosen = [];

  room.writerQueue = (room.writerQueue || []).filter((id) => studentIds.includes(id));

  while (chosen.length < target) {
    const nextId = room.writerQueue.find((id) => !chosen.includes(id));

    if (!nextId) {
      const refill = shuffle(studentIds.filter((id) => !room.writerQueue.includes(id) && !chosen.includes(id)));

      if (refill.length === 0) {
        break;
      }

      room.writerQueue.push(...refill);
      continue;
    }

    room.writerQueue.splice(room.writerQueue.indexOf(nextId), 1);
    chosen.push(nextId);
  }

  return chosen;
}

function teacherState(room) {
  return {
    roomCode: room.code,
    phase: room.phase,
    phaseEndsAt: room.phaseEndsAt,
    students: getSortedStudents(room).map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
    })),
    question: room.currentRound ? room.currentRound.question : prompts[room.code] ? prompts[room.code].question : "",
    writers: room.currentRound
      ? room.currentRound.writerIds.map((id) => (players[id] ? players[id].name : "")).filter(Boolean)
      : [],
    results: room.lastResults || null,
  };
}

function studentState(room, player) {
  const state = {
    roomCode: room.code,
    phase: room.phase,
    name: player.name,
    score: player.score,
    question: "",
    options: [],
    submitted: false,
    voted: false,
    isWriter: false,
    phaseEndsAt: room.phaseEndsAt,
    waitingMessage: "",
    results: room.lastResults || null,
  };

  const round = room.currentRound;
  const isActive = round ? round.playerIds.includes(player.id) : false;
  const isWriter = round ? round.writerIds.includes(player.id) : false;
  state.isWriter = isWriter;

  if (room.phase === PHASES.LOBBY) {
    state.waitingMessage = "Waiting for the teacher to start a round.";
  }

  if (room.phase === PHASES.PICK_WRITERS && round) {
    if (!isActive) {
      state.waitingMessage = "Round already started. Wait for the next one.";
    } else {
      state.question = round.question;
      state.waitingMessage = isWriter
        ? "You were picked to write a fake answer."
        : "Picking the fake-answer writers for this round.";
    }
  }

  if (room.phase === PHASES.SUBMITTING && round) {
    if (!isActive) {
      state.waitingMessage = "Round already started. Wait for the next one.";
    } else if (!isWriter) {
      state.question = round.question;
      state.waitingMessage = "Three players are writing fake answers. Get ready to vote.";
    } else {
      state.question = round.question;
      state.submitted = Boolean(round.fakeAnswers[player.id]);
    }
  }

  if (room.phase === PHASES.REVEALING && round) {
    if (!isActive) {
      state.waitingMessage = "Round already started. Wait for the next one.";
    } else {
      state.question = round.question;
      state.options = round.options.map((option) => ({
        id: option.id,
        text: option.text,
        disabled: true,
      }));
      state.waitingMessage = "All answers are now visible.";
    }
  }

  if (room.phase === PHASES.VOTING && round) {
    if (!isActive) {
      state.waitingMessage = "Voting in progress. Wait for the next round.";
    } else {
      state.question = round.question;
      state.voted = Boolean(round.votes[player.id]);
      state.options = round.options.map((option) => ({
        id: option.id,
        text: option.text,
        disabled: option.ownerId === player.id,
      }));
    }
  }

  if (room.phase === PHASES.RESULTS) {
    state.question = room.lastResults ? room.lastResults.question : "";
  }

  return state;
}

function syncRoom(roomCode) {
  const room = getRoom(roomCode);

  if (!room) {
    return;
  }

  const teacher = players[room.teacherId];
  if (teacher) {
    io.to(teacher.id).emit("teacherState", teacherState(room));
  }

  getRoomStudents(room).forEach((player) => {
    io.to(player.id).emit("studentState", studentState(room, player));
  });
}

function startSubmitting(room) {
  const round = room.currentRound;
  if (!round) {
    return;
  }

  clearRoomTimer(room);
  room.phase = PHASES.SUBMITTING;
  syncRoom(room.code);
  setRoomTimer(room, SUBMIT_MS, moveToReveal, true);
  maybeAdvance(room);
}

function moveToReveal(room) {
  const round = room.currentRound;
  if (!round) {
    return;
  }

  clearRoomTimer(room);
  const options = Object.entries(round.fakeAnswers).map(([ownerId, text], index) => ({
    id: "fake-" + index,
    text,
    ownerId,
    isCorrect: false,
  }));

  options.push({
    id: "real",
    text: round.correctAnswer,
    ownerId: null,
    isCorrect: true,
  });

  round.options = shuffle(options);
  room.phase = PHASES.REVEALING;
  syncRoom(room.code);
  setRoomTimer(room, REVEALING_MS, moveToVote, false);
}

function moveToVote(room) {
  const round = room.currentRound;
  if (!round) {
    return;
  }

  clearRoomTimer(room);

  if (round.options.length <= 1) {
    finishRound(room);
    return;
  }

  room.phase = PHASES.VOTING;
  syncRoom(room.code);
  setRoomTimer(room, VOTE_MS, finishRound, true);
}

function finishRound(room) {
  const round = room.currentRound;
  if (!round) {
    return;
  }

  clearRoomTimer(room);

  const optionMap = {};
  const correctPickers = [];
  const answerResults = round.options.map((option) => {
    optionMap[option.id] = option;
    return {
      id: option.id,
      text: option.text,
      ownerName: option.isCorrect ? "Correct Answer" : players[option.ownerId] ? players[option.ownerId].name : "Unknown",
      isCorrect: option.isCorrect,
      fooledNames: [],
      points: 0,
    };
  });

  const resultMap = {};
  answerResults.forEach((result) => {
    resultMap[result.id] = result;
  });

  Object.entries(round.votes).forEach(([voterId, optionId]) => {
    const voter = players[voterId];
    const option = optionMap[optionId];

    if (!voter || !option) {
      return;
    }

    const result = resultMap[option.id];

    if (option.isCorrect) {
      voter.score += 1000;
      correctPickers.push(voter.name);
      return;
    }

    if (option.ownerId && option.ownerId !== voterId && players[option.ownerId]) {
      players[option.ownerId].score += 500;
      result.fooledNames.push(voter.name);
      result.points += 500;
    }
  });

  const fakeResults = answerResults.filter((item) => !item.isCorrect);
  const mostFooledCount = fakeResults.reduce((max, item) => Math.max(max, item.fooledNames.length), 0);
  const mostFooledNames = fakeResults
    .filter((item) => item.fooledNames.length === mostFooledCount && mostFooledCount > 0)
    .map((item) => item.ownerName);

  room.lastResults = {
    question: round.question,
    correctAnswer: round.correctAnswer,
    correctPickers,
    mostFooledCount,
    mostFooledNames,
    answers: answerResults,
    leaderboard: getSortedStudents(room).map((player) => ({
      name: player.name,
      score: player.score,
    })),
  };

  room.currentRound = null;
  prompts[room.code] = null;
  room.phase = PHASES.RESULTS;
  syncRoom(room.code);
}

function maybeAdvance(room) {
  if (!room.currentRound) {
    return;
  }

  if (room.phase === PHASES.SUBMITTING) {
    const writerIds = getRoundWriterIds(room);
    const done = writerIds.every((id) => room.currentRound.fakeAnswers[id]);
    if (done) {
      moveToReveal(room);
    }
  }

  if (room.phase === PHASES.VOTING) {
    const activeIds = getRoundPlayerIds(room);
    const done = activeIds.every((id) => room.currentRound.votes[id]);
    if (done) {
      finishRound(room);
    }
  }
}

function removeStudent(socketId) {
  const player = players[socketId];
  if (!player) {
    return;
  }

  const room = rooms[player.roomCode];
  if (!room) {
    delete players[socketId];
    return;
  }

  room.studentIds = room.studentIds.filter((id) => id !== socketId);
  room.writerQueue = (room.writerQueue || []).filter((id) => id !== socketId);

  if (room.currentRound) {
    room.currentRound.playerIds = room.currentRound.playerIds.filter((id) => id !== socketId);
    room.currentRound.writerIds = room.currentRound.writerIds.filter((id) => id !== socketId);
    delete room.currentRound.fakeAnswers[socketId];
    delete room.currentRound.votes[socketId];
  }

  delete players[socketId];
  maybeAdvance(room);
  syncRoom(room.code);
}

function closeRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) {
    return;
  }

  clearRoomTimer(room);
  io.to(roomCode).emit("roomClosed");

  room.studentIds.forEach((id) => {
    delete players[id];
  });

  delete players[room.teacherId];
  delete prompts[roomCode];
  delete rooms[roomCode];
}

io.on("connection", (socket) => {
  socket.on("createRoom", () => {
    const roomCode = makeRoomCode();

    rooms[roomCode] = {
      code: roomCode,
      teacherId: socket.id,
      studentIds: [],
      writerQueue: [],
      phase: PHASES.LOBBY,
      phaseEndsAt: null,
      timerId: null,
      currentRound: null,
      lastResults: null,
    };

    players[socket.id] = {
      id: socket.id,
      roomCode,
      name: "Teacher",
      role: "teacher",
      score: 0,
    };

    prompts[roomCode] = null;
    socket.join(roomCode);
    socket.emit("roomCreated", { roomCode });
    syncRoom(roomCode);
  });

  socket.on("joinRoom", (data) => {
    const roomCode = cleanText(data.roomCode, 4).toUpperCase();
    const name = cleanText(data.name, 24);
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("joinError", "Room not found.");
      return;
    }

    if (!name) {
      socket.emit("joinError", "Enter a name.");
      return;
    }

    const nameTaken = getRoomStudents(room).some((player) => player.name.toLowerCase() === name.toLowerCase());
    if (nameTaken) {
      socket.emit("joinError", "That name is already in the room.");
      return;
    }

    players[socket.id] = {
      id: socket.id,
      roomCode,
      name,
      role: "student",
      score: 0,
    };

    room.studentIds.push(socket.id);
    socket.join(roomCode);
    socket.emit("joinedRoom", { roomCode, name });
    syncRoom(roomCode);
  });

  socket.on("startRound", (data) => {
    const player = players[socket.id];
    if (!player || player.role !== "teacher") {
      return;
    }

    const room = rooms[player.roomCode];
    if (!room) {
      return;
    }

    if (room.phase !== PHASES.LOBBY && room.phase !== PHASES.RESULTS) {
      socket.emit("teacherError", "Round already in progress.");
      return;
    }

    const question = cleanText(data.question, 200);
    const correctAnswer = cleanText(data.answer, 120);
    const activeStudents = getRoomStudents(room);

    if (!question || !correctAnswer) {
      socket.emit("teacherError", "Prompt is missing.");
      return;
    }

    if (activeStudents.length === 0) {
      socket.emit("teacherError", "Need at least one student.");
      return;
    }

    clearRoomTimer(room);
    room.phase = PHASES.PICK_WRITERS;
    room.lastResults = null;
    room.currentRound = {
      question,
      correctAnswer,
      fakeAnswers: {},
      votes: {},
      options: [],
      writerIds: pickRoundWriters(room),
      playerIds: activeStudents.map((student) => student.id),
    };
    prompts[room.code] = { question, correctAnswer };
    syncRoom(room.code);
    setRoomTimer(room, PICK_WRITERS_MS, startSubmitting, false);
  });

  socket.on("submitFakeAnswer", (data) => {
    const player = players[socket.id];
    if (!player || player.role !== "student") {
      return;
    }

    const room = rooms[player.roomCode];
    const answer = cleanText(data.answer, 120);

    if (!room || room.phase !== PHASES.SUBMITTING || !room.currentRound) {
      return;
    }

    if (!room.currentRound.writerIds.includes(player.id)) {
      return;
    }

    if (!answer) {
      return;
    }

    if (room.currentRound.fakeAnswers[player.id]) {
      return;
    }

    room.currentRound.fakeAnswers[player.id] = answer;
    syncRoom(room.code);
    maybeAdvance(room);
  });

  socket.on("voteAnswer", (data) => {
    const player = players[socket.id];
    if (!player || player.role !== "student") {
      return;
    }

    const room = rooms[player.roomCode];
    if (!room || room.phase !== PHASES.VOTING || !room.currentRound) {
      return;
    }

    if (!room.currentRound.playerIds.includes(player.id)) {
      return;
    }

    const option = room.currentRound.options.find((item) => item.id === data.optionId);
    if (!option) {
      return;
    }

    if (option.ownerId === player.id) {
      return;
    }

    if (room.currentRound.votes[player.id]) {
      return;
    }

    room.currentRound.votes[player.id] = option.id;
    syncRoom(room.code);
    maybeAdvance(room);
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];
    if (!player) {
      return;
    }

    if (player.role === "teacher") {
      closeRoom(player.roomCode);
      return;
    }

    removeStudent(socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
