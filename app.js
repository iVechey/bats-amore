const STORAGE_KEY = "batsAmore.roster.v1";
const LINEUP_KEY = "batsAmore.lineup.v2";

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "L", "LC", "RC", "R"];
const INNINGS = 7;

// Print-friendly position names, in print row order.
// `null` entries render as blank spacer rows.
const PRINT_POSITION_ROWS = [
  ["P", "Pitcher"],
  ["C", "Catcher"],
  ["1B", "First Base"],
  ["2B", "Second Base"],
  null,
  ["SS", "Short Stop"],
  ["3B", "Third Base"],
  ["L", "Left Field"],
  ["LC", "Left Center"],
  ["RC", "Right Center"],
  ["R", "Right Field"],
];

const POS_ALIASES = {
  P: "P", PITCHER: "P", PITCH: "P",
  C: "C", CATCHER: "C", CATCH: "C",
  "1B": "1B", "1ST": "1B", FIRST: "1B", FIRSTBASE: "1B",
  "2B": "2B", "2ND": "2B", SECOND: "2B", SECONDBASE: "2B",
  "3B": "3B", "3RD": "3B", THIRD: "3B", THIRDBASE: "3B",
  SS: "SS", SHORT: "SS", SHORTSTOP: "SS",
  L: "L", LF: "L", LEFT: "L", LEFTFIELD: "L",
  LC: "LC", LCF: "LC", LEFTCENTER: "LC", LEFTCENTERFIELD: "LC",
  RC: "RC", RCF: "RC", RIGHTCENTER: "RC", RIGHTCENTERFIELD: "RC",
  R: "R", RF: "R", RIGHT: "R", RIGHTFIELD: "R",
  OF: "OF", OUTFIELD: "OF",
  IF: "IF", INFIELD: "IF",
};

const els = {
  csvInput: document.getElementById("csv-input"),
  uploadStatus: document.getElementById("upload-status"),
  uploadSection: document.getElementById("upload-section"),
  genderSection: document.getElementById("gender-section"),
  genderList: document.getElementById("gender-list"),
  saveRoster: document.getElementById("save-roster"),
  rosterSection: document.getElementById("roster-section"),
  rosterBody: document.querySelector("#roster-table tbody"),
  rosterCount: document.getElementById("roster-count"),
  reupload: document.getElementById("reupload"),
  clearRoster: document.getElementById("clear-roster"),
  addPlayerBtn: document.getElementById("add-player-btn"),
  addPlayerForm: document.getElementById("add-player-form"),
  cancelAdd: document.getElementById("cancel-add"),
  openLineup: document.getElementById("open-lineup"),
  lineupSection: document.getElementById("lineup-section"),
  closeLineup: document.getElementById("close-lineup"),
  attendingList: document.getElementById("attending-list"),
  attendingSummary: document.getElementById("attending-summary"),
  shuffleBatting: document.getElementById("shuffle-batting"),
  battingM: document.getElementById("batting-m"),
  battingF: document.getElementById("batting-f"),
  autoFillPositions: document.getElementById("auto-fill-positions"),
  clearPositions: document.getElementById("clear-positions"),
  positionsWrap: document.getElementById("positions-wrap"),
  pitcherSelect: document.getElementById("pitcher-select"),
  gameDate: document.getElementById("game-date"),
  gameOpponent: document.getElementById("game-opponent"),
  gameLocation: document.getElementById("game-location"),
  printLineup: document.getElementById("print-lineup"),
  printTitles: document.querySelectorAll("#print-view .print-title"),
  printPositionsBody: document.querySelector("#print-positions tbody"),
  printRosterBody: document.querySelector("#print-roster tbody"),
  printBattingBody: document.querySelector("#print-batting tbody"),
  printLocation: document.getElementById("print-location"),
  printOppLabel: document.getElementById("print-opp-label"),
};

let pendingRoster = [];
let roster = [];
let lineup = blankLineup();

// ---------- state ----------
function blankLineup() {
  return {
    attending: {},
    battingOrder: { M: [], F: [] },
    enabledPositions: POSITIONS.reduce((acc, p) => ((acc[p] = true), acc), {}),
    grid: Array.from({ length: INNINGS }, () =>
      POSITIONS.reduce((acc, p) => ((acc[p] = ""), acc), {})
    ),
    pitcher: null,
    game: { date: "", opponent: "", location: "away" },
  };
}

function loadRoster() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveRosterToStorage(r) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
}

