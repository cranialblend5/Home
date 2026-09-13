// ---------------------------------------------------------------------------
// Casa Split — tiny shared apartment-expense ledger.
// No login system: everyone opens the same link, picks their name, and the
// data lives in a shared Firestore database (see firebase-config.js).
// Admin actions (editing split ratios, cheque schedule, deleting other
// people's entries) are gated behind a PIN stored in Firestore.
// ---------------------------------------------------------------------------

let db = null;

const state = {
  who: localStorage.getItem("casaSplitWho") || MEMBERS[0].id,
  isAdmin: sessionStorage.getItem("casaSplitAdmin") === "1",
  config: null,
  expenses: [],
  settlements: [],
  pinResolve: null,
};

const fmt = (n) =>
  `${CURRENCY} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const memberName = (id) => MEMBERS.find((m) => m.id === id)?.name || id;

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2500);
}

// ---------------------------------------------------------------------------
// Firestore wiring
// ---------------------------------------------------------------------------

function initFirebase() {
  if (typeof firebase === "undefined") {
    throw new Error("Firebase SDK failed to load (check your internet connection) and reload the page.");
  }
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}

function requireDb() {
  if (!db) {
    toast("Not connected — check your internet connection and reload the page.");
    return false;
  }
  return true;
}

function ensureConfigDoc() {
  const ref = db.collection("meta").doc("config");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data();

    const splitOverrides = {};
    for (const key of Object.keys(SPLIT_TEMPLATES)) {
      splitOverrides[key] = { ...SPLIT_TEMPLATES[key].percents };
    }
    const rentCheque = 113000 / 4;
    const config = {
      adminPin: DEFAULT_ADMIN_PIN,
      splitOverrides,
      cheques: [
        { label: "Cheque 1", amount: rentCheque, dueDate: "", paid: true },
        { label: "Cheque 2", amount: rentCheque, dueDate: "", paid: false },
        { label: "Cheque 3", amount: rentCheque, dueDate: "", paid: false },
        { label: "Cheque 4", amount: rentCheque, dueDate: "", paid: false },
      ],
      seeded: false,
    };
    tx.set(ref, config);
    return config;
  });
}

function splitAmounts(percents, amount) {
  const out = {};
  for (const m of MEMBERS) out[m.id] = Math.round(((percents[m.id] || 0) / 100) * amount * 100) / 100;
  return out;
}

async function seedHistoricalDataIfNeeded() {
  const ref = db.collection("meta").doc("config");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const config = snap.data();
    if (!config || config.seeded) return;

    const utilityPercents = config.splitOverrides.utility;
    const rentPercents = config.splitOverrides.rent;
    const today = new Date().toISOString().slice(0, 10);

    const historicalItems = [
      {
        description: "Rent - Cheque 1 (already cleared)",
        category: "rent",
        amount: 113000 / 4,
        splitType: "rent",
        percents: rentPercents,
      },
      {
        description: "Security Deposit (already paid to landlord)",
        category: "security_deposit",
        amount: 7000,
        splitType: "utility",
        percents: utilityPercents,
      },
      {
        description: "DEWA Deposit (already paid)",
        category: "dewa_deposit",
        amount: 2000,
        splitType: "utility",
        percents: utilityPercents,
      },
    ];

    for (const item of historicalItems) {
      const amounts = splitAmounts(item.percents, item.amount);
      const expenseRef = db.collection("expenses").doc();
      tx.set(expenseRef, {
        description: item.description,
        category: item.category,
        amount: item.amount,
        paidBy: "sendil_priya",
        date: today,
        splitType: item.splitType,
        splitPercents: item.percents,
        splitAmounts: amounts,
        notes: "Historical entry, seeded automatically.",
        createdBy: "sendil_priya",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      for (const m of MEMBERS) {
        if (m.id === "sendil_priya") continue;
        if (amounts[m.id] <= 0) continue;
        const settleRef = db.collection("settlements").doc();
        tx.set(settleRef, {
          from: m.id,
          to: "sendil_priya",
          amount: amounts[m.id],
          date: today,
          note: `Already-paid share of: ${item.description}`,
          createdBy: "sendil_priya",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    tx.update(ref, { seeded: true });
  });
}

function listenAll() {
  db.collection("meta")
    .doc("config")
    .onSnapshot((snap) => {
      if (snap.exists) {
        state.config = snap.data();
        renderAll();
      }
    });

  db.collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot((snap) => {
      state.expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    });

  db.collection("settlements")
    .orderBy("date", "desc")
    .onSnapshot((snap) => {
      state.settlements = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    });
}

// ---------------------------------------------------------------------------
// Balance math
// ---------------------------------------------------------------------------

function computeBalances() {
  const balance = {};
  for (const m of MEMBERS) balance[m.id] = 0;

  for (const e of state.expenses) {
    balance[e.paidBy] = (balance[e.paidBy] || 0) + Number(e.amount || 0);
    for (const m of MEMBERS) {
      balance[m.id] -= Number(e.splitAmounts?.[m.id] || 0);
    }
  }
  for (const s of state.settlements) {
    balance[s.from] = (balance[s.from] || 0) + Number(s.amount || 0);
    balance[s.to] = (balance[s.to] || 0) - Number(s.amount || 0);
  }
  return balance;
}

function simplifyDebts(balance) {
  const creditors = [];
  const debtors = [];
  for (const [id, bal] of Object.entries(balance)) {
    if (bal > 0.01) creditors.push({ id, amt: bal });
    else if (bal < -0.01) debtors.push({ id, amt: -bal });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const txns = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    txns.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.01) i++;
    if (creditors[j].amt < 0.01) j++;
  }
  return txns;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderAll() {
  renderTopbar();
  if (!state.config) return;
  renderDashboard();
  renderHistory();
  renderAdmin();
}

function renderTopbar() {
  const select = document.getElementById("whoSelect");
  select.innerHTML = MEMBERS.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  select.value = state.who;

  document.getElementById("adminTabBtn").hidden = !state.isAdmin;
  document.getElementById("adminBtn").textContent = state.isAdmin ? "🔓 Admin (on)" : "🔐 Admin";
}

function renderDashboard() {
  const balance = computeBalances();

  document.getElementById("balances").innerHTML = MEMBERS.map((m) => {
    const bal = balance[m.id] || 0;
    const cls = bal > 0.01 ? "positive" : bal < -0.01 ? "negative" : "neutral";
    const label = bal > 0.01 ? "is owed" : bal < -0.01 ? "owes" : "settled up";
    return `<div class="balance-row ${cls}">
      <span class="name">${m.name}</span>
      <span class="amt">${label} ${fmt(Math.abs(bal))}</span>
    </div>`;
  }).join("");

  const txns = simplifyDebts(balance);
  document.getElementById("settlementSuggestions").innerHTML = txns.length
    ? txns
        .map(
          (t) =>
            `<div class="suggestion-row">${memberName(t.from)} → ${memberName(t.to)} <b>${fmt(t.amount)}</b></div>`
        )
        .join("")
    : `<div class="hint">Everyone is settled up 🎉</div>`;

  const cheques = state.config.cheques || [];
  document.getElementById("chequeSchedule").innerHTML = cheques
    .map(
      (c, idx) => `<div class="cheque-row ${c.paid ? "paid" : "pending"}">
        <span>${c.label}</span>
        <span>${fmt(c.amount)}</span>
        <span>${c.dueDate || "no due date set"}</span>
        <span>${c.paid ? "✅ paid" : "⏳ pending"}</span>
      </div>`
    )
    .join("");

  const totalByCategory = {};
  let grandTotal = 0;
  for (const e of state.expenses) {
    totalByCategory[e.category] = (totalByCategory[e.category] || 0) + Number(e.amount || 0);
    grandTotal += Number(e.amount || 0);
  }
  document.getElementById("totalsSummary").innerHTML =
    CATEGORIES.map((c) =>
      totalByCategory[c.id] ? `<div class="total-row"><span>${c.label}</span><span>${fmt(totalByCategory[c.id])}</span></div>` : ""
    ).join("") + `<div class="total-row grand"><span>Total</span><span>${fmt(grandTotal)}</span></div>`;
}

function currentSplitPercents(splitKey) {
  return state.config?.splitOverrides?.[splitKey] || SPLIT_TEMPLATES[splitKey].percents;
}

function renderAddFormStatics() {
  document.getElementById("expCategory").innerHTML = CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
  document.getElementById("expPaidBy").innerHTML = MEMBERS.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  document.getElementById("expDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("settleFrom").innerHTML = MEMBERS.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  document.getElementById("settleTo").innerHTML = MEMBERS.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  document.getElementById("settleDate").value = new Date().toISOString().slice(0, 10);
  updateSplitPreview();
}

function updateSplitPreview() {
  const catId = document.getElementById("expCategory").value;
  const cat = CATEGORIES.find((c) => c.id === catId) || CATEGORIES[0];
  const percents = currentSplitPercents(cat.split);
  document.getElementById("defaultSplitPreview").innerHTML = document.getElementById("customSplitToggle").checked
    ? ""
    : `Default split: ${MEMBERS.map((m) => `${m.name} ${percents[m.id]}%`).join(" · ")}`;
}

function renderCustomSplitInputs() {
  const wrap = document.getElementById("customSplitInputs");
  const show = document.getElementById("customSplitToggle").checked;
  wrap.hidden = !show;
  if (!show) return;
  wrap.innerHTML = MEMBERS.map(
    (m) => `<label class="split-input">${m.name} %
      <input type="number" min="0" max="100" step="0.01" class="custom-pct" data-member="${m.id}" value="${(100 / MEMBERS.length).toFixed(2)}" />
    </label>`
  ).join("");
}

function renderHistory() {
  document.getElementById("expenseList").innerHTML = state.expenses.length
    ? state.expenses.map(renderExpenseRow).join("")
    : `<div class="hint">No expenses logged yet.</div>`;

  document.getElementById("settlementList").innerHTML = state.settlements.length
    ? state.settlements.map(renderSettlementRow).join("")
    : `<div class="hint">No settlements recorded yet.</div>`;
}

function renderExpenseRow(e) {
  const canEdit = state.isAdmin || e.createdBy === state.who;
  const catLabel = CATEGORIES.find((c) => c.id === e.category)?.label || e.category;
  const splitStr = MEMBERS.map((m) => `${m.name} ${fmt(e.splitAmounts?.[m.id] || 0)}`).join(" · ");
  return `<div class="list-row">
    <div class="list-main">
      <div class="list-title">${e.description} <span class="tag">${catLabel}</span></div>
      <div class="list-sub">${e.date} · paid by ${memberName(e.paidBy)} · ${fmt(e.amount)}</div>
      <div class="list-sub">${splitStr}</div>
      ${e.notes ? `<div class="list-sub notes">${e.notes}</div>` : ""}
    </div>
    <div class="list-actions">
      ${canEdit ? `<button class="icon-btn" onclick="deleteExpense('${e.id}')">🗑️</button>` : ""}
    </div>
  </div>`;
}

function renderSettlementRow(s) {
  const canEdit = state.isAdmin || s.createdBy === state.who;
  return `<div class="list-row">
    <div class="list-main">
      <div class="list-title">${memberName(s.from)} → ${memberName(s.to)}</div>
      <div class="list-sub">${s.date} · ${fmt(s.amount)}${s.note ? " · " + s.note : ""}</div>
    </div>
    <div class="list-actions">
      ${canEdit ? `<button class="icon-btn" onclick="deleteSettlement('${s.id}')">🗑️</button>` : ""}
    </div>
  </div>`;
}

function renderAdmin() {
  if (!state.isAdmin) return;

  const editor = document.getElementById("splitEditor");
  editor.innerHTML = Object.keys(SPLIT_TEMPLATES)
    .map((key) => {
      const percents = currentSplitPercents(key);
      return `<div class="split-editor-row" data-split="${key}">
        <div class="split-editor-label">${SPLIT_TEMPLATES[key].label}</div>
        ${MEMBERS.map(
          (m) => `<label class="split-input">${m.name}
            <input type="number" min="0" max="100" step="0.01" class="split-pct" data-split="${key}" data-member="${m.id}" value="${percents[m.id]}" />
          </label>`
        ).join("")}
        <button class="secondary" onclick="saveSplitOverride('${key}')">Save</button>
      </div>`;
    })
    .join("");

  const chequeEditor = document.getElementById("chequeEditor");
  chequeEditor.innerHTML = (state.config.cheques || [])
    .map(
      (c, idx) => `<div class="cheque-editor-row" data-idx="${idx}">
        <input type="text" class="cheque-label" value="${c.label}" placeholder="Label" />
        <input type="number" class="cheque-amount" value="${c.amount}" step="0.01" placeholder="Amount" />
        <input type="date" class="cheque-date" value="${c.dueDate || ""}" />
        <label class="cheque-paid"><input type="checkbox" class="cheque-paid-cb" ${c.paid ? "checked" : ""} /> paid</label>
        <button class="icon-btn" onclick="removeChequeRow(${idx})">🗑️</button>
      </div>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function deleteExpense(id) {
  if (!requireDb()) return;
  if (!confirm("Delete this expense?")) return;
  await db.collection("expenses").doc(id).delete();
  toast("Expense deleted");
}

