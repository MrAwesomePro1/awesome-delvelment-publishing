const PLAYER_COLORS = [
  "#0f766e",
  "#b9802e",
  "#6f263d",
  "#557642",
  "#b5523e",
  "#345e6f",
  "#7a4f19",
  "#4f5d32",
  "#934b52",
  "#356a59",
  "#8f6d2f",
  "#5b4f8f"
];

const PHASE_LABELS = {
  setup: "Setup",
  reveal: "Private Roles",
  day: "Day",
  vote: "Vote",
  tie: "Tie",
  night: "Night",
  result: "Result"
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"></path></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  vote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-5"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7"></path><path d="M7 8h10l-5-5-5 5Z"></path></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15.5A8.5 8.5 0 0 1 8.5 3 7 7 0 1 0 21 15.5Z"></path></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.2 6.1L20 10l-5.8 1.9L12 18l-2.2-6.1L4 10l5.8-1.9L12 2Z"></path><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"></path></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>'
};

const DEFAULT_DRAFT = {
  playerCount: 9,
  demonCount: 2,
  names: Array.from({ length: 12 }, (_, index) => `Player ${index + 1}`).join(", ")
};

const MEMBERSHIP_STORAGE_KEY = "awesomeDelvelmentRewards";

const dom = {
  actionPanel: document.querySelector("#actionPanel"),
  playerGrid: document.querySelector("#playerGrid"),
  discussionList: document.querySelector("#discussionList"),
  eventLog: document.querySelector("#eventLog"),
  tableMessage: document.querySelector("#tableMessage"),
  toast: document.querySelector("#toast"),
  roundStat: document.querySelector("#roundStat"),
  phaseStat: document.querySelector("#phaseStat"),
  aliveStat: document.querySelector("#aliveStat"),
  outStat: document.querySelector("#outStat")
};

let state = createInitialState();
let toastTimer = 0;

function hasActiveMembership() {
  try {
    const saved = JSON.parse(localStorage.getItem(MEMBERSHIP_STORAGE_KEY));
    const passClaimed = Boolean(saved?.claimed?.pass);
    const expiresAt = Math.max(0, Number(saved?.passExpiresAt) || 0);
    return passClaimed && (!expiresAt || expiresAt > Date.now());
  } catch (error) {
    return false;
  }
}

function updateMembershipGate() {
  const gate = document.querySelector("#membershipGate");
  const isLocked = !hasActiveMembership();
  gate.hidden = !isLocked;
  document.body.classList.toggle("membership-locked", isLocked);
}

function createInitialState(draft = DEFAULT_DRAFT) {
  return {
    phase: "setup",
    setupDraft: { ...draft },
    players: [],
    round: 1,
    privateOpen: false,
    revealIndex: 0,
    selectedId: null,
    selectedCoverId: null,
    voteDraft: {},
    lastVote: [],
    tiedIds: [],
    lastNight: null,
    notes: [],
    log: [],
    result: null
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function normalizeName(name, fallback) {
  const clean = String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 22);
  return clean || fallback;
}

function activePlayers() {
  return state.players.filter((player) => player.alive);
}

function activeDemons() {
  return activePlayers().filter((player) => player.role === "demon");
}

function activeGuests() {
  return activePlayers().filter((player) => player.role !== "demon");
}

function phaseTitle() {
  return PHASE_LABELS[state.phase] || "Match";
}

function roleName(player) {
  if (player.joinedDemons) {
    return "Joined demons";
  }
  return player.role === "demon" ? "Demon" : "Guest";
}

function displayStatus(player) {
  if (player.alive) {
    return "Active";
  }

  if (player.status === "banished") {
    return `Banished as ${roleName(player)}`;
  }

  if (player.status === "claimed") {
    return `Joined demons for night ${player.outRound}, then out`;
  }

  return "Out";
}

function addLog(message) {
  const id = globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random());
  state.log.unshift({ id, round: state.round, message });
}

function addNote(title, text) {
  const id = globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random());
  state.notes.unshift({ id, title, text });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    dom.toast.classList.remove("is-visible");
  }, 2400);
}

function readSetupDraft() {
  const playerCount = Number(document.querySelector("#playerCountInput")?.value || state.setupDraft.playerCount);
  const demonCount = Number(document.querySelector("#demonCountInput")?.value || state.setupDraft.demonCount);
  const names = document.querySelector("#namesInput")?.value || state.setupDraft.names;
  const maxDemons = Math.max(1, Math.floor(playerCount / 4));

  return {
    playerCount: clamp(playerCount, 7, 12),
    demonCount: clamp(demonCount, 1, maxDemons),
    names
  };
}