function loadLineup() {
  try {
    const raw = localStorage.getItem(LINEUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.grid || !parsed.battingOrder) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLineupToStorage() {
  localStorage.setItem(LINEUP_KEY, JSON.stringify(lineup));
}

// ---------- parsing ----------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function normalizePos(s) {
  const key = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return POS_ALIASES[key] || null;
}

function parsePosTokens(text) {
  if (!text) return [];
  const tokens = text
    .split(/[,;/]| and | or |\bplus\b/i)
    .map((t) => normalizePos(t))
    .filter(Boolean);
  const out = new Set();
  for (const t of tokens) {
    if (t === "OF") ["L", "LC", "RC", "R"].forEach((p) => out.add(p));
    else if (t === "IF") ["1B", "2B", "3B", "SS"].forEach((p) => out.add(p));
    else out.add(t);
  }
  return [...out];
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- views ----------
function showOnly(section) {
  els.uploadSection.hidden = section !== "upload";
  els.genderSection.hidden = section !== "gender";
  els.rosterSection.hidden = section !== "roster";
  els.lineupSection.hidden = section !== "lineup";
}

function renderRoster() {
  els.rosterBody.innerHTML = "";
  els.rosterCount.textContent = `(${roster.length})`;

  for (const player of roster) {
    const tr = document.createElement("tr");
    const genderClass = player.gender === "M" ? "m" : "f";
    const genderLabel = player.gender === "M" ? "M" : "F/NB";
    const priorityOptions = ["", "1", "2", "3", "4", "5"]
      .map((v) => `<option value="${v}"${String(player.priority || "") === v ? " selected" : ""}>${v || "—"}</option>`)
      .join("");
    tr.innerHTML = `
      <td>${escapeHtml(player.name)}</td>
      <td><span class="tag ${genderClass}">${genderLabel}</span></td>
      <td><select class="priority-select" data-name="${escapeHtml(player.name)}">${priorityOptions}</select></td>
      <td>${escapeHtml(player.attending || "")}</td>
      <td>${escapeHtml(player.preferences || "")}</td>
      <td>${escapeHtml(player.avoid || "")}</td>
      <td><button class="remove-btn" data-name="${escapeHtml(player.name)}" title="Remove">×</button></td>
    `;
    els.rosterBody.appendChild(tr);
  }

  els.rosterBody.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => removePlayer(btn.dataset.name));
  });
  els.rosterBody.querySelectorAll(".priority-select").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const name = sel.dataset.name;
      const player = roster.find((p) => p.name === name);
      if (!player) return;
      player.priority = e.target.value || null;
      saveRosterToStorage(roster);
    });
  });
}

function showGenderPrompt(players, existingGenders = {}) {
  showOnly("gender");
  els.genderList.innerHTML = "";
  pendingRoster = players.map((p) => ({
    ...p,
    gender: existingGenders[p.name] || null,
  }));

  pendingRoster.forEach((player, idx) => {
    const row = document.createElement("div");
    row.className = "gender-row";
    row.innerHTML = `
      <div class="name">${escapeHtml(player.name)}</div>
      <div class="pills">
        <button type="button" class="pill" data-g="M">M</button>
        <button type="button" class="pill" data-g="F">F/NB</button>
      </div>
    `;
    const pills = row.querySelectorAll(".pill");
    pills.forEach((pill) => {
      if (pill.dataset.g === player.gender) pill.classList.add("selected");
      pill.addEventListener("click", () => {
        pendingRoster[idx].gender = pill.dataset.g;
        pills.forEach((p) => p.classList.remove("selected"));
        pill.classList.add("selected");
      });
    });
    els.genderList.appendChild(row);
  });
}

function removePlayer(name) {
  if (!confirm(`Remove ${name} from roster?`)) return;
  roster = roster.filter((p) => p.name !== name);
  saveRosterToStorage(roster);
  delete lineup.attending[name];
  lineup.battingOrder.M = lineup.battingOrder.M.filter((n) => n !== name);
  lineup.battingOrder.F = lineup.battingOrder.F.filter((n) => n !== name);
  if (lineup.pitcher === name) lineup.pitcher = null;
  for (const inn of lineup.grid) {
    for (const pos of POSITIONS) {
      if (inn[pos] === name) inn[pos] = "";
    }
  }
  saveLineupToStorage();
  renderRoster();
}

// ---------- add player form ----------
function setupAddForm() {
  const pills = els.addPlayerForm.querySelectorAll(".pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("selected"));
      pill.classList.add("selected");
    });
  });

  els.addPlayerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("ap-name").value.trim();
    const selectedPill = els.addPlayerForm.querySelector(".pill.selected");
    const priority = document.getElementById("ap-priority").value;
    const prefs = document.getElementById("ap-prefs").value.trim();
    const avoid = document.getElementById("ap-avoid").value.trim();

    if (!name) return;
    if (!selectedPill) {
      alert("Pick a gender.");
      return;
    }
    if (roster.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      alert(`${name} is already in the roster.`);
      return;
    }
    roster.push({
      name,
      gender: selectedPill.dataset.g,
      priority: priority || null,
      attending: "Yes",
      preferences: prefs,
      avoid,
    });
    saveRosterToStorage(roster);
    renderRoster();
    closeAddForm();
  });

  els.addPlayerBtn.addEventListener("click", openAddForm);
  els.cancelAdd.addEventListener("click", closeAddForm);
}

function openAddForm() {
  els.addPlayerForm.hidden = false;
  els.addPlayerForm.reset();
  els.addPlayerForm.querySelectorAll(".pill").forEach((p) => p.classList.remove("selected"));
  document.getElementById("ap-name").focus();
}

function closeAddForm() {
  els.addPlayerForm.hidden = true;
}

