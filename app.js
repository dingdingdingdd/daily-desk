/**
 * 案头：按日期记录待办，数据只写在 localStorage。
 * 带截止日期的任务从记下那天起每天出现，直到完成。
 * 每条待办属于工作、生活或成长之一。
 */
const STORAGE_KEY = "daily-desk.v1";
const KINDS = [
  { id: "work", label: "工作" },
  { id: "life", label: "生活" },
  { id: "growth", label: "成长" },
  { id: "other", label: "prompt记录" },
];
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const WEEK_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const state = load();
let selected = startOfDay(new Date());
let doneOpen = false;
let editingId = null;
let filter = "all";
let lastKind = "work"; // "全部" 视图下新加待办的默认类型，跟随最近一次选过的具体类型
let calDate = new Date(); // 日历弹窗当前显示的月份
let dueTargetId = null; // 正在编辑截止时间的待办 id；null 表示编辑输入框的截止

const els = {
  kicker: document.querySelector("#date-kicker"),
  num: document.querySelector("#date-num"),
  sub: document.querySelector("#date-sub"),
  week: document.querySelector("#week"),
  today: document.querySelector(".today-link"),
  composer: document.querySelector("#composer"),
  draft: document.querySelector("#draft"),
  due: document.querySelector("#due"),
  dueDisplay: document.querySelector("#due-display"),
  dueField: document.querySelector("#due-field"),
  calPop: document.querySelector("#calendar-pop"),
  calTitle: document.querySelector("#cal-title"),
  calGrid: document.querySelector("#cal-grid"),
  carry: document.querySelector("#carry"),
  openList: document.querySelector("#open-list"),
  doneWrap: document.querySelector("#done-wrap"),
  doneLabel: document.querySelector("#done-label"),
  doneToggle: document.querySelector(".done-toggle"),
  doneList: document.querySelector("#done-list"),
  empty: document.querySelector("#empty"),
  countLine: document.querySelector("#count-line"),
  ideasToggle: document.querySelector('[data-action="toggle-ideas"]'),
  ideasCount: document.querySelector("#ideas-count"),
  ideasBody: document.querySelector("#ideas-body"),
  ideaForm: document.querySelector("#idea-form"),
  ideaInput: document.querySelector("#idea-input"),
  ideaList: document.querySelector("#idea-list"),
  notebookToggle: document.querySelector('[data-action="toggle-notebook"]'),
  notebookBody: document.querySelector("#notebook-body"),
  notebook: document.querySelector("#notebook"),
};

document.body.addEventListener("click", onClick);
els.composer.addEventListener("submit", onSubmit);
els.dueField.addEventListener("click", toggleCalendar);
els.ideaForm.addEventListener("submit", onIdea);
els.notebook.addEventListener("input", onNotebook);

render();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== "object") return { days: {}, spans: [], ideas: [], notebook: "", ui: {} };
    raw.days = raw.days && typeof raw.days === "object" ? raw.days : {};
    raw.spans = Array.isArray(raw.spans) ? raw.spans : [];
    raw.ideas = Array.isArray(raw.ideas) ? raw.ideas : [];
    raw.notebook = typeof raw.notebook === "string" ? raw.notebook : "";
    raw.ui = raw.ui && typeof raw.ui === "object" ? raw.ui : {};
    // 一次性迁移：给没有 order 的任务补排序值，沿用旧的“跨天在前、当天在后”的显示顺序
    const missing = raw.spans.some((t) => typeof t.order !== "number")
      || Object.values(raw.days).some((list) => Array.isArray(list) && list.some((t) => typeof t.order !== "number"));
    if (missing) {
      let order = 0;
      for (const task of raw.spans) if (typeof task.order !== "number") task.order = order++;
      for (const key of Object.keys(raw.days)) {
        if (!Array.isArray(raw.days[key])) continue;
        for (const task of raw.days[key]) if (typeof task.order !== "number") task.order = order++;
      }
    }
    return raw;
  } catch {
    return { days: {}, spans: [], ideas: [], notebook: "", ui: {} };
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return startOfDay(next);
}