function buildNames(playerCount, namesText) {
  const seen = new Set();
  const typedNames = String(namesText || "")
    .split(/[\n,]+/)
    .map((name, index) => normalizeName(name, `Player ${index + 1}`))
    .filter(Boolean);
  const roster = [];

  typedNames.forEach((name) => {
    const key = name.toLowerCase();
    if (roster.length < playerCount && !seen.has(key)) {
      seen.add(key);
      roster.push(name);
    }
  });

  while (roster.length < playerCount) {
    roster.push(`Player ${roster.length + 1}`);
  }

  return roster;
}

function createPlayers(setup) {
  const names = buildNames(setup.playerCount, setup.names);
  const demonIds = new Set(shuffle(names.map((_, index) => index)).slice(0, setup.demonCount));

  return names.map((name, id) => ({
    id,
    name,
    role: demonIds.has(id) ? "demon" : "guest",
    alive: true,
    status: "active",
    joinedDemons: false,
    outRound: null,
    pressure: 0,
    roleSeen: false,
    color: PLAYER_COLORS[id % PLAYER_COLORS.length]
  }));
}

function startMatch() {
  const setup = readSetupDraft();
  state = createInitialState(setup);
  state.players = createPlayers(setup);
  state.phase = "reveal";
  addLog("Roles are dealt to real players.");
  addNote("No NPCs", "Every vote and night choice is entered by the people playing.");
  render();
}

function currentRevealPlayer() {
  return state.players[state.revealIndex] || state.players[0];
}

function nextReveal() {
  const current = currentRevealPlayer();
  if (state.privateOpen) {
    current.roleSeen = true;
    state.privateOpen = false;
  }
  state.revealIndex = clamp(state.revealIndex + 1, 0, state.players.length - 1);
  render();
}

function previousReveal() {
  if (state.privateOpen) {
    currentRevealPlayer().roleSeen = true;
    state.privateOpen = false;
  }
  state.revealIndex = clamp(state.revealIndex - 1, 0, state.players.length - 1);
  render();
}

function beginDay() {
  state.phase = "day";
  state.privateOpen = false;
  state.selectedId = null;
  state.selectedCoverId = null;
  state.voteDraft = {};
  addLog(`Round ${state.round} day begins.`);
  addNote("Day", "Players discuss at the table. The app will not speak or vote for anyone.");
  render();
}

function beginVote() {
  state.phase = "vote";
  state.voteDraft = {};
  state.selectedId = null;
  render();
}

function resolveVote() {
  const active = activePlayers();
  const missingVoter = active.find((voter) => state.voteDraft[voter.id] === undefined || state.voteDraft[voter.id] === "");
  if (missingVoter) {
    showToast(`Add ${missingVoter.name}'s vote first.`);
    return;
  }

  const ballots = active.map((voter) => ({
    voterId: voter.id,
    targetId: Number(state.voteDraft[voter.id])
  }));
  const tally = new Map();

  ballots.forEach((ballot) => {
    tally.set(ballot.targetId, (tally.get(ballot.targetId) || 0) + 1);
  });

  const topVotes = Math.max(...tally.values());
  const tiedIds = [...tally.entries()]
    .filter(([, votes]) => votes === topVotes)
    .map(([id]) => id);

  state.lastVote = ballots;

  if (tiedIds.length > 1) {
    state.tiedIds = tiedIds;
    state.phase = "tie";
    addNote("Vote Tie", `${tiedIds.map((id) => playerById(id).name).join(", ")} are tied.`);
    render();
    return;
  }

  banishPlayer(tiedIds[0]);
}

function chooseTie(targetId) {
  if (targetId === "none") {
    state.tiedIds = [];
    state.phase = "night";
    addLog("The vote tied. No one is banished.");
    addNote("No Banish", "The tied vote sends the table straight into night.");
    render();
    return;
  }

  banishPlayer(Number(targetId));
}

function banishPlayer(targetId) {
  const target = playerById(targetId);
  if (!target || !target.alive) {
    showToast("Choose an active player.");
    return;
  }

  target.alive = false;
  target.status = "banished";
  target.outRound = state.round;
  state.tiedIds = [];
  state.selectedId = null;

  addLog(`${target.name} is banished by human vote. They were ${roleName(target)}.`);
  addNote("Banishment", `${target.name} leaves the table as ${roleName(target)}.`);

  if (evaluateWin()) {
    render();
    return;
  }

  state.phase = "night";
  render();
}