// ---------- CSV upload ----------
function handleCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    els.uploadStatus.textContent = "CSV looks empty.";
    els.uploadStatus.className = "status error";
    return;
  }

  const dataRows = rows.slice(1);
  const players = [];
  const seen = new Set();

  for (const row of dataRows) {
    const name = (row[1] || "").trim();
    if (!name) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    players.push({
      name,
      attending: (row[2] || "").trim(),
      preferences: (row[3] || "").trim(),
      avoid: (row[4] || "").trim(),
    });
  }

  if (players.length === 0) {
    els.uploadStatus.textContent = "No players found in column B.";
    els.uploadStatus.className = "status error";
    return;
  }

  els.uploadStatus.textContent = `Found ${players.length} player${players.length === 1 ? "" : "s"}.`;
  els.uploadStatus.className = "status";

  const existingGenders = {};
  for (const p of roster) existingGenders[p.name] = p.gender;

  showGenderPrompt(players, existingGenders);
}

// ---------- helpers: lineup math ----------
function attendingByGender() {
  const m = [], f = [];
  for (const p of roster) {
    if (!lineup.attending[p.name]) continue;
    if (p.gender === "M") m.push(p.name);
    else f.push(p.name);
  }
  return { M: m, F: f };
}

function enabledPositionsList() {
  return POSITIONS.filter((p) => lineup.enabledPositions[p]);
}

// Computes how many M / F-NB slots to play on the field, given attendance
// and current position toggles. Rule: equal M/F is the default, but if F/NB
// is the limiting gender we allow +1 M (so 5M + 4F = 9 on field is fine).
// Extra F/NB beyond M is NOT allowed (matches league rule).
function fieldConfig() {
  const { M, F } = attendingByGender();
  const m = M.length, f = F.length;

  // Step 1: derive natural config from attendance
  let slotsM, slotsF;
  if (m >= f) {
    slotsF = Math.min(f, 5);
    slotsM = Math.min(m, slotsF + 1, 5);
  } else {
    slotsM = Math.min(m, 5);
    slotsF = slotsM;
  }

  // Step 2: if user has fewer position columns enabled, divide that count
  // using the same asymmetric rule (odd → +1 M)
  const enabled = enabledPositionsList().length;
  const naturalTotal = slotsM + slotsF;
  if (enabled > 0 && enabled < naturalTotal) {
    if (enabled % 2 === 0) {
      slotsM = enabled / 2;
      slotsF = enabled / 2;
    } else {
      slotsM = Math.ceil(enabled / 2);
      slotsF = Math.floor(enabled / 2);
    }
    slotsM = Math.min(slotsM, m);
    slotsF = Math.min(slotsF, f);
  }

  return { slotsM, slotsF, forfeit: Math.min(m, f) < 4 };
}

// Auto-adjust enabled position columns to match the field config.
// Only reduces; user's deliberate short setup is respected.
function autoFitPositions() {
  const cfg = fieldConfig();
  const target = cfg.slotsM + cfg.slotsF;
  if (target < 2) return false;

  const current = enabledPositionsList().length;
  if (current === target) return true;

  // Re-enable all, then drop from the right side of the field
  for (const p of POSITIONS) lineup.enabledPositions[p] = true;
  const dropOrder = ["R", "RC", "LC", "L", "C", "3B"];
  const toDrop = 10 - target;
  for (let i = 0; i < toDrop && i < dropOrder.length; i++) {
    lineup.enabledPositions[dropOrder[i]] = false;
  }
  return true;
}

function inningsScheduledFor(name) {
  let count = 0;
  for (let i = 0; i < INNINGS; i++) {
    for (const pos of POSITIONS) {
      if (lineup.grid[i][pos] === name) {
        count++;
        break;
      }
    }
  }
  return count;
}

function getPlayer(name) {
  return roster.find((p) => p.name === name);
}

// ---------- batting order ----------
function syncOrder(existing, available) {
  const kept = existing.filter((n) => available.includes(n));
  const added = available.filter((n) => !kept.includes(n));
  return [...kept, ...added];
}

function inningSplit(N, slots, innings) {
  if (N === 0 || slots === 0) {
    return { ceilCount: 0, floorCount: N, ceilInnings: 0, floorInnings: 0 };
  }
  if (N <= slots) {
    return { ceilCount: N, floorCount: 0, ceilInnings: innings, floorInnings: innings };
  }
  const total = slots * innings;
  const ceilInnings = Math.ceil(total / N);
  const floorInnings = Math.floor(total / N);
  const ceilCount = total - floorInnings * N;
  const floorCount = N - ceilCount;
  return { ceilCount, floorCount, ceilInnings, floorInnings };
}

