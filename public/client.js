const socket = io();

if (document.body.id === "teacher-page") {
  let roomCode = "";
  let prompts = loadPrompts();
  let editId = "";

  const createRoomBtn = document.getElementById("create-room-btn");
  const teacherStart = document.getElementById("teacher-start");
  const teacherApp = document.getElementById("teacher-app");
  const teacherPlayersBox = document.getElementById("teacher-players-box");
  const teacherPromptsBox = document.getElementById("teacher-prompts-box");
  const teacherResultsBox = document.getElementById("teacher-results-box");
  const teacherError = document.getElementById("teacher-error");
  const roomCodeText = document.getElementById("room-code");
  const teacherStatus = document.getElementById("teacher-status");
  const teacherQuestion = document.getElementById("teacher-question");
  const teacherPlayers = document.getElementById("teacher-players");
  const promptQuestion = document.getElementById("prompt-question");
  const promptAnswer = document.getElementById("prompt-answer");
  const savePromptBtn = document.getElementById("save-prompt-btn");
  const clearPromptBtn = document.getElementById("clear-prompt-btn");
  const exportPromptsBtn = document.getElementById("export-prompts-btn");
  const importPromptsInput = document.getElementById("import-prompts-input");
  const promptList = document.getElementById("prompt-list");
  const teacherResults = document.getElementById("teacher-results");

  createRoomBtn.addEventListener("click", () => {
    teacherError.textContent = "";
    socket.emit("createRoom");
  });

  savePromptBtn.addEventListener("click", () => {
    const question = promptQuestion.value.trim();
    const answer = promptAnswer.value.trim();

    if (!question || !answer) {
      return;
    }

    if (editId) {
      prompts = prompts.map((prompt) => {
        if (prompt.id === editId) {
          return { id: prompt.id, question, answer };
        }
        return prompt;
      });
    } else {
      prompts.push({
        id: String(Date.now()),
        question,
        answer,
      });
    }

    savePrompts(prompts);
    clearPromptForm();
    renderPromptList();
  });

  clearPromptBtn.addEventListener("click", () => {
    clearPromptForm();
  });

  exportPromptsBtn.addEventListener("click", () => {
    const text = JSON.stringify(prompts, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "prompts.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  importPromptsInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const list = Array.isArray(parsed) ? parsed : [];
        prompts = list
          .filter((item) => item && item.question && item.answer)
          .map((item, index) => ({
            id: item.id || String(Date.now() + index),
            question: String(item.question),
            answer: String(item.answer),
          }));
        savePrompts(prompts);
        clearPromptForm();
        renderPromptList();
      } catch (error) {
        teacherError.textContent = "Could not import file.";
      }
    };
    reader.readAsText(file);
    importPromptsInput.value = "";
  });

  socket.on("roomCreated", (data) => {
    roomCode = data.roomCode;
    teacherStart.classList.add("hidden");
    teacherApp.classList.remove("hidden");
    teacherPlayersBox.classList.remove("hidden");
    teacherPromptsBox.classList.remove("hidden");
    roomCodeText.textContent = roomCode;
  });

  socket.on("teacherState", (state) => {
    roomCode = state.roomCode;
    roomCodeText.textContent = state.roomCode;
    teacherStatus.textContent = state.phase;
    teacherQuestion.textContent = state.question ? "Question: " + state.question : "";

    teacherPlayers.innerHTML = "";
    state.students.forEach((student) => {
      const item = document.createElement("li");
      item.textContent = student.name + " - " + student.score;
      teacherPlayers.appendChild(item);
    });

    if (state.results) {
      teacherResultsBox.classList.remove("hidden");
      renderResults(teacherResults, state.results);
    } else {
      teacherResultsBox.classList.add("hidden");
      teacherResults.innerHTML = "";
    }
  });

  socket.on("teacherError", (message) => {
    teacherError.textContent = message;
  });

  function renderPromptList() {
    promptList.innerHTML = "";

    if (prompts.length === 0) {
      promptList.textContent = "No prompts yet.";
      return;
    }

    prompts.forEach((prompt) => {
      const box = document.createElement("div");
      box.className = "prompt-item";

      const question = document.createElement("p");
      question.textContent = "Q: " + prompt.question;

      const answer = document.createElement("p");
      answer.textContent = "A: " + prompt.answer;

      const startBtn = document.createElement("button");
      startBtn.textContent = "Start Round";
      startBtn.addEventListener("click", () => {
        if (!roomCode) {
          return;
        }
        teacherError.textContent = "";
        socket.emit("startRound", {
          roomCode,
          question: prompt.question,
          answer: prompt.answer,
        });
      });

      const editBtn = document.createElement("button");
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        editId = prompt.id;
        promptQuestion.value = prompt.question;
        promptAnswer.value = prompt.answer;
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        prompts = prompts.filter((item) => item.id !== prompt.id);
        savePrompts(prompts);
        if (editId === prompt.id) {
          clearPromptForm();
        }
        renderPromptList();
      });

      box.appendChild(question);
      box.appendChild(answer);
      box.appendChild(startBtn);
      box.appendChild(editBtn);
      box.appendChild(deleteBtn);
      promptList.appendChild(box);
    });
  }

  function clearPromptForm() {
    editId = "";
    promptQuestion.value = "";
    promptAnswer.value = "";
  }

  function loadPrompts() {
    try {
      const saved = localStorage.getItem("fibbage-prompts");
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      return [];
    }
  }

  function savePrompts(list) {
    localStorage.setItem("fibbage-prompts", JSON.stringify(list));
  }

  renderPromptList();
}