function resolveNight() {
  const ally = playerById(state.selectedId);
  const cover = playerById(state.selectedCoverId);

  if (!ally || !ally.alive || ally.role === "demon") {
    showToast("Choose an active guest as the night ally.");
    return;
  }

  if (!cover || !cover.alive || cover.id === ally.id) {
    showToast("Choose a different active player for suspicion.");
    return;
  }

  ally.alive = false;
  ally.status = "claimed";
  ally.joinedDemons = true;
  ally.outRound = state.round;
  cover.pressure = clamp(cover.pressure + 1, 0, 5);

  state.lastNight = {
    round: state.round,
    targetId: ally.id,
    coverTargetId: cover.id
  };

  addLog(`${ally.name} joined the demons for one night, put pressure on ${cover.name}, then left at dawn.`);
  addNote("Night Ally", `${ally.name} joined the demon team for the night. ${cover.name} starts the day under pressure.`);

  state.round += 1;
  state.selectedId = null;
  state.selectedCoverId = null;
  state.voteDraft = {};

  if (evaluateWin()) {
    render();
    return;
  }

  state.phase = "day";
  addLog(`Round ${state.round} day begins.`);
  render();
}

function evaluateWin() {
  const demons = activeDemons();
  const guests = activeGuests();

  if (!state.players.length) {
    return false;
  }

  if (demons.length === 0) {
    state.phase = "result";
    state.result = {
      winner: "Guests",
      text: "All hidden demons are out of the match."
    };
    addLog("The guests win.");
    return true;
  }

  if (guests.length === 0 || demons.length >= guests.length) {
    state.phase = "result";
    state.result = {
      winner: "Demons",
      text: "The hidden team controls the final table."
    };
    addLog("The demons win.");
    return true;
  }

  return false;
}

function playerById(id) {
  return state.players.find((player) => player.id === Number(id));
}

function restart() {
  const draft = state.setupDraft ? { ...state.setupDraft } : { ...DEFAULT_DRAFT };
  state = createInitialState(draft);
  render();
}

function render() {
  renderStats();
  renderTableMessage();
  renderPlayers();
  renderActionPanel();
  renderNotes();
  renderLog();
}

function renderStats() {
  const alive = activePlayers().length;
  const out = state.players.length ? state.players.length - alive : 0;

  dom.roundStat.textContent = state.players.length ? String(state.round) : "-";
  dom.phaseStat.textContent = phaseTitle();
  dom.aliveStat.textContent = state.players.length ? String(alive) : "-";
  dom.outStat.textContent = state.players.length ? String(out) : "-";
}

function renderTableMessage() {
  if (state.phase === "setup") {
    dom.tableMessage.textContent = "Enter real player names.";
    return;
  }

  if (state.phase === "reveal") {
    dom.tableMessage.textContent = "Pass the device so each player sees only their own role.";
    return;
  }

  if (state.phase === "night") {
    dom.tableMessage.textContent = "The human demon team chooses the night ally.";
    return;
  }

  if (state.phase === "result") {
    dom.tableMessage.textContent = `${state.result?.winner || "A side"} wins.`;
    return;
  }

  const lastNight = state.lastNight
    ? playerById(state.lastNight.targetId)?.name
    : null;
  dom.tableMessage.textContent = lastNight
    ? `${lastNight} is gone after joining the demons for a night.`
    : "Everyone looks ordinary at the table.";
}

function renderPlayers() {
  if (!state.players.length) {
    dom.playerGrid.innerHTML = "";
    return;
  }

  dom.playerGrid.innerHTML = state.players.map((player) => renderPlayerCard(player)).join("");
}