function ceilFloorForGender(gender) {
  const { M, F } = attendingByGender();
  const players = gender === "M" ? M : F;
  const cfg = fieldConfig();
  const slots = gender === "M" ? cfg.slotsM : cfg.slotsF;
  if (slots === 0) return { ceil: [], floor: [], ceilCount: 0, ceilInnings: 0, floorInnings: 0, pitcherIsThisGender: false };
  let effectiveN = players.length;
  let effectiveSlots = slots;
  const pitcher = lineup.pitcher;
  const pitcherIsThisGender = pitcher && getPlayer(pitcher)?.gender === gender && players.includes(pitcher);
  if (pitcherIsThisGender) {
    effectiveN -= 1;
    effectiveSlots -= 1;
  }
  const others = pitcherIsThisGender ? players.filter((p) => p !== pitcher) : players;
  const ordered = (lineup.battingOrder[gender] || []).filter((n) => others.includes(n));
  const newcomers = others.filter((n) => !ordered.includes(n));
  const fullOrder = [...ordered, ...newcomers];
  const split = inningSplit(effectiveN, effectiveSlots, INNINGS);
  // Convention: top of batting order = floor (fewer innings), bottom = ceil (more).
  // Players who play more bat later → fewer at-bats, balancing field time.
  return {
    floor: fullOrder.slice(0, split.floorCount),
    ceil: fullOrder.slice(split.floorCount),
    ceilInnings: split.ceilInnings,
    floorInnings: split.floorInnings,
    pitcherIsThisGender,
  };
}

// ---------- schedule ----------
function buildSchedule() {
  // Returns { name -> bool[INNINGS] }
  const result = {};
  const { M, F } = attendingByGender();
  const cfg = fieldConfig();
  if (cfg.slotsM + cfg.slotsF === 0) return null;

  for (const gender of ["M", "F"]) {
    const players = gender === "M" ? M : F;
    if (players.length === 0) continue;
    const genderSlots = gender === "M" ? cfg.slotsM : cfg.slotsF;
    const info = ceilFloorForGender(gender);
    const orderedOthers = [...info.ceil, ...info.floor];
    for (const p of players) result[p] = new Array(INNINGS).fill(false);

    if (info.pitcherIsThisGender) {
      for (let i = 0; i < INNINGS; i++) result[lineup.pitcher][i] = true;
    }

    const effectiveSlots = genderSlots - (info.pitcherIsThisGender ? 1 : 0);
    if (orderedOthers.length === 0 || effectiveSlots === 0) continue;

    const target = {};
    for (const p of info.ceil) target[p] = info.ceilInnings;
    for (const p of info.floor) target[p] = info.floorInnings;

    // Inning 7 (last): if any sit, prefer floor players sit
    const lastInn = INNINGS - 1;
    const sitsLast = orderedOthers.length - effectiveSlots;
    let sittingLast = [];
    if (sitsLast > 0) {
      const fromFloor = [...info.floor].reverse().slice(0, Math.min(sitsLast, info.floor.length));
      sittingLast = [...fromFloor];
      if (sittingLast.length < sitsLast) {
        const extra = [...info.ceil].reverse().slice(0, sitsLast - sittingLast.length);
        sittingLast = sittingLast.concat(extra);
      }
    }
    const playingLast = orderedOthers.filter((p) => !sittingLast.includes(p));
    for (const p of playingLast) {
      result[p][lastInn] = true;
      target[p]--;
    }

    // Innings 0..lastInn-1
    let lastSat = new Set(sittingLast);
    for (let inn = 0; inn < lastInn; inn++) {
      const inningsLeft = lastInn - inn;
      const sorted = [...orderedOthers].sort((a, b) => {
        const ra = target[a];
        const rb = target[b];
        // Must play players whose remaining innings == innings left
        const mustA = ra >= inningsLeft ? 1 : 0;
        const mustB = rb >= inningsLeft ? 1 : 0;
        if (mustA !== mustB) return mustB - mustA;
        if (ra !== rb) return rb - ra;
        const sA = lastSat.has(a) ? 1 : 0;
        const sB = lastSat.has(b) ? 1 : 0;
        if (sA !== sB) return sB - sA;
        return Math.random() - 0.5;
      });
      const playing = sorted.slice(0, effectiveSlots);
      const playingSet = new Set(playing);
      lastSat = new Set(orderedOthers.filter((p) => !playingSet.has(p)));
      for (const p of playing) {
        result[p][inn] = true;
        target[p]--;
      }
    }
  }
  return result;
}