function keyOf(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function tasksOf(date) {
  const key = keyOf(date);
  if (!Array.isArray(state.days[key])) state.days[key] = [];
  return state.days[key];
}

function showsOn(task, key) {
  if (!task.start || !task.due || key < task.start) return false;
  if (task.done) return key <= task.due;
  return true;
}

function visibleTasks(date) {
  const key = keyOf(date);
  const daily = Array.isArray(state.days[key]) ? state.days[key] : [];
  const spanning = state.spans.filter((task) => showsOn(task, key));
  // 统一按 order 排序：跨天任务与当天任务混排，顺序完全由用户调整
  return [...spanning, ...daily].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function findTask(id) {
  const span = state.spans.find((task) => task.id === id);
  if (span) return span;
  for (const list of Object.values(state.days)) {
    if (!Array.isArray(list)) continue;
    const hit = list.find((task) => task.id === id);
    if (hit) return hit;
  }
  return null;
}

function kindOf(task) {
  return KINDS.some((item) => item.id === task.kind) ? task.kind : "work";
}

function kindLabel(id) {
  return KINDS.find((item) => item.id === id)?.label || "工作";
}

function dueMeta(task, day) {
  if (!task.due) return "";
  const due = parseKey(task.due);
  const diff = Math.round((due - startOfDay(day)) / 86400000);
  const when = `${due.getMonth() + 1}月${due.getDate()}日`;
  if (task.done) return { text: `截止 ${when}`, kind: "" };
  if (diff > 1) return { text: `截止 ${when}`, kind: "" };
  if (diff === 1) return { text: "明天截止", kind: "" };
  if (diff === 0) return { text: "今天截止", kind: "is-today" };
  const late = -diff;
  return { text: late === 1 ? "昨天已截止" : `已过期 ${late} 天`, kind: "is-over" };
}

function sameDay(a, b) {
  return keyOf(a) === keyOf(b);
}

function weekStart(date) {
  const shifted = (date.getDay() + 6) % 7;
  return addDays(date, -shifted);
}

function relativeLabel(date) {
  const today = startOfDay(new Date());
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return "今天";
  if (diff === -1) return "昨天";
  if (diff === 1) return "明天";
  return `${date.getMonth() + 1}月`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function render() {
  const today = startOfDay(new Date());
  const all = visibleTasks(selected);
  const tasks = all.filter((task) => filter === "all" || kindOf(task) === filter);
  const open = currentOpenTasks();
  const done = tasks.filter((task) => task.done);
  const openAll = all.filter((task) => !task.done);

  els.kicker.textContent = relativeLabel(selected);
  els.num.textContent = `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日`;
  els.sub.textContent = WEEKDAYS[selected.getDay()];
  els.today.hidden = sameDay(selected, today);
  document.title = `${relativeLabel(selected)} ${selected.getMonth() + 1}月${selected.getDate()}日 · 案头`;

  renderWeek(today);
  renderCarry(openAll);
  const flags = moveFlags(open);
  els.openList.innerHTML = open.map((task) => renderTask(task, flags.get(task.id))).join("");
  els.doneList.innerHTML = done.map((task) => renderTask(task)).join("");
  els.doneWrap.hidden = done.length === 0;
  els.doneLabel.textContent = `已完成 ${done.length}`;
  els.doneToggle.setAttribute("aria-expanded", doneOpen ? "true" : "false");
  els.doneList.hidden = !doneOpen;
  els.empty.hidden = tasks.length !== 0;
  els.empty.textContent = all.length && !tasks.length ? "这一类还没有待办。" : "这一天还没有待办。";
  renderChoices();
  els.countLine.textContent = "待办只保存在这台浏览器";
  els.due.min = keyOf(selected);
  if (els.due.value && els.due.value < els.due.min) els.due.value = "";
  updateDueDisplay();
  renderSideSections();

  const editing = document.querySelector(".title-edit");
  if (editing) {
    editing.focus();
    editing.setSelectionRange(editing.value.length, editing.value.length);
  }
}

function renderWeek(today) {
  const start = weekStart(selected);
  els.week.innerHTML = WEEK_LABELS.map((label, index) => {
    const date = addDays(start, index);
    const selectedDay = sameDay(date, selected);
    const isToday = sameDay(date, today);
    return `<button type="button" role="tab" data-action="pick-day" data-date="${keyOf(date)}" aria-selected="${selectedDay}" class="${isToday ? "is-today" : ""}">
      <strong>${date.getDate()}</strong>
      <span>${label}</span>
    </button>`;
  }).join("");
}

function renderCarry(openSelected) {
  const today = startOfDay(new Date());
  const selectedKey = keyOf(selected);
  const titles = new Set(openSelected.map((task) => task.title));
  // 收集所有早于选中日期的未完成任务（还没在选中日期出现过的），不限于前一天
  let pending = 0;
  for (const [dayKey, list] of Object.entries(state.days)) {
    if (!Array.isArray(list) || dayKey >= selectedKey) continue;
    for (const task of list) {
      if (!task.done && !titles.has(task.title)) pending += 1;
    }
  }
  // 常驻提示：之前的日期还有未完成任务且还没全部带入时显示；全部带入后 pending 为空，自动消失
  if (pending === 0) {
    els.carry.hidden = true;
    els.carry.innerHTML = "";
    return;
  }
  const targetLabel = sameDay(selected, today) ? "今天" : `${selected.getMonth() + 1}月${selected.getDate()}日`;
  els.carry.hidden = false;
  els.carry.innerHTML = `<span>还有 ${pending} 件事没做完</span><button type="button" data-action="carry">带入${targetLabel}</button>`;
}

function renderChoices() {
  document.querySelectorAll("[data-action='filter']").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.kind === filter ? "true" : "false");
  });
}

