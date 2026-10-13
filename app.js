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
  { id: "other", label: "其他" },
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

const els = {
  kicker: document.querySelector("#date-kicker"),
  num: document.querySelector("#date-num"),
  sub: document.querySelector("#date-sub"),
  week: document.querySelector("#week"),
  today: document.querySelector(".today-link"),
  intentLabel: document.querySelector("#intent-label"),
  intent: document.querySelector("#intent"),
  composer: document.querySelector("#composer"),
  draft: document.querySelector("#draft"),
  due: document.querySelector("#due"),
  dueDisplay: document.querySelector("#due-display"),
  dueField: document.querySelector("#due-field"),
  calPop: document.querySelector("#calendar-pop"),
  calTitle: document.querySelector("#cal-title"),
  calGrid: document.querySelector("#cal-grid"),
  stats: document.querySelector("#stats"),
  carry: document.querySelector("#carry"),
  openList: document.querySelector("#open-list"),
  doneWrap: document.querySelector("#done-wrap"),
  doneLabel: document.querySelector("#done-label"),
  doneToggle: document.querySelector(".done-toggle"),
  doneList: document.querySelector("#done-list"),
  empty: document.querySelector("#empty"),
  countLine: document.querySelector("#count-line"),
};

document.body.addEventListener("click", onClick);
els.composer.addEventListener("submit", onSubmit);
els.intent.addEventListener("input", onIntent);
els.dueField.addEventListener("click", toggleCalendar);

render();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || typeof raw !== "object") return { days: {}, intents: {}, spans: [] };
    raw.days = raw.days && typeof raw.days === "object" ? raw.days : {};
    raw.intents = raw.intents && typeof raw.intents === "object" ? raw.intents : {};
    raw.spans = Array.isArray(raw.spans) ? raw.spans : [];
    return raw;
  } catch {
    return { days: {}, intents: {}, spans: [] };
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
  return [...spanning, ...daily];
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

function intentCopy(date, today) {
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return "今日重点";
  if (diff === -1) return "昨日重点";
  if (diff === 1) return "明日重点";
  return "当日重点";
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
  const open = tasks.filter((task) => !task.done).sort(compareOpen);
  const done = tasks.filter((task) => task.done);
  const openAll = all.filter((task) => !task.done);

  els.kicker.textContent = relativeLabel(selected);
  els.num.textContent = `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日`;
  els.sub.textContent = WEEKDAYS[selected.getDay()];
  els.today.hidden = sameDay(selected, today);
  els.intentLabel.textContent = intentCopy(selected, today);
  document.title = `${relativeLabel(selected)} ${selected.getMonth() + 1}月${selected.getDate()}日 · 案头`;

  renderWeek(today);
  renderIntent();
  renderCarry(today, openAll);
  renderStats(open, done);
  els.openList.innerHTML = open.map(renderTask).join("");
  els.doneList.innerHTML = done.map(renderTask).join("");
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

function renderIntent() {
  const key = keyOf(selected);
  const value = state.intents[key] || "";
  if (document.activeElement === els.intent) return;
  els.intent.value = value;
  autosizeIntent();
}

function renderCarry(today, openToday) {
  const show = sameDay(selected, today);
  const yesterday = tasksOf(addDays(today, -1)).filter((task) => !task.done);
  const titles = new Set(openToday.map((task) => task.title));
  const pending = yesterday.filter((task) => !titles.has(task.title));
  if (!show || pending.length === 0) {
    els.carry.hidden = true;
    els.carry.innerHTML = "";
    return;
  }
  els.carry.hidden = false;
  els.carry.innerHTML = `<span>昨天还有 ${pending.length} 件事没做完</span><button type="button" data-action="carry">带入今天</button>`;
}

function renderChoices() {
  document.querySelectorAll("[data-action='filter']").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.kind === filter ? "true" : "false");
  });
}