// ---------- position assignment per inning ----------
function assignPositionsForInning(playerNames, positions, playedAt, fixedPitcher) {
  // Returns { pos: name } or null on failure
  const playerObjs = playerNames.map(getPlayer).filter(Boolean);
  const lockedP = fixedPitcher && playerNames.includes(fixedPitcher) && positions.includes("P");

  const remainingPos = lockedP ? positions.filter((p) => p !== "P") : [...positions];
  const remainingPlayers = lockedP ? playerObjs.filter((p) => p.name !== fixedPitcher) : playerObjs;

  const posOrder = shuffle(remainingPos);
  const result = {};
  if (lockedP) result.P = fixedPitcher;
  const used = new Set();

  function tryAssign(i) {
    if (i === posOrder.length) return true;
    const pos = posOrder[i];
    const avoiders = (p) => parsePosTokens(p.avoid).includes(pos);
    const preferrers = (p) => parsePosTokens(p.preferences).includes(pos);

    const candidates = remainingPlayers
      .filter((p) => !used.has(p.name) && !avoiders(p))
      .sort((a, b) => {
        const pa = preferrers(a) ? 0 : 1;
        const pb = preferrers(b) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const ca = (playedAt[a.name] || {})[pos] || 0;
        const cb = (playedAt[b.name] || {})[pos] || 0;
        if (ca !== cb) return ca - cb;
        return Math.random() - 0.5;
      });
    for (const cand of candidates) {
      used.add(cand.name);
      result[pos] = cand.name;
      if (tryAssign(i + 1)) return true;
      used.delete(cand.name);
      delete result[pos];
    }
    // fallback: ignore avoid if blocked
    const fallback = remainingPlayers
      .filter((p) => !used.has(p.name) && avoiders(p))
      .sort(() => Math.random() - 0.5);
    for (const cand of fallback) {
      used.add(cand.name);
      result[pos] = cand.name;
      if (tryAssign(i + 1)) return true;
      used.delete(cand.name);
      delete result[pos];
    }
    return false;
  }

  return tryAssign(0) ? result : null;
}

// ---------- auto-fill ----------
function autoFillAll() {
  const { M, F } = attendingByGender();
  const cfg = fieldConfig();
  if (cfg.forfeit) {
    if (!confirm(
      `Heads up: ${M.length}M + ${F.length}F/NB is below 4+4 (league forfeit). ` +
      `Continue and play short anyway?`
    )) {
      return;
    }
    if (cfg.slotsM + cfg.slotsF < 4) {
      alert("Not enough players to field anyone.");
      return;
    }
  }
  autoFitPositions();

  // Ensure batting order is set (use roster order if empty)
  for (const g of ["M", "F"]) {
    const list = g === "M" ? M : F;
    lineup.battingOrder[g] = syncOrder(lineup.battingOrder[g], list);
  }

  const schedule = buildSchedule();
  if (!schedule) {
    alert("Could not build schedule.");
    return;
  }

  const playedAt = {};
  for (const p of roster) playedAt[p.name] = {};

  const enabled = enabledPositionsList();
  const newGrid = Array.from({ length: INNINGS }, () =>
    POSITIONS.reduce((acc, p) => ((acc[p] = ""), acc), {})
  );

  for (let inn = 0; inn < INNINGS; inn++) {
    const playing = Object.keys(schedule).filter((n) => schedule[n][inn]);
    const assignment = assignPositionsForInning(playing, enabled, playedAt, lineup.pitcher);
    if (!assignment) {
      alert(
        `Couldn't auto-assign inning ${inn + 1}. Try relaxing avoid lists or editing manually.`
      );
      return;
    }
    for (const [pos, name] of Object.entries(assignment)) {
      newGrid[inn][pos] = name;
      playedAt[name][pos] = (playedAt[name][pos] || 0) + 1;
    }
  }

  lineup.grid = newGrid;
  saveLineupToStorage();
  renderLineupAll();
}

// ---------- render: lineup ----------
function renderLineupAll() {
  // strip pitcher if no longer attending
  if (lineup.pitcher && !lineup.attending[lineup.pitcher]) {
    lineup.pitcher = null;
  }
  renderAttending();
  renderPitcherSelect();
  renderBatting();
  renderPositions();
  renderAttendingSummary();
}

function renderAttending() {
  els.attendingList.innerHTML = "";
  for (const player of roster) {
    const id = `att-${player.name.replace(/[^a-z0-9]/gi, "_")}`;
    const row = document.createElement("label");
    const isAttending = !!lineup.attending[player.name];
    row.className = "attending-row" + (isAttending ? "" : " dim");
    row.htmlFor = id;
    const genderClass = player.gender === "M" ? "m" : "f";
    const genderLabel = player.gender === "M" ? "M" : "F/NB";
    const inningCount = isAttending ? inningsScheduledFor(player.name) : 0;
    let badgeClass = "innings-badge";
    if (!isAttending) badgeClass += " zero";
    else if (inningCount === 0) badgeClass += " zero";
    else if (inningCount < INNINGS) badgeClass += "";
    row.innerHTML = `
      <input type="checkbox" id="${id}" ${isAttending ? "checked" : ""} />
      <span class="tag ${genderClass}">${genderLabel}</span>
      <span>${escapeHtml(player.name)}</span>
      <span class="${badgeClass}" title="Innings scheduled">${inningCount}/${INNINGS}</span>
    `;
    row.querySelector("input").addEventListener("change", (e) => {
      lineup.attending[player.name] = e.target.checked;
      if (!e.target.checked) {
        lineup.battingOrder.M = lineup.battingOrder.M.filter((n) => n !== player.name);
        lineup.battingOrder.F = lineup.battingOrder.F.filter((n) => n !== player.name);
        if (lineup.pitcher === player.name) lineup.pitcher = null;
        for (const inn of lineup.grid) {
          for (const pos of POSITIONS) if (inn[pos] === player.name) inn[pos] = "";
        }
      }
      saveLineupToStorage();
      renderLineupAll();
    });
    els.attendingList.appendChild(row);
  }
}