async function deleteSettlement(id) {
  if (!requireDb()) return;
  if (!confirm("Delete this settlement?")) return;
  await db.collection("settlements").doc(id).delete();
  toast("Settlement deleted");
}

function addChequeRow() {
  state.config.cheques = state.config.cheques || [];
  state.config.cheques.push({ label: `Cheque ${state.config.cheques.length + 1}`, amount: 0, dueDate: "", paid: false });
  renderAdmin();
}

function removeChequeRow(idx) {
  state.config.cheques.splice(idx, 1);
  renderAdmin();
}

async function saveChequeSchedule() {
  if (!requireDb()) return;
  const rows = [...document.querySelectorAll(".cheque-editor-row")];
  const cheques = rows.map((row) => ({
    label: row.querySelector(".cheque-label").value.trim() || "Cheque",
    amount: Number(row.querySelector(".cheque-amount").value) || 0,
    dueDate: row.querySelector(".cheque-date").value || "",
    paid: row.querySelector(".cheque-paid-cb").checked,
  }));
  await db.collection("meta").doc("config").update({ cheques });
  toast("Cheque schedule saved");
}

async function saveSplitOverride(key) {
  if (!requireDb()) return;
  const inputs = [...document.querySelectorAll(`.split-pct[data-split="${key}"]`)];
  const percents = {};
  let sum = 0;
  for (const input of inputs) {
    const val = Number(input.value) || 0;
    percents[input.dataset.member] = val;
    sum += val;
  }
  if (Math.abs(sum - 100) > 0.5) {
    toast(`${SPLIT_TEMPLATES[key].label} split must add up to 100% (currently ${sum.toFixed(2)}%)`);
    return;
  }
  await db.collection("meta").doc("config").update({ [`splitOverrides.${key}`]: percents });
  toast("Split ratio saved");
}