function compareOpen(a, b) {
  const rank = (task) => {
    if (!task.due) return 2;
    if (task.due < keyOf(selected)) return 0;
    return 1;
  };
  const byRank = rank(a) - rank(b);
  if (byRank) return byRank;
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

/* ── 上移 / 下移按钮 ── */

// 当前筛选下可见的未完成待办（与 render 中 open 同口径）
function currentOpenTasks() {
  const all = visibleTasks(selected);
  const tasks = all.filter((task) => filter === "all" || kindOf(task) === filter);
  return tasks.filter((task) => !task.done);
}

// 判断每条未完成待办能否上移/下移：只跟可见列表中相邻的项交换，无其他限制
function moveFlags(open) {
  const flags = new Map();
  open.forEach((task, i) => {
    flags.set(task.id, { up: i > 0, down: i < open.length - 1 });
  });
  return flags;
}

// 与相邻可见项交换 order（排序值），dir 为 -1（上移）或 1（下移）
function moveAdjacent(taskId, dir) {
  const open = currentOpenTasks();
  const i = open.findIndex((task) => task.id === taskId);
  if (i < 0) return;
  const peer = open[i + dir];
  if (!peer) return;
  const a = findTask(taskId);
  const b = findTask(peer.id);
  if (!a || !b) return;
  [a.order, b.order] = [b.order, a.order];
  save();
  render();
}

// 新任务排序值：加在顶部用最小 order，追加到底部用最大 order
function orderRange() {
  let min = 0, max = 0, has = false;
  const walk = (task) => {
    has = true;
    min = Math.min(min, task.order);
    max = Math.max(max, task.order);
  };
  state.spans.forEach(walk);
  for (const key of Object.keys(state.days)) {
    if (!Array.isArray(state.days[key])) continue;
    state.days[key].forEach(walk);
  }
  return { min, max, has };
}
function nextTopOrder() {
  const { min, has } = orderRange();
  return (has ? min : 0) - 1;
}
function nextBottomOrder() {
  const { max, has } = orderRange();
  return (has ? max : 0) + 1;
}

function renderTask(task, flags) {
  const title = editingId === task.id
    ? `<input class="title-edit" data-id="${task.id}" value="${escapeHtml(task.title)}" maxlength="120" />`
    : `<button type="button" class="title-btn" data-action="edit" data-id="${task.id}">${escapeHtml(task.title)}</button>`;
  const meta = dueMeta(task, selected);
  const due = meta
    ? `<button type="button" class="due-meta ${meta.kind}" data-action="edit-due" data-id="${task.id}" aria-label="修改截止时间" title="修改截止时间">${escapeHtml(meta.text)}</button>`
    : `<button type="button" class="due-add" data-action="edit-due" data-id="${task.id}" aria-label="添加截止时间" title="添加截止时间">
        <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>`;
  const taskKind = kindOf(task);
  // 只有未完成列表渲染上移/下移按钮；flags 为 undefined（已完成列表）时不渲染
  const move = flags
    ? `<span class="move-group" role="group" aria-label="调整顺序">
        <button type="button" class="move-btn" data-action="move-up" data-id="${task.id}" aria-label="上移" ${flags.up ? "" : "disabled"}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10 8 6l4 4" /></svg>
        </button>
        <button type="button" class="move-btn" data-action="move-down" data-id="${task.id}" aria-label="下移" ${flags.down ? "" : "disabled"}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6 8 10l4-4" /></svg>
        </button>
      </span>`
    : "";
  return `<li class="task${task.done ? " is-done" : ""}" data-task-id="${task.id}">
    <button type="button" class="check" data-action="toggle" data-id="${task.id}" aria-label="${task.done ? "标为未完成" : "标为完成"}" aria-pressed="${task.done}">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.2 6.3 11.5 13 4.5" /></svg>
    </button>
    <div class="task-main">
      <button type="button" class="kind-tag kind-${taskKind}" data-action="cycle-kind" data-id="${task.id}" aria-label="类型：${kindLabel(taskKind)}，点击切换">${kindLabel(taskKind)}</button>
      ${title}
    </div>
    ${due}
    ${move}
    <button type="button" class="ghost" data-action="delete" data-id="${task.id}">删除</button>
  </li>`;
}

function onClick(event) {
  const edit = event.target.closest(".title-edit");
  if (!edit && editingId) commitEdit();

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "prev-day") selectDate(addDays(selected, -1));
  if (action === "next-day") selectDate(addDays(selected, 1));
  if (action === "today") selectDate(startOfDay(new Date()));
  if (action === "pick-day") selectDate(parseKey(button.dataset.date));
  if (action === "toggle") toggleTask(button.dataset.id);
  if (action === "delete") deleteTask(button.dataset.id);
  if (action === "edit") beginEdit(button.dataset.id);
  if (action === "filter") {
    filter = button.dataset.kind;
    if (filter !== "all") lastKind = filter; // 切到具体类型时，记录为默认新建类型
    render();
  }
  if (action === "cycle-kind") cycleKind(button.dataset.id);
  if (action === "edit-due") openDueEditor(button.dataset.id, button);
  if (action === "move-up") moveAdjacent(button.dataset.id, -1);
  if (action === "move-down") moveAdjacent(button.dataset.id, 1);
  if (action === "toggle-done") {
    doneOpen = !doneOpen;
    render();
  }
  if (action === "toggle-ideas") {
    state.ui.ideasOpen = !state.ui.ideasOpen;
    if (!state.ui.ideasOpen) state.ui.editingIdea = null; // 折叠时退出编辑态
    save();
    render();
  }
  if (action === "toggle-notebook") {
    state.ui.notebookOpen = !state.ui.notebookOpen;
    save();
    render();
  }
  if (action === "delete-idea") deleteIdea(button.dataset.id);
  if (action === "edit-idea") beginEditIdea(button.dataset.id);
  if (action === "carry") carryPending();
}