function renderPlayerCard(player) {
  const selected = state.selectedId === player.id || state.selectedCoverId === player.id;
  const pressure = clamp(player.pressure * 20, 0, 100);
  const statusClass = player.status === "claimed" || player.status === "banished" ? " warning" : "";
  const revealMark = state.phase === "reveal" && player.roleSeen ? `<span class="private-pill">Viewed</span>` : "";

  return `
    <article class="player-card${player.alive ? "" : " is-out"}${selected ? " is-selected" : ""}">
      <div class="avatar-row">
        <div class="avatar" style="--avatar: ${player.color}">
          <span>${escapeHtml(initials(player.name))}</span>
        </div>
        <span class="status-pill${statusClass}">${player.alive ? "Active" : "Out"}</span>
      </div>
      <div>
        <div class="player-name">${escapeHtml(player.name)}</div>
        <div class="player-status">${escapeHtml(displayStatus(player))}</div>
        ${revealMark}
      </div>
      <div class="meter-wrap">
        <div class="meter-label">
          <span>Pressure</span>
          <span>${player.pressure}</span>
        </div>
        <div class="meter" aria-hidden="true"><span style="--meter: ${pressure}%"></span></div>
      </div>
    </article>
  `;
}

function renderActionPanel() {
  if (state.phase === "setup") {
    renderSetupPanel();
    return;
  }

  if (state.phase === "reveal") {
    renderRevealPanel();
    return;
  }

  if (state.phase === "day") {
    renderDayPanel();
    return;
  }

  if (state.phase === "vote") {
    renderVotePanel();
    return;
  }

  if (state.phase === "tie") {
    renderTiePanel();
    return;
  }

  if (state.phase === "night") {
    renderNightPanel();
    return;
  }

  renderResultPanel();
}

function renderSetupPanel() {
  const draft = state.setupDraft;
  const maxDemons = Math.max(1, Math.floor(Number(draft.playerCount) / 4));
  const demonOptions = Array.from({ length: maxDemons }, (_, index) => index + 1)
    .map((count) => `<option value="${count}"${Number(draft.demonCount) === count ? " selected" : ""}>${count}</option>`)
    .join("");

  dom.actionPanel.innerHTML = `
    <section class="phase-panel">
      <div class="panel-heading">
        <span class="eyebrow">Setup</span>
        <h2>Start Human Match</h2>
      </div>
      <div class="field-group">
        <span>Players</span>
        <div class="range-row">
          <input id="playerCountInput" data-draft="playerCount" type="range" min="7" max="12" value="${draft.playerCount}" />
          <output id="playerCountOutput">${draft.playerCount}</output>
        </div>
      </div>
      <label class="field">
        <span>Demons</span>
        <select id="demonCountInput" data-draft="demonCount">${demonOptions}</select>
      </label>
      <label class="field">
        <span>Player names</span>
        <textarea id="namesInput" data-draft="names">${escapeHtml(draft.names)}</textarea>
      </label>
      <button class="primary" type="button" data-action="start-match">
        ${ICONS.play}
        <span>Deal Roles</span>
      </button>
    </section>
  `;
}

function renderRevealPanel() {
  const player = currentRevealPlayer();
  const demonTeam = state.players.filter((entry) => entry.role === "demon");
  const teammates = player.role === "demon"
    ? demonTeam.map((entry) => `<span class="private-pill">${escapeHtml(entry.name)}</span>`).join("")
    : `<span class="private-pill">Guest team</span>`;
  const viewedCount = state.players.filter((entry) => entry.roleSeen).length + (state.privateOpen && !player.roleSeen ? 1 : 0);

  dom.actionPanel.innerHTML = `
    <section class="phase-panel">
      <div class="panel-heading">
        <span class="eyebrow">${state.revealIndex + 1} of ${state.players.length}</span>
        <h2>${escapeHtml(player.name)}</h2>
      </div>
      <div class="role-card${state.privateOpen ? "" : " is-hidden"}">
        ${state.privateOpen ? `
          <h3 class="role-title">${escapeHtml(player.role === "demon" ? "Demon" : "Guest")}</h3>
          <p class="phase-copy">${escapeHtml(player.role === "demon"
            ? "At night, your hidden team chooses one guest to join you for that night. They leave at dawn."
            : "Find every hidden demon before they control the final table.")}</p>
          <div class="role-team">${teammates}</div>
        ` : `
          <div>
            <h3 class="role-title">Role Hidden</h3>
            <p class="phase-copy">Give the device to ${escapeHtml(player.name)}.</p>
          </div>
        `}
      </div>
      <button class="secondary" type="button" data-action="toggle-private">
        ${ICONS.eye}
        <span>${state.privateOpen ? "Hide Role" : "Reveal Role"}</span>
      </button>
      <div class="split-fields">
        <button class="secondary" type="button" data-action="previous-reveal" ${state.revealIndex === 0 ? "disabled" : ""}>Previous</button>
        <button class="secondary" type="button" data-action="next-reveal" ${state.revealIndex === state.players.length - 1 ? "disabled" : ""}>Next</button>
      </div>
      <p class="phase-copy">${viewedCount} role cards viewed.</p>
      <button class="primary" type="button" data-action="begin-day">
        ${ICONS.play}
        <span>Begin Day</span>
      </button>
    </section>
  `;
}