function renderAttendingSummary() {
  const { M, F } = attendingByGender();
  const cfg = fieldConfig();
  const enabledCount = enabledPositionsList().length;
  const fieldTotal = cfg.slotsM + cfg.slotsF;
  let msg = `${M.length + F.length} attending — ${M.length} M, ${F.length} F/NB.`;
  let cls = "summary";

  if (cfg.forfeit) {
    msg += ` Below 4+4 — league forfeit. Click auto-fill to play short anyway.`;
    cls += " warn";
  } else {
    msg += ` Field: ${cfg.slotsM}M + ${cfg.slotsF}F/NB per inning.`;
    if (enabledCount !== fieldTotal) {
      msg += ` (Position columns out of sync — auto-fill will re-fit.)`;
    }
    const rotateM = Math.max(0, M.length - cfg.slotsM);
    const rotateF = Math.max(0, F.length - cfg.slotsF);
    const rot = [];
    if (rotateM) rot.push(`${rotateM} M`);
    if (rotateF) rot.push(`${rotateF} F/NB`);
    if (rot.length) msg += ` ${rot.join(" + ")} rotate.`;
    cls += " ok";
  }
  els.attendingSummary.textContent = msg;
  els.attendingSummary.className = cls;
}

function renderPitcherSelect() {
  const sel = els.pitcherSelect;
  const current = lineup.pitcher;
  sel.innerHTML = '<option value="">— rotate —</option>';
  for (const p of roster) {
    if (!lineup.attending[p.name]) continue;
    const opt = new Option(`${p.name} (${p.gender === "M" ? "M" : "F/NB"})`, p.name);
    sel.appendChild(opt);
  }
  sel.value = current && lineup.attending[current] ? current : "";
}

function renderBatting() {
  // Recompute ceil/floor with current state
  for (const g of ["M", "F"]) {
    const list = g === "M" ? attendingByGender().M : attendingByGender().F;
    lineup.battingOrder[g] = syncOrder(lineup.battingOrder[g], list);
  }

  fillBattingList(els.battingM, "M");
  fillBattingList(els.battingF, "F");
}

function fillBattingList(ol, gender) {
  ol.innerHTML = "";
  const info = ceilFloorForGender(gender);
  // display order: floor (fewer innings, bat first), ceil (more innings, bat later),
  // permanent pitcher last (plays all 7 → fewest at-bats)
  const pitcher = lineup.pitcher;
  const display = [...info.floor, ...info.ceil];
  if (info.pitcherIsThisGender) display.push(pitcher);
  const seen = new Set();
  const unique = display.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));

  const ceilSet = new Set(info.ceil);
  let firstCeil = true;
  for (const n of unique) {
    const li = document.createElement("li");
    li.textContent = n + (n === pitcher ? " ⚾" : "");
    if (ceilSet.has(n)) {
      if (firstCeil) {
        li.classList.add("divider-above");
        firstCeil = false;
      }
    }
    ol.appendChild(li);
  }
}