function onSubmit(event) {
  event.preventDefault();
  const title = els.draft.value.trim();
  if (!title) return;
  const start = keyOf(selected);
  const due = els.due.value && els.due.value >= start ? els.due.value : "";
  const newKind = filter !== "all" ? filter : lastKind;
  const order = nextTopOrder(); // 新待办排在最上面
  const task = {
    id: crypto.randomUUID(),
    title,
    done: false,
    createdAt: Date.now(),
    kind: newKind,
    order,
  };
  if (due) {
    state.spans.push({ ...task, start, due });
  } else {
    tasksOf(selected).push(task);
  }
  els.draft.value = "";
  els.due.value = "";
  doneOpen = false;
  save();
  render();
  els.draft.focus();
}

function selectDate(date) {
  commitEdit();
  selected = startOfDay(date);
  doneOpen = false;
  editingId = null;
  render();
}

function toggleTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.done = !task.done;
  if (task.done) doneOpen = true;
  save();
  render();
}

function deleteTask(id) {
  const spanIndex = state.spans.findIndex((task) => task.id === id);
  if (spanIndex >= 0) {
    state.spans.splice(spanIndex, 1);
  } else {
    for (const key of Object.keys(state.days)) {
      if (!Array.isArray(state.days[key])) continue;
      state.days[key] = state.days[key].filter((task) => task.id !== id);
    }
  }
  if (editingId === id) editingId = null;
  save();
  render();
}