function renderDayPanel() {
  dom.actionPanel.innerHTML = `
    <section class="phase-panel">
      <div class="panel-heading">
        <span class="eyebrow">Round ${state.round}</span>
        <h2>Day Table</h2>
      </div>
      <p class="phase-copy">${escapeHtml(daySummary())}</p>
      <button class="primary" type="button" data-action="begin-vote">
        ${ICONS.vote}
        <span>Start Human Vote</span>
      </button>
    </section>
  `;
}

function daySummary() {
  if (!state.lastNight) {
    return "All active players discuss together.";
  }

  const ally = playerById(state.lastNight.targetId);
  const cover = playerById(state.lastNight.coverTargetId);
  return cover
    ? `${ally.name} left after joining the demons for one night. ${cover.name} has pressure from the night.`
    : `${ally.name} left after joining the demons for one night.`;
}

function renderVotePanel() {
  const active = activePlayers();
  const rows = active.map((voter) => {
    const options = active
      .filter((target) => target.id !== voter.id)
      .map((target) => `<option value="${target.id}"${Number(state.voteDraft[voter.id]) === target.id ? " selected" : ""}>${escapeHtml(target.name)}</option>`)
      .join("");
    return `
      <label class="field">
        <span>${escapeHtml(voter.name)}</span>
        <select data-vote-voter="${voter.id}">
          <option value="">Choose vote</option>
          ${options}
        </select>
      </label>
    `;
  }).join("");

  dom.actionPanel.innerHTML = `
    <section class="phase-panel">
      <div class="panel-heading">
        <span class="eyebrow">Round ${state.round}</span>
        <h2>Human Vote</h2>
      </div>
      <div class="candidate-list">${rows}</div>
      <button class="primary danger" type="button" data-action="lock-vote">
        ${ICONS.vote}
        <span>Resolve Vote</span>
      </button>
    </section>
  `;
}

function renderTiePanel() {
  const buttons = state.tiedIds.map((id) => {
    const player = playerById(id);
    return `
      <button class="mini-button" type="button" data-action="choose-tie" data-id="${player.id}">
        <span>Banish ${escapeHtml(player.name)}</span>
      </button>
    `;
  }).join("");

  dom.actionPanel.innerHTML = `
    <section class="phase-panel">
      <div class="panel-heading">
        <span class="eyebrow">Vote Tie</span>
        <h2>Human Tie Choice</h2>
      </div>
      <div class="candidate-list">
        ${buttons}
        <button class="mini-button" type="button" data-action="choose-tie" data-id="none">
          <span>No Banishment</span>
        </button>
      </div>
    </section>
  `;
}

function renderNightPanel() {
  const demons = activeDemons();
  const guests = activeGuests();

  if (!demons.length || !guests.length) {
    evaluateWin();
    renderResultPanel();
    return;
  }

  const demonNames = demons.map((player) => `<span class="private-pill">${escapeHtml(player.name)}</span>`).join("");
  const allyButtons = guests.map((player) => `
    <button class="mini-button${state.selectedId === player.id ? " is-selected" : ""}" type="button" data-action="select-night-ally" data-id="${player.id}">
      <span>${escapeHtml(player.name)}</span>
    </button>
  `).join("");
  const coverButtons = activePlayers()
    .filter((player) => player.id !== state.selectedId)
    .map((player) => `
      <button class="mini-button${state.selectedCoverId === player.id ? " is-selected" : ""}" type="button" data-action="select-cover" data-id="${player.id}">
        <span>${escapeHtml(player.name)}</span>
      </button>
    `).join("");

  dom.actionPanel.innerHTML = `
    <section class="phase-panel">
      <div class="panel-heading">
        <span class="eyebrow">Night ${state.round}</span>
        <h2>Demon Night</h2>
      </div>
      <div class="role-card">
        <h3 class="role-title">Hidden Team</h3>
        <div class="role-team">${demonNames}</div>
      </div>
      <h3>Night ally</h3>
      <div class="candidate-list">${allyButtons}</div>
      <h3>Suspicion target</h3>
      <div class="candidate-list">${coverButtons}</div>
      <button class="primary" type="button" data-action="resolve-night" ${state.selectedId === null || state.selectedCoverId === null ? "disabled" : ""}>
        ${ICONS.moon}
        <span>Resolve Night</span>
      </button>
    </section>
  `;
}