// ---------------------------------------------------------------------------
// Admin PIN modal
// ---------------------------------------------------------------------------

function openPinModal() {
  return new Promise((resolve) => {
    state.pinResolve = resolve;
    document.getElementById("pinInput").value = "";
    document.getElementById("pinModal").hidden = false;
    document.getElementById("pinInput").focus();
  });
}

function closePinModal(result) {
  document.getElementById("pinModal").hidden = true;
  if (state.pinResolve) state.pinResolve(result);
  state.pinResolve = null;
}

async function handleAdminButton() {
  if (state.isAdmin) {
    state.isAdmin = false;
    sessionStorage.removeItem("casaSplitAdmin");
    document.getElementById("tab-admin").classList.remove("active");
    document.querySelector('.tab[data-tab="dashboard"]').click();
    renderAll();
    return;
  }
  const pin = await openPinModal();
  if (pin === null) return;
  const correctPin = state.config?.adminPin || DEFAULT_ADMIN_PIN;
  if (pin === correctPin) {
    state.isAdmin = true;
    sessionStorage.setItem("casaSplitAdmin", "1");
    toast("Admin mode unlocked");
    renderAll();
  } else {
    toast("Wrong PIN");
  }
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function setupWhoSelect() {
  document.getElementById("whoSelect").addEventListener("change", (e) => {
    state.who = e.target.value;
    localStorage.setItem("casaSplitWho", state.who);
    renderAll();
  });
}

function setupAdminButton() {
  document.getElementById("adminBtn").addEventListener("click", handleAdminButton);
  document.getElementById("pinCancel").addEventListener("click", () => closePinModal(null));
  document.getElementById("pinSubmit").addEventListener("click", () => closePinModal(document.getElementById("pinInput").value.trim()));
  document.getElementById("pinInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") closePinModal(document.getElementById("pinInput").value.trim());
  });
}