function beginEdit(id) {
  editingId = id;
  render();
  const input = document.querySelector(".title-edit");
  if (!input) return;
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit();
    }
    if (event.key === "Escape") {
      editingId = null;
      render();
    }
  });
  input.addEventListener("blur", () => {
    if (editingId === id) commitEdit();
  });
}

function commitEdit() {
  if (!editingId) return;
  const input = document.querySelector(`.title-edit[data-id="${editingId}"]`);
  const task = findTask(editingId);
  editingId = null;
  if (task && input) {
    const title = input.value.trim();
    if (title) task.title = title;
  }
  save();
  render();
}

function carryPending() {
  const selectedKey = keyOf(selected);
  const titles = new Set(tasksOf(selected).filter((task) => !task.done).map((task) => task.title));
  const pending = [];
  for (const [dayKey, list] of Object.entries(state.days)) {
    if (!Array.isArray(list) || dayKey >= selectedKey) continue;
    for (const task of list) {
      if (!task.done && !titles.has(task.title)) pending.push({ task, dayKey });
    }
  }
  if (pending.length === 0) return;
  // 移动而非复制：同一条任务（同 id）从原日期挪到选中日期，始终只有一条数据；
  // 编辑、完成都落在它本身，不会再出现“又有一件没带入”的重复提示。
  for (const { task, dayKey } of pending) {
    state.days[dayKey] = state.days[dayKey].filter((item) => item !== task);
    task.order = nextBottomOrder(); // 带入的待办排在列表底部
    tasksOf(selected).push(task);
  }
  save();
  render();
}

function cycleKind(id) {
  const task = findTask(id);
  if (!task) return;
  const order = KINDS.map((item) => item.id);
  const next = order[(order.indexOf(kindOf(task)) + 1) % order.length];
  task.kind = next;
  save();
  render();
}

// 给待办设置截止时间：原本没有截止的当天任务转为跨天任务（从当前查看的日期开始，每天出现直到完成），列表位置不变
function applyDueToTask(taskId, key) {
  const task = findTask(taskId);
  if (!task) return;
  const minKey = task.start || keyOf(selected);
  if (key < minKey) return; // 截止不能早于任务的起始日
  if (!task.due) {
    for (const dayKey of Object.keys(state.days)) {
      if (!Array.isArray(state.days[dayKey])) continue;
      state.days[dayKey] = state.days[dayKey].filter((item) => item.id !== taskId);
    }
    task.start = keyOf(selected);
    state.spans.push(task);
  }
  task.due = key;
  save();
  render();
}

// 清除待办的截止时间：跨天任务转为当天任务（放进当前查看的日期），列表位置不变
function clearTaskDue(taskId) {
  const task = findTask(taskId);
  if (!task) return;
  if (task.start) {
    state.spans = state.spans.filter((item) => item.id !== taskId);
    delete task.start;
    delete task.due;
    tasksOf(selected).push(task);
  } else {
    delete task.due;
  }
  save();
  render();
}

function parseKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return startOfDay(new Date(year, month - 1, day));
}

document.addEventListener("keydown", (event) => {
  const typing = document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
  if (typing) return;
  if (event.key === "ArrowLeft") selectDate(addDays(selected, -1));
  if (event.key === "ArrowRight") selectDate(addDays(selected, 1));
});

