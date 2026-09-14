# Casa Split 🏠

A tiny shared expense ledger for **Sendil & Priya, Kirti, and Pam** to split
apartment costs (rent, deposits, DEWA bills, house help, furniture, etc.) —
no app install, no login. You open a link (pinned in your WhatsApp group),
pick your name, and log an expense. Everyone sees live, shared balances.

## How it works

- **Frontend:** plain HTML/CSS/JS, hosted free on GitHub Pages.
- **Data:** Firebase Firestore (free tier), shared by all three of you in
  real time — no backend server to run or pay for.
- **Identity:** no passwords. You pick your name from a dropdown (remembered
  on your phone). Trust-based, since this is 3 people who know each other.
- **Admin:** a PIN (set below, changeable in-app) unlocks the ability to
  edit split ratios, manage the rent cheque schedule, and delete/edit
  *anyone's* entries. Without the PIN, everyone can still add expenses and
  edit/delete their own entries.

## The numbers baked in

| Item | Amount (AED) | Split | Status |
|---|---|---|---|
| Rent | 113,000 (4 cheques of 28,250) | 40% Sendil & Priya / 30% Kirti / 30% Pam | Cheque 1 already paid |
| Security Deposit | 7,000 | 50% Sendil & Priya / 25% Kirti / 25% Pam | Already paid |
| DEWA Deposit | 2,000 | 50% / 25% / 25% | Already paid |
| DEWA monthly bills | varies | 50% / 25% / 25% | Log each bill as it comes |
| House help salary | 550/month | 50% / 25% / 25% | Log each month |
| Furniture / movers / curtains / other | varies | 50% / 25% / 25% | Log each purchase |

These are just **defaults** — every category's split ratio can be changed
in the Admin tab, and any single expense can use a custom split instead.

The three already-paid items (cheque 1, security deposit, DEWA deposit) are
seeded into the ledger automatically the first time the app runs, along with
matching "settlement" records showing Kirti and Pam already reimbursed
Sendil & Priya for their shares — so the dashboard starts at **AED 0 owed**
for those, while still showing them in history for transparency.

## One-time setup (about 10 minutes, free, no credit card)

### 1. Create a free Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project**, give it any name (e.g. `casa-split`), skip Google Analytics.
3. Once created, click the **web icon (`</>`)** to register a web app. Name it anything.
4. Firebase will show you a `firebaseConfig` object. Copy those values into
   **`firebase-config.js`** in this repo, replacing the `PASTE_...` placeholders.
5. In the left sidebar go to **Build → Firestore Database → Create database**.
   Choose **Start in test mode** (or production mode — either way, paste the
   rules from `firestore.rules` in this repo into Firestore's **Rules** tab
   and click **Publish**).

### 2. Turn on GitHub Pages (free hosting)

1. Merge this branch into `main` (or ask Claude to open a PR for you).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` (or re-run the "Deploy Casa Split to GitHub Pages" workflow
   under the **Actions** tab). Your app will be live at
   `https://<your-github-username>.github.io/<repo-name>/`.

### 3. Share it

Pin that URL in your WhatsApp group. Anyone can tap it, pick their name, and
start logging expenses — it opens straight in the phone browser, nothing to
install.

### 4. Set your admin PIN

The default admin PIN is **`1234`**. The first time you (Sendil) open the
app, tap **🔐 Admin**, enter `1234`, then go to the **Admin** tab and set a
real PIN under "Change admin PIN". Only share the real PIN with whoever
should have admin rights.

## Using the app

- **Dashboard** — live balances ("is owed" / "owes"), a simplified
  "who owes whom" suggestion, the rent cheque schedule, and category totals.
- **Add Expense** — anyone logs an expense: description, category (auto-fills
  the right split), amount, who paid, date. Tick "Custom split" to override
  the percentages for that one expense.
- **History** — every expense and settlement, with edit (✏️) and delete (🗑️)
  buttons (your own entries always; anyone's entries once Admin is unlocked).
  Editing reopens the Add Expense / Settle Up form pre-filled — change
  anything and save to update it in place.
- **Settle Up** — record a direct payment between two people (e.g. Kirti
  Venmos/bank-transfers Sendil to clear a balance) without creating a new
  shared expense.
- **Forecast** — projects each person's remaining spend: unpaid rent cheques
  (split 40/30/30) plus recurring monthly items — house help and a DEWA
  estimate (both split 50/25/25) — through the last cheque's due date (or the
  next 12 months if no due dates are set).
- **Admin** (PIN-gated) — edit the default split ratios per category, manage
  the rent cheque schedule (label, amount, due date, paid checkbox), set the
  recurring monthly items used by the Forecast tab, and change the admin PIN.

## Security note

There's no login system by design — anyone with the link can read and write
the data (that's what the permissive `firestore.rules` allow). This is a
reasonable trade-off for 3 flatmates splitting known small amounts, but it's
not bank-grade security: don't share the link outside your group, and treat
the admin PIN as a light deterrent against accidental edits, not a real
security boundary.

## Local development

No build step — just open `index.html` in a browser, or serve the folder
with any static file server, e.g.:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.
