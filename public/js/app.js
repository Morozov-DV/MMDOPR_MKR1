// Клієнтська частина (SPA без фреймворків): вкладки, таблиці, форми, виклики API.
"use strict";

// ---------------------------------------------------------------- Стан
const state = {
  tickets: [],
  employees: [],
  plan: null,       // поточний план, який показано на сторінці «Планування»
  planNote: "",     // підпис до плану (якщо відкрито з історії)
};

const STATUS_LABELS = { new: "Нова", in_progress: "У роботі", done: "Виконана" };

// ---------------------------------------------------------------- Допоміжні функції
const $ = (id) => document.getElementById(id);

/** Екранування HTML — захист від XSS при виведенні користувацьких рядків. */
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Показ повідомлення (kind: "ok" | "error"); details — список окремих помилок. */
function showMessage(kind, text, details = []) {
  const box = $("message");
  box.className = `message ${kind}`;
  box.innerHTML = esc(text) + (details.length ? `<ul>${details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : "");
}
const clearMessage = () => ($("message").className = "message hidden");

/** Обгортка над fetch: повертає JSON або кидає помилку з повідомленням сервера. */
async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Немає зв'язку із сервером.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.message || `Помилка ${res.status}`);
    err.details = data.error?.details || [];
    throw err;
  }
  return data;
}

/** Виконує дію й показує помилку, якщо вона виникла. */
async function safe(action) {
  try {
    await action();
  } catch (err) {
    showMessage("error", err.message, err.details || []);
  }
}

// ---------------------------------------------------------------- Вкладки
$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  $(`page-${btn.dataset.tab}`).classList.remove("hidden");
  clearMessage();
});

// ---------------------------------------------------------------- Завантаження даних
async function loadAll() {
  [state.tickets, state.employees] = await Promise.all([api("GET", "/api/tickets"), api("GET", "/api/employees")]);
  renderTickets();
  renderEmployees();
}

/** Після зміни заявок/виконавців старий план застарів — скидаємо його. */
function invalidatePlan() {
  state.plan = null;
  state.planNote = "";
  renderPlan();
}

// ================================================================ ЗАЯВКИ
function renderTickets() {
  $("tickets-body").innerHTML = state.tickets
    .map(
      (t) => `<tr>
        <td>${esc(t.id)}</td><td class="wrap">${esc(t.title)}</td><td>${t.priority}</td><td>${t.effort}</td>
        <td>${t.minCompetence}</td>
        <td><select data-status="${esc(t.id)}">${Object.entries(STATUS_LABELS)
          .map(([v, l]) => `<option value="${v}" ${t.status === v ? "selected" : ""}>${l}</option>`)
          .join("")}</select></td>
        <td><button data-edit-ticket="${esc(t.id)}">Редагувати</button>
            <button class="danger" data-del-ticket="${esc(t.id)}">Видалити</button></td>
      </tr>`
    )
    .join("") || `<tr><td colspan="7" class="hint">Заявок немає.</td></tr>`;
}

/** Валідація форми (на клієнті; сервер перевіряє повторно). Повертає список помилок. */
function validateTicketForm() {
  const errors = [];
  const check = (id, ok, msg) => {
    $(id).classList.toggle("invalid", !ok);
    if (!ok) errors.push(msg);
  };
  const num = (id) => ($(id).value.trim() === "" ? NaN : Number($(id).value));
  check("ticket-title", $("ticket-title").value.trim().length > 0, "Вкажіть назву заявки.");
  check("ticket-priority", Number.isInteger(num("ticket-priority")) && num("ticket-priority") >= 1 && num("ticket-priority") <= 5,
    "Пріоритет — ціле число від 1 до 5.");
  check("ticket-effort", num("ticket-effort") > 0 && num("ticket-effort") <= 100, "Трудомісткість — число від 0 (не включно) до 100.");
  check("ticket-min", Number.isInteger(num("ticket-min")) && num("ticket-min") >= 1 && num("ticket-min") <= 5,
    "Мінімальна компетентність — ціле число від 1 до 5.");
  return errors;
}

function resetTicketForm() {
  $("ticket-form").reset();
  $("ticket-id").value = "";
  $("ticket-form-title").textContent = "Нова заявка";
  document.querySelectorAll("#ticket-form input").forEach((i) => i.classList.remove("invalid"));
}

$("ticket-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const errors = validateTicketForm();
  if (errors.length) return showMessage("error", "Виправте помилки у формі:", errors);

  const body = {
    title: $("ticket-title").value.trim(),
    priority: Number($("ticket-priority").value),
    effort: Number($("ticket-effort").value),
    minCompetence: Number($("ticket-min").value),
    status: $("ticket-status").value,
  };
  const id = $("ticket-id").value;
  safe(async () => {
    await (id ? api("PUT", `/api/tickets/${encodeURIComponent(id)}`, body) : api("POST", "/api/tickets", body));
    resetTicketForm();
    await loadAll();
    invalidatePlan();
    showMessage("ok", id ? "Заявку оновлено." : "Заявку додано.");
  });
});
$("ticket-cancel").addEventListener("click", resetTicketForm);

// Делегування подій таблиці заявок: редагування, видалення, зміна статусу
$("tickets-body").addEventListener("click", (e) => {
  const editId = e.target.dataset.editTicket;
  const delId = e.target.dataset.delTicket;
  if (editId) {
    const t = state.tickets.find((x) => x.id === editId);
    $("ticket-id").value = t.id;
    $("ticket-title").value = t.title;
    $("ticket-priority").value = t.priority;
    $("ticket-effort").value = t.effort;
    $("ticket-min").value = t.minCompetence;
    $("ticket-status").value = t.status;
    $("ticket-form-title").textContent = `Редагування заявки ${t.id}`;
    $("ticket-form").scrollIntoView({ behavior: "smooth" });
  }
  if (delId && confirm(`Видалити заявку ${delId}?`)) {
    safe(async () => {
      await api("DELETE", `/api/tickets/${encodeURIComponent(delId)}`);
      await loadAll();
      invalidatePlan();
      showMessage("ok", "Заявку видалено.");
    });
  }
});
$("tickets-body").addEventListener("change", (e) => {
  const id = e.target.dataset.status;
  if (!id) return;
  const t = state.tickets.find((x) => x.id === id);
  safe(async () => {
    await api("PUT", `/api/tickets/${encodeURIComponent(id)}`, { ...t, status: e.target.value });
    await loadAll();
    invalidatePlan();
    showMessage("ok", `Статус заявки ${id}: «${STATUS_LABELS[e.target.value]}».`);
  });
});

// ================================================================ ВИКОНАВЦІ
function renderEmployees() {
  // Поточне завантаження беремо з активного плану (якщо його немає — 0)
  const loadOf = (id) => state.plan?.employeeLoads.find((l) => l.employeeId === id);
  $("employees-body").innerHTML = state.employees
    .map((emp) => {
      const l = loadOf(emp.id);
      return `<tr>
        <td>${esc(emp.id)}</td><td>${esc(emp.name)}</td><td>${emp.competence}</td><td>${emp.availableHours}</td>
        <td>${l ? l.usedHours : 0}</td><td>${l ? l.remainingHours : emp.availableHours}</td>
        <td><button data-edit-emp="${esc(emp.id)}">Редагувати</button></td>
      </tr>`;
    })
    .join("") || `<tr><td colspan="7" class="hint">Виконавців немає.</td></tr>`;
}

function validateEmployeeForm() {
  const errors = [];
  const check = (id, ok, msg) => {
    $(id).classList.toggle("invalid", !ok);
    if (!ok) errors.push(msg);
  };
  const num = (id) => ($(id).value.trim() === "" ? NaN : Number($(id).value));
  check("employee-name", $("employee-name").value.trim().length > 0, "Вкажіть ім'я виконавця.");
  check("employee-competence", Number.isInteger(num("employee-competence")) && num("employee-competence") >= 1 && num("employee-competence") <= 5,
    "Компетентність — ціле число від 1 до 5.");
  check("employee-hours", num("employee-hours") > 0 && num("employee-hours") <= 168, "Доступний час — число від 0 (не включно) до 168.");
  return errors;
}

function resetEmployeeForm() {
  $("employee-form").reset();
  $("employee-id").value = "";
  $("employee-form-title").textContent = "Новий виконавець";
  document.querySelectorAll("#employee-form input").forEach((i) => i.classList.remove("invalid"));
}

$("employee-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const errors = validateEmployeeForm();
  if (errors.length) return showMessage("error", "Виправте помилки у формі:", errors);

  const body = {
    name: $("employee-name").value.trim(),
    competence: Number($("employee-competence").value),
    availableHours: Number($("employee-hours").value),
  };
  const id = $("employee-id").value;
  safe(async () => {
    await (id ? api("PUT", `/api/employees/${encodeURIComponent(id)}`, body) : api("POST", "/api/employees", body));
    resetEmployeeForm();
    await loadAll();
    invalidatePlan();
    showMessage("ok", id ? "Виконавця оновлено." : "Виконавця додано.");
  });
});
$("employee-cancel").addEventListener("click", resetEmployeeForm);

$("employees-body").addEventListener("click", (e) => {
  const id = e.target.dataset.editEmp;
  if (!id) return;
  const emp = state.employees.find((x) => x.id === id);
  $("employee-id").value = emp.id;
  $("employee-name").value = emp.name;
  $("employee-competence").value = emp.competence;
  $("employee-hours").value = emp.availableHours;
  $("employee-form-title").textContent = `Редагування виконавця ${emp.id}`;
  $("employee-form").scrollIntoView({ behavior: "smooth" });
});

// ================================================================ ПЛАНУВАННЯ
/** Вивід плану: показники, завантаження, таблиця розподілу, нерозподілені. */
function renderPlan() {
  const plan = state.plan;
  $("plan-empty").classList.toggle("hidden", !!plan);
  $("plan-result").classList.toggle("hidden", !plan);
  $("btn-save").disabled = !plan;
  renderEmployees(); // оновити колонки «поточне завантаження»
  if (!plan) return;

  const m = plan.metrics;
  const card = (v, l) => `<div class="card"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  $("metrics").innerHTML =
    card(m.totalTickets, "Усього заявок") + card(m.assignedCount, "Розподілено") +
    card(m.unassignedCount, "Нерозподілено") + card(`${m.assignedEffort} год`, "Сумарна трудомісткість розподілених") +
    card(`${m.loadStdDev} %`, "Розкид завантаження (σ)");

  $("loads").innerHTML = plan.employeeLoads
    .map(
      (l) => `<div class="load-row">
        <div><b>${esc(l.name)}</b> <span class="badge">комп. ${l.competence}</span></div>
        <div class="bar"><span class="${l.loadPercent >= 100 ? "full" : ""}" style="width:${Math.min(l.loadPercent, 100)}%"></span></div>
        <div>${l.usedHours}/${l.availableHours} год (${l.loadPercent} %), залишок ${l.remainingHours}</div>
      </div>`
    )
    .join("");

  // Випадаючий список виконавців для ручного коригування
  const options = (selectedId) =>
    `<option value="">— не призначено —</option>` +
    state.employees
      .map((e) => `<option value="${esc(e.id)}" ${e.id === selectedId ? "selected" : ""}>${esc(e.name)} (комп. ${e.competence})</option>`)
      .join("");

  const rows = plan.assignments.map(
    (a) => `<tr>
      <td class="wrap"><b>${esc(a.ticketId)}</b> ${esc(a.title)}</td><td>${a.priority}</td><td>${a.effort}</td>
      <td><select data-assign="${esc(a.ticketId)}">${options(a.employeeId)}</select></td>
      <td class="${a.constraintsOk ? "good" : "bad"}">${esc(a.check)}</td></tr>`
  );
  // Нерозподілені теж можна призначити вручну — додаємо їх у таблицю з порожнім вибором
  const rowsUn = plan.unassigned.map(
    (u) => `<tr>
      <td class="wrap"><b>${esc(u.ticketId)}</b> ${esc(u.title)}</td><td>${u.priority}</td><td>${u.effort}</td>
      <td><select data-assign="${esc(u.ticketId)}">${options("")}</select></td>
      <td class="bad">Не призначено</td></tr>`
  );
  $("assign-body").innerHTML = rows.concat(rowsUn).join("") || `<tr><td colspan="5" class="hint">Немає заявок для планування.</td></tr>`;

  $("unassigned").innerHTML = plan.unassigned.length
    ? `<ul>${plan.unassigned.map((u) => `<li><b>${esc(u.ticketId)}</b> ${esc(u.title)} — ${esc(u.reason)}</li>`).join("")}</ul>`
    : `<div class="hint">Усі заявки розподілено.</div>`;
}

/** Поточні призначення плану у форматі для API. */
const currentPairs = () => state.plan.assignments.map((a) => ({ ticketId: a.ticketId, employeeId: a.employeeId }));

// Сформувати план: клієнт передає поточні заявки та виконавців на сервер
$("btn-generate").addEventListener("click", () =>
  safe(async () => {
    state.plan = await api("POST", "/api/planning/generate", { tickets: state.tickets, employees: state.employees });
    state.planNote = "";
    renderPlan();
    const un = state.plan.metrics.unassignedCount;
    showMessage("ok", un ? `План сформовано. Нерозподілених заявок: ${un}.` : "План сформовано: усі заявки розподілено.");
  })
);

// Ручне коригування: сервер повторно перевіряє компетентність і час
$("assign-body").addEventListener("change", (e) => {
  const ticketId = e.target.dataset.assign;
  if (!ticketId) return;
  safe(async () => {
    try {
      state.plan = await api("POST", "/api/planning/assign", {
        assignments: currentPairs(),
        ticketId,
        employeeId: e.target.value || null,
      });
      showMessage("ok", `Призначення заявки ${ticketId} змінено.`);
    } finally {
      renderPlan(); // у разі помилки повертає старе значення у списку
    }
  });
});

// Зберегти план
$("btn-save").addEventListener("click", () =>
  safe(async () => {
    const saved = await api("POST", "/api/planning/save", { assignments: currentPairs(), note: state.planNote });
    showMessage("ok", `План збережено (id: ${saved.id}).`);
    if (!$("history-block").classList.contains("hidden")) await loadHistory();
  })
);

// Історія планів
async function loadHistory() {
  const items = await api("GET", "/api/planning/history");
  $("history-block").classList.remove("hidden");
  $("history").innerHTML = items.length
    ? items
        .map(
          (h, i) => `<div class="history-item">
        <div><b>${new Date(h.createdAt).toLocaleString("uk-UA")}</b> — розподілено ${h.plan.metrics.assignedCount} із ${h.plan.metrics.totalTickets},
        нерозподілено ${h.plan.metrics.unassignedCount}<br><small>id: ${esc(h.id)}</small></div>
        <button data-open-history="${i}">Відкрити</button></div>`
        )
        .join("")
    : `<div class="hint">Збережених планів ще немає.</div>`;
  $("history").dataset.items = JSON.stringify(items);
}
$("btn-history").addEventListener("click", () => safe(loadHistory));
$("history").addEventListener("click", (e) => {
  const i = e.target.dataset.openHistory;
  if (i === undefined) return;
  const saved = JSON.parse($("history").dataset.items)[Number(i)];
  state.plan = saved.plan;
  state.planNote = `Відновлено з плану ${saved.id}`;
  renderPlan();
  showMessage("ok", "План відкрито з історії.");
});

// ---------------------------------------------------------------- Старт
safe(loadAll);