function renderPositions() {
  els.positionsWrap.innerHTML = "";
  const table = document.createElement("table");
  table.id = "positions-table";

  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  tr.innerHTML = `<th></th>`;
  for (const pos of POSITIONS) {
    const th = document.createElement("th");
    const disabled = !lineup.enabledPositions[pos];
    if (disabled) th.className = "disabled";
    th.innerHTML = `
      <label class="pos-toggle">
        <span>${pos}</span>
        <input type="checkbox" data-pos="${pos}" ${disabled ? "" : "checked"} />
      </label>
    `;
    th.querySelector("input").addEventListener("change", (e) => {
      lineup.enabledPositions[pos] = e.target.checked;
      if (!e.target.checked) {
        for (const inn of lineup.grid) inn[pos] = "";
      }
      saveLineupToStorage();
      renderLineupAll();
    });
    tr.appendChild(th);
  }
  tr.insertAdjacentHTML("beforeend", `<th>Balance</th>`);
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let inn = 0; inn < INNINGS; inn++) {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="inn-label">Inn ${inn + 1}</td>`;
    for (const pos of POSITIONS) {
      const td = document.createElement("td");
      if (!lineup.enabledPositions[pos]) {
        td.className = "disabled";
        row.appendChild(td);
        continue;
      }
      const sel = document.createElement("select");
      sel.appendChild(new Option("—", ""));
      for (const p of roster) {
        if (!lineup.attending[p.name]) continue;
        const prefs = parsePosTokens(p.preferences);
        const avoids = parsePosTokens(p.avoid);
        let label = p.name;
        if (prefs.includes(pos)) label += " ★";
        else if (avoids.includes(pos)) label += " ✗";
        sel.appendChild(new Option(label, p.name));
      }
      const current = lineup.grid[inn][pos];
      sel.value = current || "";
      if (current) {
        const player = getPlayer(current);
        if (player) {
          const prefs = parsePosTokens(player.preferences);
          const avoids = parsePosTokens(player.avoid);
          if (lineup.pitcher === current && pos === "P") sel.classList.add("locked");
          else if (prefs.includes(pos)) sel.classList.add("pref");
          else if (avoids.includes(pos)) sel.classList.add("avoid");
        }
      }
      sel.addEventListener("change", (e) => {
        lineup.grid[inn][pos] = e.target.value;
        saveLineupToStorage();
        renderLineupAll();
      });
      td.appendChild(sel);
      if (current) {
        const count = Object.values(lineup.grid[inn]).filter((n) => n === current).length;
        if (count > 1) sel.classList.add("dup");
      }
      row.appendChild(td);
    }
    const bal = computeBalance(inn);
    const balCell = document.createElement("td");
    balCell.className = "balance " + (bal.ok ? "ok" : "warn");
    balCell.textContent = bal.text;
    row.appendChild(balCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  els.positionsWrap.appendChild(table);
}

function computeBalance(inn) {
  let mc = 0, fc = 0;
  const seen = new Set();
  for (const pos of POSITIONS) {
    if (!lineup.enabledPositions[pos]) continue;
    const name = lineup.grid[inn][pos];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const p = getPlayer(name);
    if (!p) continue;
    if (p.gender === "M") mc++;
    else fc++;
  }
  const cfg = fieldConfig();
  const ok = mc === cfg.slotsM && fc === cfg.slotsF && mc + fc > 0;
  return { ok, text: `${mc}M / ${fc}F` };
}

// ---------- event wiring ----------
els.csvInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => handleCSV(evt.target.result);
  reader.onerror = () => {
    els.uploadStatus.textContent = "Could not read file.";
    els.uploadStatus.className = "status error";
  };
  reader.readAsText(file);
});

els.saveRoster.addEventListener("click", () => {
  const missing = pendingRoster.filter((p) => !p.gender);
  if (missing.length > 0) {
    alert(`Please set gender for: ${missing.map((p) => p.name).join(", ")}`);
    return;
  }
  const byName = {};
  for (const p of roster) byName[p.name] = p;
  for (const p of pendingRoster) {
    const existing = byName[p.name];
    if (existing) Object.assign(existing, p);
    else byName[p.name] = { ...p, priority: null };
  }
  roster = Object.values(byName);
  saveRosterToStorage(roster);
  renderRoster();
  showOnly("roster");
});

els.reupload.addEventListener("click", () => {
  showOnly("upload");
  els.uploadStatus.textContent = "";
  els.csvInput.value = "";
});

els.clearRoster.addEventListener("click", () => {
  if (!confirm("Delete saved roster and lineup?")) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LINEUP_KEY);
  roster = [];
  lineup = blankLineup();
  pendingRoster = [];
  showOnly("upload");
  els.uploadStatus.textContent = "";
  els.csvInput.value = "";
});

els.openLineup.addEventListener("click", () => {
  for (const p of roster) {
    if (lineup.attending[p.name] === undefined) {
      lineup.attending[p.name] = /^y/i.test(p.attending || "");
    }
  }
  // auto-detect pitcher: someone whose preferences start with P
  if (!lineup.pitcher) {
    const candidate = roster.find((p) => {
      if (!lineup.attending[p.name]) return false;
      const prefs = parsePosTokens(p.preferences);
      return prefs[0] === "P";
    });
    if (candidate) lineup.pitcher = candidate.name;
  }
  saveLineupToStorage();
  showOnly("lineup");
  loadGameInputs();
  renderLineupAll();
});

els.closeLineup.addEventListener("click", () => {
  showOnly("roster");
});

els.shuffleBatting.addEventListener("click", () => {
  for (const g of ["M", "F"]) {
    const info = ceilFloorForGender(g);
    const shuffledCeil = shuffle(info.ceil);
    const shuffledFloor = shuffle(info.floor);
    // Floor (fewer innings) bats first, ceil (more innings) bats later,
    // pitcher (plays all 7) hits last.
    let newOrder = [...shuffledFloor, ...shuffledCeil];
    if (info.pitcherIsThisGender) {
      newOrder = [...newOrder, lineup.pitcher];
    }
    lineup.battingOrder[g] = newOrder;
  }
  saveLineupToStorage();
  renderLineupAll();
});

els.autoFillPositions.addEventListener("click", autoFillAll);

els.clearPositions.addEventListener("click", () => {
  for (const inn of lineup.grid) {
    for (const pos of POSITIONS) inn[pos] = "";
  }
  saveLineupToStorage();
  renderLineupAll();
});

els.pitcherSelect.addEventListener("change", (e) => {
  lineup.pitcher = e.target.value || null;
  saveLineupToStorage();
  renderLineupAll();
});

function ensureGameState() {
  if (!lineup.game) lineup.game = { date: "", opponent: "", location: "away" };
}

function loadGameInputs() {
  ensureGameState();
  els.gameDate.value = lineup.game.date || "";
  els.gameOpponent.value = lineup.game.opponent || "";
  els.gameLocation.value = lineup.game.location || "away";
}

els.gameDate.addEventListener("change", (e) => {
  ensureGameState();
  lineup.game.date = e.target.value;
  saveLineupToStorage();
});
els.gameOpponent.addEventListener("input", (e) => {
  ensureGameState();
  lineup.game.opponent = e.target.value;
  saveLineupToStorage();
});
els.gameLocation.addEventListener("change", (e) => {
  ensureGameState();
  lineup.game.location = e.target.value;
  saveLineupToStorage();
});

function formatPrintDate(iso) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}`;
}