/* ── 自定义日历弹窗 ── */
function toggleCalendar() {
  const pop = els.calPop;
  if (pop.hidden) {
    // 输入框模式：定位到当前 due 日期或选中日期所在月
    dueTargetId = null;
    const current = els.due.value ? parseKey(els.due.value) : selected;
    calDate = new Date(current.getFullYear(), current.getMonth(), 1);
    renderCalendar();
    positionCalendar(els.dueField);
    pop.hidden = false;
  } else {
    closeCalendar();
  }
}

// 打开日历编辑某条待办的截止时间，锚定在点击的按钮上
function openDueEditor(taskId, anchor) {
  const task = findTask(taskId);
  if (!task) return;
  dueTargetId = taskId;
  const base = task.due ? parseKey(task.due) : selected;
  calDate = new Date(base.getFullYear(), base.getMonth(), 1);
  renderCalendar();
  positionCalendar(anchor);
  els.calPop.hidden = false;
}

function positionCalendar(anchor) {
  const rect = (anchor || els.dueField).getBoundingClientRect();
  const pop = els.calPop;
  pop.style.top = `${rect.bottom + 8}px`;
  pop.style.right = `${window.innerWidth - rect.right}px`;
}

function renderCalendar() {
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  els.calTitle.textContent = `${year}年${month + 1}月`;

  const firstDay = new Date(year, month, 1);
  // 周一作为一周的开始
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const today = startOfDay(new Date());
  // 编辑待办时高亮该待办当前的截止日期；编辑输入框时高亮输入框里的日期
  const selectedKey = dueTargetId ? (findTask(dueTargetId)?.due || "") : els.due.value;

  let html = "";
  // 上月补位
  for (let i = startOffset - 1; i >= 0; i--) {
    html += `<span class="cal-day other-month">${daysInPrevMonth - i}</span>`;
  }
  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = keyOf(new Date(year, month, d));
    const isToday = dateKey === keyOf(today);
    const isSelected = dateKey === selectedKey;
    const cls = ["cal-day", isToday ? "today" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
    html += `<span class="${cls}" data-date="${dateKey}">${d}</span>`;
  }
  // 下月补位，填满 42 格（6行）
  const totalCells = startOffset + daysInMonth;
  const remainder = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= remainder; d++) {
    html += `<span class="cal-day other-month">${d}</span>`;
  }

  els.calGrid.innerHTML = html;
}

function closeCalendar() {
  els.calPop.hidden = true;
  dueTargetId = null;
}

function updateDueDisplay() {
  const value = els.due.value;
  if (!value) {
    els.dueDisplay.hidden = true;
    els.dueField.classList.remove("has-value");
    return;
  }
  const date = parseKey(value);
  els.dueDisplay.textContent = `${date.getMonth() + 1}月${date.getDate()}日`;
  els.dueDisplay.hidden = false;
  els.dueField.classList.add("has-value");
}

// 日历弹窗内的点击事件
els.calPop.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-cal-action]");
  const day = event.target.closest(".cal-day[data-date]");

  if (nav) {
    const action = nav.dataset.calAction;
    if (action === "prev") calDate = new Date(calDate.getFullYear(), calDate.getMonth() - 1, 1);
    if (action === "next") calDate = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 1);
    if (action === "clear") {
      if (dueTargetId) clearTaskDue(dueTargetId);
      else { els.due.value = ""; updateDueDisplay(); }
      closeCalendar();
      return;
    }
    if (action === "today") {
      const todayKey = keyOf(new Date());
      if (dueTargetId) applyDueToTask(dueTargetId, todayKey);
      else { els.due.value = todayKey; updateDueDisplay(); }
      closeCalendar();
      return;
    }
    renderCalendar();
    return;
  }

  if (day) {
    const dateKey = day.dataset.date;
    if (dueTargetId) applyDueToTask(dueTargetId, dateKey);
    else { els.due.value = dateKey; updateDueDisplay(); }
    closeCalendar();
    return;
  }

  // 点弹窗内部空白处不关闭
  event.stopPropagation();
});

// 点击外部关闭日历（编辑待办截止的按钮除外，避免刚打开就被关闭）
document.addEventListener("click", (event) => {
  if (!els.calPop.hidden && !event.target.closest("#calendar-pop") && !event.target.closest("#due-field") && !event.target.closest("[data-action='edit-due']")) {
    closeCalendar();
  }
});