function setupExpenseForm() {
  document.getElementById("expCategory").addEventListener("change", updateSplitPreview);
  document.getElementById("customSplitToggle").addEventListener("change", () => {
    renderCustomSplitInputs();
    updateSplitPreview();
  });

  document.getElementById("expenseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireDb()) return;
    const description = document.getElementById("expDesc").value.trim();
    const categoryId = document.getElementById("expCategory").value;
    const amount = Number(document.getElementById("expAmount").value);
    const paidBy = document.getElementById("expPaidBy").value;
    const date = document.getElementById("expDate").value;
    const notes = document.getElementById("expNotes").value.trim();
    const category = CATEGORIES.find((c) => c.id === categoryId);

    let splitType = category.split;
    let percents = currentSplitPercents(category.split);

    if (document.getElementById("customSplitToggle").checked) {
      percents = {};
      let sum = 0;
      for (const input of document.querySelectorAll(".custom-pct")) {
        const val = Number(input.value) || 0;
        percents[input.dataset.member] = val;
        sum += val;
      }
      if (Math.abs(sum - 100) > 0.5) {
        toast(`Custom split must add up to 100% (currently ${sum.toFixed(2)}%)`);
        return;
      }
      splitType = "custom";
    }

    const amounts = splitAmounts(percents, amount);

    await db.collection("expenses").add({
      description,
      category: categoryId,
      amount,
      paidBy,
      date,
      splitType,
      splitPercents: percents,
      splitAmounts: amounts,
      notes,
      createdBy: state.who,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    toast("Expense saved");
    e.target.reset();
    renderAddFormStatics();
    document.getElementById("customSplitToggle").checked = false;
    renderCustomSplitInputs();
    document.querySelector('.tab[data-tab="dashboard"]').click();
  });
}

function setupSettleForm() {
  document.getElementById("settleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireDb()) return;
    const from = document.getElementById("settleFrom").value;
    const to = document.getElementById("settleTo").value;
    const amount = Number(document.getElementById("settleAmount").value);
    const date = document.getElementById("settleDate").value;
    const note = document.getElementById("settleNote").value.trim();

    if (from === to) {
      toast("From and To must be different people");
      return;
    }

    await db.collection("settlements").add({
      from,
      to,
      amount,
      date,
      note,
      createdBy: state.who,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    toast("Settlement recorded");
    e.target.reset();
    renderAddFormStatics();
    document.querySelector('.tab[data-tab="dashboard"]').click();
  });
}

function setupAdminTab() {
  document.getElementById("addChequeBtn").addEventListener("click", addChequeRow);
  document.getElementById("saveChequesBtn").addEventListener("click", saveChequeSchedule);
  document.getElementById("pinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireDb()) return;
    const newPin = document.getElementById("newPin").value.trim();
    if (!newPin) return;
    await db.collection("meta").doc("config").update({ adminPin: newPin });
    toast("Admin PIN updated");
    e.target.reset();
  });
}

async function main() {
  // Wire up the UI and populate static dropdowns first, so the app is at
  // least usable-looking even if the Firebase SDK or network fails below.
  setupTabs();
  setupWhoSelect();
  setupAdminButton();
  setupExpenseForm();
  setupSettleForm();
  setupAdminTab();
  renderAddFormStatics();
  renderCustomSplitInputs();
  renderTopbar();

  try {
    initFirebase();
    state.config = await ensureConfigDoc();
    await seedHistoricalDataIfNeeded();
    listenAll();
  } catch (err) {
    console.error(err);
    toast("Couldn't connect to the shared database. Check your internet connection and reload.");
  }
}

main();