function renderStats(open, done) {
  if (open.length + done.length === 0) {
    els.stats.textContent = filter === "all" ? "暂无待办" : `${kindLabel(filter)}暂无`;
    return;
  }
  const prefix = filter === "all" ? "" : `${kindLabel(filter)} · `;
  els.stats.textContent = `${prefix}${open.length} 件未完成 · ${done.length} 件已完成`;
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

function renderTask(task) {
  const title = editingId === task.id
    ? `<input class="title-edit" data-id="${task.id}" value="${escapeHtml(task.title)}" maxlength="120" />`
    : `<button type="button" class="title-btn" data-action="edit" data-id="${task.id}">${escapeHtml(task.title)}</button>`;
  const meta = dueMeta(task, selected);
  const due = meta
    ? `<span class="due-meta ${meta.kind}">${escapeHtml(meta.text)}</span>`
    : "";
  const taskKind = kindOf(task);
  return `<li class="task${task.done ? " is-done" : ""}">
    <button type="button" class="check" data-action="toggle" data-id="${task.id}" aria-label="${task.done ? "标为未完成" : "标为完成"}" aria-pressed="${task.done}">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.2 6.3 11.5 13 4.5" /></svg>
    </button>
    <div class="task-main">
      <button type="button" class="kind-tag kind-${taskKind}" data-action="cycle-kind" data-id="${task.id}" aria-label="类型：${kindLabel(taskKind)}，点击切换">${kindLabel(taskKind)}</button>
      ${title}
    </div>
    ${due}
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
  if (action === "toggle-done") {
    doneOpen = !doneOpen;
    render();
  }
  if (action === "carry") carryYesterday();
}

function onSubmit(event) {
  event.preventDefault();
  const title = els.draft.value.trim();
  if (!title) return;
  const start = keyOf(selected);
  const due = els.due.value && els.due.value >= start ? els.due.value : "";
  const newKind = filter !== "all" ? filter : lastKind;
  const task = {
    id: crypto.randomUUID(),
    title,
    done: false,
    createdAt: Date.now(),
    kind: newKind,
  };
  if (due) {
    state.spans.unshift({ ...task, start, due });
  } else {
    tasksOf(selected).unshift(task);
  }
  els.draft.value = "";
  els.due.value = "";
  doneOpen = false;
  save();
  render();
  els.draft.focus();
}

function onIntent() {
  const value = els.intent.value.trim();
  const key = keyOf(selected);
  if (value) state.intents[key] = els.intent.value.slice(0, 80);
  else delete state.intents[key];
  autosizeIntent();
  save();
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

function carryYesterday() {
  const today = startOfDay(new Date());
  const titles = new Set(tasksOf(today).filter((task) => !task.done).map((task) => task.title));
  const pending = tasksOf(addDays(today, -1)).filter((task) => !task.done && !titles.has(task.title));
  pending.forEach((task) => {
    tasksOf(today).push({
      id: crypto.randomUUID(),
      title: task.title,
      done: false,
      createdAt: Date.now(),
      kind: kindOf(task),
    });
  });
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

function parseKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return startOfDay(new Date(year, month - 1, day));
}

function autosizeIntent() {
  els.intent.style.height = "auto";
  els.intent.style.height = `${els.intent.scrollHeight}px`;
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
    // 打开日历：定位到当前 due 日期或选中日期所在月
    const current = els.due.value ? parseKey(els.due.value) : selected;
    calDate = new Date(current.getFullYear(), current.getMonth(), 1);
    renderCalendar();
    positionCalendar();
    pop.hidden = false;
  } else {
    pop.hidden = true;
  }
}

function positionCalendar() {
  const rect = els.dueField.getBoundingClientRect();
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
  const selectedKey = els.due.value;

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
}

function updateDueDisplay() {
  const value = els.due.value;
  if (!value) {
    els.dueDisplay.textContent = "不限";
    els.dueField.classList.remove("has-value");
    return;
  }
  const date = parseKey(value);
  els.dueDisplay.textContent = `${date.getMonth() + 1}月${date.getDate()}日`;
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
    if (action === "clear") { els.due.value = ""; updateDueDisplay(); closeCalendar(); return; }
    if (action === "today") { els.due.value = keyOf(new Date()); updateDueDisplay(); closeCalendar(); return; }
    renderCalendar();
    return;
  }

  if (day) {
    els.due.value = day.dataset.date;
    updateDueDisplay();
    closeCalendar();
    return;
  }

  // 点弹窗内部空白处不关闭
  event.stopPropagation();
});

// 点击外部关闭日历
document.addEventListener("click", (event) => {
  if (!els.calPop.hidden && !event.target.closest("#calendar-pop") && !event.target.closest("#due-field")) {
    closeCalendar();
  }
});
