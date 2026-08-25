# Personal Finance Tracker (Google Sheets template)

A minimal, spreadsheet-native personal finance tracker: transactions, net
worth, category budgets, a Needs/Wants/Savings split, and shared-expense
(reimbursement) tracking — with an optional Plaid bank-sync backend.

## What's in this repo

```
Personal_Finance_Tracker_Template.xlsx   # the workbook — import this into Google Sheets
AppsScript/Code.gs                       # optional: Plaid bank-sync backend
README.md                                # this file
```

All the example data (accounts, transactions, dollar amounts) is
**illustrative** — generic placeholders, not real financial data. Replace it
with your own after importing.

## Quick start

1. In Google Sheets: **File → Import → Upload**, choose
   `Personal_Finance_Tracker_Template.xlsx`, and select **"Replace
   spreadsheet."**
2. Go to the **Dashboard** tab. Change the `Month to analyze` cell if it
   doesn't already match today — the example transactions are dated
   `2026-01`, so Income/Spending will read $0 until you either update the
   month selector or add your own current-dated transactions. (Net Worth
   and "Owed to Me" aren't month-scoped, so those will already show real
   numbers from the example data.)
3. Start logging: fill in **Accounts** with your real accounts, adjust
   **Categories** and budgets to match your life, and add transactions
   either by hand or by pasting a bank CSV export into **Transactions**.

That's the whole tracker — steps 4+ below (bank sync) are optional.

## Sheet structure

### Accounts
One row per account. `Current Balance` is what feeds Net Worth — edit it
by hand, or let the optional Plaid sync keep it current. Mark
`Include in Net Worth = N` for anything you want tracked but excluded
(e.g. a joint account that isn't really yours).

### Categories
Each category has a `Group`: `Needs`, `Wants`, `Savings`, `Income`, or
`Transfer`. The group drives every summary on the Dashboard — get this
right and everything downstream (budgets, the Needs/Wants/Savings split,
Income/Spending totals) follows automatically.

**Rows 5–15 are reserved for Needs/Wants categories** — the Dashboard's
per-category budget table reads that exact range. If you add a new
Needs/Wants category, insert it *within* rows 5–15 (i.e. above `Salary`),
then add a matching row to the Dashboard's category table (copy the row
above it and update the two `Categories!` cell references). Categories
outside that range (Income, Savings, Transfer groups) can be added freely
at the bottom — nothing else depends on their exact row.

### Transactions
The ledger. Key columns:
- **Amount** — expenses negative, income positive.
- **Reimbursable Amount** — when you front money for a group, put what
  *others* owe you here (positive number). `Net Amount` (auto-calculated)
  subtracts this from Amount, so budgets and totals reflect only your true
  share — not the full amount you floated.
- **Status**, **Linked Txn ID** — both optional/informational only.
  Reimbursements are tracked as a running net total (see below), not by
  matching individual transactions.
- **Month**, **Group** — auto-filled formulas (don't edit).

### Net Worth History
Row 5 is a live snapshot of your current Accounts balances. To track net
worth over time, copy row 5's *values* (Edit → Paste special → Values
only) into a new row below whenever you want a historical point.

### Dashboard
Net Worth, this month's Income/Spending, "Owed to Me," a per-category
budget table, three charts, and the Needs/Wants/Savings split.

## Core workflows

### Shared expenses / reimbursements
No linking required — this is a running net total, not a per-transaction
match:
1. When you pay for a group, log the **full amount** you paid as a
   negative `Amount`, and put what others owe you in `Reimbursable
   Amount`. `Net Amount` (your true share) is calculated automatically and
   is what counts toward your budget.
2. When someone pays you back — in any account, linked or not — just log
   it as its own transaction: `Category = Reimbursement`, positive
   `Amount`. That's it.
3. The Dashboard's **"Owed to Me"** tile is:
   `(everything you've ever floated) − (everything paid back)`,
   all-time. It updates automatically; no linking, no per-transaction
   status tracking needed.