if (document.body.id === "student-page") {
  const joinBox = document.getElementById("join-box");
  const studentApp = document.getElementById("student-app");
  const joinName = document.getElementById("join-name");
  const joinRoom = document.getElementById("join-room");
  const joinBtn = document.getElementById("join-btn");
  const joinError = document.getElementById("join-error");
  const studentName = document.getElementById("student-name");
  const studentRoom = document.getElementById("student-room");
  const studentScore = document.getElementById("student-score");
  const studentTitle = document.getElementById("student-title");
  const studentQuestion = document.getElementById("student-question");
  const studentMessage = document.getElementById("student-message");
  const submitBox = document.getElementById("submit-box");
  const voteBox = document.getElementById("vote-box");
  const resultsBox = document.getElementById("results-box");
  const fakeAnswerInput = document.getElementById("fake-answer-input");
  const submitFakeBtn = document.getElementById("submit-fake-btn");
  const voteOptions = document.getElementById("vote-options");
  const studentResults = document.getElementById("student-results");

  joinBtn.addEventListener("click", () => {
    joinError.textContent = "";
    socket.emit("joinRoom", {
      name: joinName.value,
      roomCode: joinRoom.value,
    });
  });

  submitFakeBtn.addEventListener("click", () => {
    const answer = fakeAnswerInput.value.trim();
    if (!answer) {
      return;
    }
    socket.emit("submitFakeAnswer", { answer });
  });

  socket.on("joinedRoom", (data) => {
    joinBox.classList.add("hidden");
    studentApp.classList.remove("hidden");
    studentName.textContent = data.name;
    studentRoom.textContent = data.roomCode;
  });

  socket.on("joinError", (message) => {
    joinError.textContent = message;
  });

  socket.on("studentState", (state) => {
    studentName.textContent = state.name;
    studentRoom.textContent = state.roomCode;
    studentScore.textContent = state.score;
    studentQuestion.textContent = state.question;

    submitBox.classList.add("hidden");
    voteBox.classList.add("hidden");
    resultsBox.classList.add("hidden");
    studentMessage.textContent = "";

    if (state.phase === "lobby") {
      studentTitle.textContent = "Waiting";
      studentMessage.textContent = state.waitingMessage;
    }

    if (state.phase === "submit") {
      if (state.waitingMessage) {
        studentTitle.textContent = "Waiting";
        studentMessage.textContent = state.waitingMessage;
      } else if (state.submitted) {
        studentTitle.textContent = "Submitted";
        studentMessage.textContent = "Your fake answer is in. Waiting for others.";
      } else {
        studentTitle.textContent = "Write a Fake Answer";
        submitBox.classList.remove("hidden");
      }
    }

    if (state.phase === "vote") {
      if (state.waitingMessage) {
        studentTitle.textContent = "Waiting";
        studentMessage.textContent = state.waitingMessage;
      } else if (state.voted) {
        studentTitle.textContent = "Vote Sent";
        studentMessage.textContent = "Waiting for everyone to vote.";
      } else {
        studentTitle.textContent = "Pick the Real Answer";
        voteBox.classList.remove("hidden");
        renderVoteOptions(state.options);
      }
    }

    if (state.phase === "results") {
      studentTitle.textContent = "Results";
      resultsBox.classList.remove("hidden");
      renderResults(studentResults, state.results);
    }
  });

  socket.on("roomClosed", () => {
    joinBox.classList.remove("hidden");
    studentApp.classList.add("hidden");
    joinError.textContent = "Room closed.";
  });

  function renderVoteOptions(options) {
    voteOptions.innerHTML = "";

    options.forEach((option) => {
      const button = document.createElement("button");
      button.textContent = option.text;
      button.disabled = option.disabled;
      button.addEventListener("click", () => {
        socket.emit("voteAnswer", { optionId: option.id });
      });
      voteOptions.appendChild(button);
    });
  }
}

function renderResults(target, results) {
  if (!results) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = "";

  const answer = document.createElement("p");
  answer.textContent = "Correct answer: " + results.correctAnswer;
  target.appendChild(answer);

  const correctPickers = document.createElement("p");
  correctPickers.textContent = results.correctPickers.length
    ? "Picked correctly: " + results.correctPickers.join(", ")
    : "Picked correctly: nobody";
  target.appendChild(correctPickers);

  results.answers.forEach((item) => {
    const box = document.createElement("div");
    box.className = "result-item";

    const line1 = document.createElement("p");
    line1.textContent = item.text;

    const line2 = document.createElement("p");
    line2.textContent = item.isCorrect
      ? "This was the real answer."
      : "Written by: " + item.ownerName;

    const line3 = document.createElement("p");
    line3.textContent = item.fooledNames.length
      ? "Fooled: " + item.fooledNames.join(", ")
      : "Fooled: nobody";

    const line4 = document.createElement("p");
    line4.textContent = "Points from this answer: " + item.points;

    box.appendChild(line1);
    box.appendChild(line2);
    box.appendChild(line3);
    box.appendChild(line4);
    target.appendChild(box);
  });

  const boardTitle = document.createElement("h3");
  boardTitle.textContent = "Leaderboard";
  target.appendChild(boardTitle);

  const board = document.createElement("ul");
  results.leaderboard.forEach((item) => {
    const row = document.createElement("li");
    row.textContent = item.name + " - " + item.score;
    board.appendChild(row);
  });
  target.appendChild(board);
}