function renderResultPanel() {
  const revealRows = state.players.map((player) => `
    <div class="vote-row">
      <span>${escapeHtml(player.name)}</span>
      <strong>${escapeHtml(roleName(player))}</strong>
    </div>
  `).join("");

  dom.actionPanel.innerHTML = `
    <section class="phase-panel">
      <div class="result-banner">
        <span class="eyebrow">Winner</span>
        <h2>${escapeHtml(state.result?.winner || "Match Over")}</h2>
        <p class="phase-copy">${escapeHtml(state.result?.text || "")}</p>
      </div>
      <div class="vote-tally">${revealRows}</div>
      <button class="primary" type="button" data-action="restart">
        ${ICONS.refresh}
        <span>New Match</span>
      </button>
    </section>
  `;
}

function renderNotes() {
  if (!state.notes.length) {
    dom.discussionList.innerHTML = `<p class="empty-state">No human decisions yet.</p>`;
    return;
  }

  dom.discussionList.innerHTML = state.notes.slice(0, 6).map((item) => `
    <div class="talk-item">
      <div class="talk-avatar" style="--avatar: #0f766e">${escapeHtml(item.title.slice(0, 2).toUpperCase())}</div>
      <div class="talk-body">
        <div class="talk-meta">
          <span class="talk-name">${escapeHtml(item.title)}</span>
          <span class="tone-pill">Manual</span>
        </div>
        <p>${escapeHtml(item.text)}</p>
      </div>
    </div>
  `).join("");
}

function renderLog() {
  if (!state.log.length) {
    dom.eventLog.innerHTML = `<li>No events yet.</li>`;
    return;
  }

  dom.eventLog.innerHTML = state.log
    .slice(0, 12)
    .map((entry) => `<li>${escapeHtml(entry.message)}</li>`)
    .join("");
}

document.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.action;

  if (action === "start-match") {
    startMatch();
  }

  if (action === "toggle-private") {
    if (state.phase !== "reveal") {
      return;
    }
    state.privateOpen = !state.privateOpen;
    if (!state.privateOpen) {
      currentRevealPlayer().roleSeen = true;
    }
    render();
  }

  if (action === "next-reveal") {
    nextReveal();
  }

  if (action === "previous-reveal") {
    previousReveal();
  }

  if (action === "begin-day") {
    beginDay();
  }

  if (action === "begin-vote") {
    beginVote();
  }

  if (action === "lock-vote") {
    resolveVote();
  }

  if (action === "choose-tie") {
    chooseTie(actionTarget.dataset.id);
  }

  if (action === "select-night-ally") {
    state.selectedId = Number(actionTarget.dataset.id);
    if (state.selectedCoverId === state.selectedId) {
      state.selectedCoverId = null;
    }
    render();
  }

  if (action === "select-cover") {
    state.selectedCoverId = Number(actionTarget.dataset.id);
    render();
  }

  if (action === "resolve-night") {
    resolveNight();
  }

  if (action === "restart") {
    restart();
  }
});

document.addEventListener("input", (event) => {
  const field = event.target.dataset.draft;
  if (!field || state.phase !== "setup") {
    return;
  }

  if (field === "playerCount") {
    state.setupDraft.playerCount = Number(event.target.value);
    const maxDemons = Math.max(1, Math.floor(state.setupDraft.playerCount / 4));
    state.setupDraft.demonCount = clamp(Number(state.setupDraft.demonCount), 1, maxDemons);
    render();
    return;
  }

  state.setupDraft[field] = event.target.value;
});

document.addEventListener("change", (event) => {
  const draftField = event.target.dataset.draft;
  if (draftField && state.phase === "setup") {
    state.setupDraft[draftField] = draftField === "demonCount" ? Number(event.target.value) : event.target.value;
    return;
  }

  const voterId = event.target.dataset.voteVoter;
  if (voterId !== undefined && state.phase === "vote") {
    state.voteDraft[voterId] = event.target.value;
  }
});

window.addEventListener("pageshow", updateMembershipGate);
window.addEventListener("storage", updateMembershipGate);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateMembershipGate();
  }
});

updateMembershipGate();
render();