### Internal transfers between your own accounts
Moving money between accounts you own isn't income or spending — it needs
to net to zero:
- **Plain transfers** (e.g. paying a credit card from checking, moving
  checking → checking): tag **both legs** `Internal Transfer`. Fully
  excluded from every total.
- **Moving money into savings/investing** is the one exception — that IS
  meaningful behavior worth tracking. Tag the *outgoing* leg (money
  leaving checking) with a `Savings`-group category (e.g. `Investing` or
  `Savings Contribution` in the template). Tag the incoming leg (money
  landing in the savings/investment account) `Internal Transfer` as usual,
  so it isn't double-counted. The outgoing leg is what shows up in your
  Savings % on the Dashboard.

### Needs / Wants / Savings split
`Planned Monthly Income` is its own directly-editable cell (defaults to
the sum of your Income-group category budgets, but you can type over it
any time — a bonus month, a pay cut, freelance income, whatever doesn't
belong in the `Salary` category's budget). Set your target percentages
(`Planned %`, defaults to 50/30/20) and `Planned $` is calculated from
that income figure automatically. `Actual %`, by contrast, is measured
against this month's *real* income (the Dashboard's Income This Month
figure) — so it'll naturally drift from plan if actual income varies
from what you planned. That's intentional: Planned $ answers "what did I
mean to do," Actual % answers "what actually happened."

## Optional: Bank Sync (Plaid)

`AppsScript/Code.gs` in this repo is the backend for automatically syncing
real transactions and balances via [Plaid](https://plaid.com). It's fully
optional — the sheet works completely standalone with manual entry or CSV
paste.

**One piece is intentionally not included here: `Link.html`.** It's a
small HTML dialog (hosted inside Apps Script) that runs Plaid's Link
widget so you can log into your bank. If you want bank sync:

1. Create a free Plaid account at
   [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup)
   (choose "Personal use"), and grab your Client ID + Secret from
   **Team Settings → Keys**. As of April 2026, Plaid's free Trial plan
   supports real production bank data for personal use, up to 10 linked
   accounts, at no cost.
2. In your Sheet, go to **Extensions → Apps Script**, paste in
   `Code.gs` from this repo.
3. Add a second file (**+ → HTML**, name it exactly `Link`) containing a
   page that: calls `google.script.run.createLinkToken()`, passes the
   returned token to Plaid's `Plaid.create({...}).open()` widget
   (loaded from `https://cdn.plaid.com/link/v2/stable/link-initialize.js`),
   and on `onSuccess` calls
   `google.script.run.exchangePublicToken(public_token, nickname)`.
4. Reload the Sheet — a **Bank Sync** menu appears. Run
   `1. Set Plaid credentials`, then `2. Link a new account` per bank,
   then `3. Sync now` (or `4. Set up daily auto-sync`).

Synced transactions land with `Category` left blank on purpose — tagging
categories daily is part of the intended workflow, not an oversight.

**Known limitations:** US/Canada banks only; Plaid's free Trial caps at 10
linked accounts; bank connections occasionally expire and need re-linking
(the sync will tell you which account, via an `ITEM_LOGIN_REQUIRED`
error); Plaid credentials live in Apps Script's Script Properties, which
is not visible to anyone you merely share the spreadsheet with, but *is*
visible to anyone given edit access to the Apps Script project itself —
don't share script-editor access with anyone you wouldn't trust with your
bank login.

## Editing safely

- **Safe anytime:** yellow-highlighted cells, dropdown selections, new
  rows in Categories/Accounts, Notes/Merchant text, empty template rows.
- **Edit with care:** formula cells (Net Amount, Month, Group, all
  Dashboard figures/charts) — overwriting one manually breaks it until
  you re-copy the formula from a neighboring row.
- **Don't:** insert/delete columns in Transactions or Accounts (Code.gs
  writes to fixed column numbers), delete header rows, or rename the five
  sheet tabs (the script looks them up by exact name).

## License

Not included — add whatever license fits your use (MIT is a common
default for templates like this).
