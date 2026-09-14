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
    label: "50 / 25 / 25 (everything except rent)",
    percents: { sendil_priya: 50, kirti: 25, pam: 25 },
  },
};

// Expense categories and which split template they default to.
// Rent is the only category on the 40/30/30 split; everything else
// (deposits, bills, house help, furniture, misc) uses 50/25/25.
const CATEGORIES = [
  { id: "rent", label: "🏠 Rent", split: "rent" },
  { id: "security_deposit", label: "🔒 Security Deposit", split: "utility" },
  { id: "dewa_bill", label: "💡 DEWA Bill (electricity & water)", split: "utility" },
  { id: "dewa_deposit", label: "💧 DEWA Deposit", split: "utility" },
  { id: "house_help", label: "🧹 House Help Salary", split: "utility" },
  { id: "furniture", label: "🛋️ Furniture / Movers / Curtains", split: "utility" },
  { id: "other", label: "📦 Other", split: "utility" },
];

const CURRENCY = "AED";
const DEFAULT_ADMIN_PIN = "1234";