function effectiveBattingOrder(gender) {
  const attending = attendingByGender()[gender];
  const stored = (lineup.battingOrder[gender] || []).filter((n) => attending.includes(n));
  const missing = attending.filter((n) => !stored.includes(n));
  return [...stored, ...missing];
}

function renderPrintBatting() {
  const M = effectiveBattingOrder("M");
  const F = effectiveBattingOrder("F");

  // Roster block: raw M and F/NB lists
  els.printRosterBody.innerHTML = "";
  const rosterRows = Math.max(M.length, F.length);
  for (let r = 0; r < rosterRows; r++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r < M.length ? M[r] : "")}</td>
      <td>${escapeHtml(r < F.length ? F[r] : "")}</td>
    `;
    els.printRosterBody.appendChild(tr);
  }

  // At-bat order block: 3 columns flowing newspaper-style
  els.printBattingBody.innerHTML = "";
  if (M.length === 0 && F.length === 0) return;

  const orderCols = 3;
  // Roster table takes rosterRows rows; rest of the page goes to batting.
  // Aim to fit Letter portrait without overflowing to page 2.
  const rowsPerCol = Math.max(12, Math.min(22, 26 - rosterRows));
  const total = orderCols * rowsPerCol;

  // Build strict M-F-M-F alternation; each side cycles independently
  const sequence = [];
  const genders = [];
  for (let k = 0; k < total; k++) {
    if (k % 2 === 0) {
      const name = M.length ? M[(k / 2) % M.length] : "";
      sequence.push(name);
      genders.push("M");
    } else {
      const name = F.length ? F[((k - 1) / 2) % F.length] : "";
      sequence.push(name);
      genders.push("F");
    }
  }

  for (let r = 0; r < rowsPerCol; r++) {
    const tr = document.createElement("tr");
    // Each row reads across cols 1, 2, 3. Newspaper-flow: col 1 first, then col 2, then col 3.
    const idx1 = r;
    const idx2 = rowsPerCol + r;
    const idx3 = 2 * rowsPerCol + r;
    // Tint by the first column's gender (rows can mix when columns split mid-pair)
    tr.className = genders[idx1] === "M" ? "m-row" : "f-row";
    tr.innerHTML = `
      <td>${escapeHtml(sequence[idx1] || "")}</td>
      <td>${escapeHtml(sequence[idx2] || "")}</td>
      <td>${escapeHtml(sequence[idx3] || "")}</td>
    `;
    els.printBattingBody.appendChild(tr);
  }
}

function renderPrintView() {
  ensureGameState();
  const { date, opponent, location } = lineup.game;
  const opp = opponent.trim() || "Opponent";
  const dateStr = formatPrintDate(date) || "Date";
  const isHome = location === "home";

  const title = isHome
    ? `${dateStr} vs ${opp} (home game we field first)`
    : `${dateStr} @ ${opp} (away game we field second)`;
  for (const el of els.printTitles) el.textContent = title;
  els.printLocation.textContent = isHome
    ? "We are HOME Team, we FIELD first."
    : "We are AWAY Team, we HIT first.";
  els.printOppLabel.textContent = opp;

  els.printPositionsBody.innerHTML = "";
  for (const entry of PRINT_POSITION_ROWS) {
    const tr = document.createElement("tr");
    if (entry === null) {
      tr.className = "spacer";
      tr.innerHTML = `<th></th>` + Array(INNINGS).fill('<td></td>').join("");
      els.printPositionsBody.appendChild(tr);
      continue;
    }
    const [code, label] = entry;
    const disabled = !lineup.enabledPositions[code];
    let cells = "";
    for (let inn = 0; inn < INNINGS; inn++) {
      const name = disabled ? "" : (lineup.grid[inn][code] || "");
      cells += `<td>${escapeHtml(name)}</td>`;
    }
    tr.innerHTML = `<th>${label}</th>${cells}`;
    els.printPositionsBody.appendChild(tr);
  }

  renderPrintBatting();
}

els.printLineup.addEventListener("click", () => {
  if (!lineup.game?.opponent?.trim()) {
    if (!confirm("Opponent name is blank. Print anyway?")) return;
  }
  renderPrintView();
  window.print();
});

setupAddForm();

// ---------- boot ----------
const savedRoster = loadRoster();
if (savedRoster && savedRoster.length > 0) {
  roster = savedRoster.map((p) => {
    const out = { priority: null, ...p };
    if (out.skill && !out.priority) out.priority = out.skill;
    delete out.skill;
    return out;
  });
  const savedLineup = loadLineup();
  if (savedLineup) lineup = { ...blankLineup(), ...savedLineup };
  showOnly("roster");
  renderRoster();
} else {
  showOnly("upload");
}
