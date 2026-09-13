// Members of the apartment. IDs must stay stable once expenses exist.
const MEMBERS = [
  { id: "sendil_priya", name: "Sendil & Priya", isAdmin: true },
  { id: "kirti", name: "Kirti", isAdmin: false },
  { id: "pam", name: "Pam", isAdmin: false },
];

// Reusable split templates (percentages must add up to 100).
const SPLIT_TEMPLATES = {
  rent: {
    label: "40 / 30 / 30 (rent-style)",
    percents: { sendil_priya: 40, kirti: 30, pam: 30 },
  },
  utility: {
    label: "50 / 25 / 25 (utility-style)",
    percents: { sendil_priya: 50, kirti: 25, pam: 25 },
  },
  equal: {
    label: "Equal thirds",
    percents: { sendil_priya: 33.34, kirti: 33.33, pam: 33.33 },
  },
};

// Expense categories and which split template they default to.
const CATEGORIES = [
  { id: "rent", label: "🏠 Rent", split: "rent" },
  { id: "security_deposit", label: "🔒 Security Deposit", split: "utility" },
  { id: "dewa_bill", label: "💡 DEWA Bill (electricity & water)", split: "utility" },
  { id: "dewa_deposit", label: "💧 DEWA Deposit", split: "utility" },
  { id: "house_help", label: "🧹 House Help Salary", split: "utility" },
  { id: "furniture", label: "🛋️ Furniture / Movers / Curtains", split: "equal" },
  { id: "other", label: "📦 Other", split: "equal" },
];

const CURRENCY = "AED";
const DEFAULT_ADMIN_PIN = "1234";