/* ── 灵感一刻 ── */
function renderSideSections() {
  const ui = state.ui;
  els.ideasCount.hidden = state.ideas.length === 0;
  els.ideasCount.textContent = state.ideas.length;
  els.ideasBody.hidden = !ui.ideasOpen;
  els.notebookBody.hidden = !ui.notebookOpen;
  els.ideasToggle.setAttribute("aria-expanded", ui.ideasOpen ? "true" : "false");
  els.notebookToggle.setAttribute("aria-expanded", ui.notebookOpen ? "true" : "false");
  els.ideaList.innerHTML = state.ideas.map(renderIdea).join("");
  if (document.activeElement !== els.notebook) {
    els.notebook.value = state.notebook;
    autosizeNotebook();
  }
}

function renderIdea(idea) {
  if (state.ui.editingIdea === idea.id) {
    return `<li class="idea">
      <input class="idea-edit" data-id="${idea.id}" value="${escapeHtml(idea.text)}" maxlength="120" autocomplete="off" aria-label="编辑灵感" />
    </li>`;
  }
  return `<li class="idea">
    <button type="button" class="idea-title" data-action="edit-idea" data-id="${idea.id}">${escapeHtml(idea.text)}</button>
    <button type="button" class="ghost" data-action="delete-idea" data-id="${idea.id}">删除</button>
  </li>`;
}

function onIdea(event) {
  event.preventDefault();
  const text = els.ideaInput.value.trim();
  if (!text) return;
  state.ideas.unshift({ id: crypto.randomUUID(), text, createdAt: Date.now() });
  els.ideaInput.value = "";
  save();
  render();
  els.ideaInput.focus();
}

function deleteIdea(id) {
  state.ideas = state.ideas.filter((idea) => idea.id !== id);
  if (state.ui.editingIdea === id) state.ui.editingIdea = null;
  save();
  render();
}

let ideaEditCancelled = false;

function beginEditIdea(id) {
  ideaEditCancelled = false;
  state.ui.editingIdea = id;
  save();
  render();
  const input = els.ideaList.querySelector(`.idea-edit[data-id="${id}"]`);
  if (input) {
    input.focus();
    input.select();
  }
}

function commitIdeaEdit(id) {
  const input = els.ideaList.querySelector(`.idea-edit[data-id="${id}"]`);
  if (!input) {
    // 输入框已被移除（如渲染中断）：只退出编辑态，不删除条目
    state.ui.editingIdea = null;
    ideaEditCancelled = false;
    save();
    render();
    return;
  }
  const text = input.value.trim();
  if (!text) {
    state.ideas = state.ideas.filter((idea) => idea.id !== id);
  } else {
    const idea = state.ideas.find((idea) => idea.id === id);
    if (idea) idea.text = text;
  }
  state.ui.editingIdea = null;
  ideaEditCancelled = false;
  save();
  render();
}

// 行内编辑：回车保存、Esc 取消、失焦保存
els.ideaList.addEventListener("keydown", (event) => {
  if (!event.target.classList.contains("idea-edit")) return;
  if (event.key === "Enter") {
    event.preventDefault();
    commitIdeaEdit(event.target.dataset.id);
  } else if (event.key === "Escape") {
    ideaEditCancelled = true;
    state.ui.editingIdea = null;
    save();
    render();
    setTimeout(() => { ideaEditCancelled = false; }, 0);
  }
});

// 行内编辑：回车保存、Esc 取消、失焦（focusout 会冒泡）保存
els.ideaList.addEventListener("focusout", (event) => {
  if (!event.target.classList.contains("idea-edit")) return;
  if (ideaEditCancelled) {
    ideaEditCancelled = false;
    return;
  }
  commitIdeaEdit(event.target.dataset.id);
});

/* ── 笔记本 ── */
function onNotebook() {
  state.notebook = els.notebook.value;
  autosizeNotebook();
  save();
}

function autosizeNotebook() {
  els.notebook.style.height = "auto";
  els.notebook.style.height = `${els.notebook.scrollHeight}px`;
}

