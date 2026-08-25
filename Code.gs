/**
 * PERSONAL FINANCE TRACKER — Apps Script
 * ---------------------------------------------------------
 * This single file covers everything the template needs out of the box:
 * spreadsheet menu, and the optional Plaid bank-sync backend.
 *
 * The sheet's formulas (Net Amount, Month, Group, Dashboard, budgets,
 * Needs/Wants/Savings split) are already built into the workbook itself —
 * nothing here needs to run for those to work. This script is only
 * required if you want the optional "Bank Sync" (Plaid) feature.
 *
 * NOTE ON BANK SYNC: the "Link a new account" menu item opens an HTML
 * dialog (a file named `Link.html` in this Apps Script project) that
 * hosts Plaid's Link widget. That HTML file is NOT included in this
 * repository — see README.md's "Optional: Bank Sync" section for what
 * it needs to contain and how to add it. Everything else here (balance
 * refresh, transaction sync, credentials) works standalone.
 *
 * Menu:
 *   1. Set Plaid credentials
 *   2. Link a new account   (requires Link.html — see README)
 *   3. Sync now
 *   4. Set up daily auto-sync
 */

const SHEET_TRANSACTIONS = 'Transactions';
const SHEET_ACCOUNTS = 'Accounts';
const PLAID_ENV = 'production'; // Plaid's free Trial plan and paid plans both use the production host

// ---------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Bank Sync')
    .addItem('1. Set Plaid credentials', 'setPlaidCredentials')
    .addItem('2. Link a new account', 'showLinkDialog')
    .addItem('3. Sync now', 'syncAllAccounts')
    .addItem('4. Set up daily auto-sync', 'installDailyTrigger')
    .addToUi();
}

function setPlaidCredentials() {
  const ui = SpreadsheetApp.getUi();
  const clientIdResp = ui.prompt('Plaid Client ID', 'From dashboard.plaid.com/team/keys:', ui.ButtonSet.OK_CANCEL);
  if (clientIdResp.getSelectedButton() !== ui.Button.OK) return;
  const secretResp = ui.prompt('Plaid Secret', 'Use your production/trial secret (NOT the sandbox secret):', ui.ButtonSet.OK_CANCEL);
  if (secretResp.getSelectedButton() !== ui.Button.OK) return;

  const props = PropertiesService.getScriptProperties();
  props.setProperty('PLAID_CLIENT_ID', clientIdResp.getResponseText().trim());
  props.setProperty('PLAID_SECRET', secretResp.getResponseText().trim());
  ui.alert('Saved. Credentials live in this script\'s Script Properties, not in the sheet itself.');
}

function showLinkDialog() {
  if (!PropertiesService.getScriptProperties().getProperty('PLAID_CLIENT_ID')) {
    SpreadsheetApp.getUi().alert('Set your Plaid credentials first: Bank Sync > Set Plaid credentials.');
    return;
  }
  try {
    const html = HtmlService.createHtmlOutputFromFile('Link').setWidth(500).setHeight(700);
    SpreadsheetApp.getUi().showModalDialog(html, 'Link a bank account');
  } catch (e) {
    SpreadsheetApp.getUi().alert(
      'Missing Link.html. This file is not included in the template repo — see README.md ' +
      '"Optional: Bank Sync" for what to add. (' + e.message + ')'
    );
  }
}

function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncAllAccounts') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAllAccounts').timeBased().everyDays(1).atHour(6).create();
  SpreadsheetApp.getUi().alert('Daily sync scheduled for ~6am. You can still run "Sync now" any time.');
}

// ---------------------------------------------------------------------
// Plaid HTTP helper
// ---------------------------------------------------------------------
function plaidPost(endpoint, extraPayload) {
  const props = PropertiesService.getScriptProperties();
  const payload = Object.assign({
    client_id: props.getProperty('PLAID_CLIENT_ID'),
    secret: props.getProperty('PLAID_SECRET')
  }, extraPayload);

  const resp = UrlFetchApp.fetch('https://' + PLAID_ENV + '.plaid.com' + endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const data = JSON.parse(resp.getContentText());
  if (data.error_code) {
    throw new Error(endpoint + ' failed [' + data.error_code + ']: ' + data.error_message);
  }
  return data;
}

// ---------------------------------------------------------------------
// Called from Link.html (see README for the file you need to add)
// ---------------------------------------------------------------------
function createLinkToken() {
  const data = plaidPost('/link/token/create', {
    user: { client_user_id: Session.getTemporaryActiveUserKey() },
    client_name: 'Personal Finance Tracker',
    products: ['transactions'],
    country_codes: ['US'],
    language: 'en'
  });
  return data.link_token;
}

function exchangePublicToken(publicToken, nickname) {
  const exch = plaidPost('/item/public_token/exchange', { public_token: publicToken });
  const accessToken = exch.access_token;
  const itemId = exch.item_id;

  const acctData = plaidPost('/accounts/get', { access_token: accessToken });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ACCOUNTS);

  const accountIdMap = {};
  acctData.accounts.forEach(function (acct) {
    const label = nickname + ' ' + acct.name;
    findOrCreateAccountRow(sheet, label, acct, nickname);
    accountIdMap[acct.account_id] = label;
  });

  const items = getStoredItems();
  items.push({ item_id: itemId, access_token: accessToken, nickname: nickname, cursor: null, accountIdMap: accountIdMap });
  saveStoredItems(items);

  return 'Linked ' + acctData.accounts.length + ' account(s). Close this window, then run Bank Sync > Sync now.';
}

function getStoredItems() {
  const raw = PropertiesService.getScriptProperties().getProperty('PLAID_ITEMS');
  return raw ? JSON.parse(raw) : [];
}
function saveStoredItems(items) {
  PropertiesService.getScriptProperties().setProperty('PLAID_ITEMS', JSON.stringify(items));
}

function findOrCreateAccountRow(sheet, label, plaidAccount, nickname) {
  const colA = sheet.getRange('A5:A45').getValues();
  for (let i = 0; i < colA.length; i++) {
    if (colA[i][0] === label) return i + 5;
  }
  for (let i = 0; i < colA.length; i++) {
    if (!colA[i][0]) {
      const row = i + 5;
      const isLiability = plaidAccount.type === 'credit' || plaidAccount.type === 'loan';
      sheet.getRange(row, 1).setValue(label);
      sheet.getRange(row, 2).setValue(mapPlaidType(plaidAccount.type));
      sheet.getRange(row, 3).setValue(nickname);
      sheet.getRange(row, 4).setValue(isLiability ? 'Liability' : 'Asset');
      sheet.getRange(row, 5).setValue(Math.abs((plaidAccount.balances && plaidAccount.balances.current) || 0));
      sheet.getRange(row, 6).setValue('Y');
      sheet.getRange(row, 7).setValue(new Date());
      return row;
    }
  }
  throw new Error('Accounts sheet is full (row 45 reached). Add more rows above the Net Worth Summary block and extend the ranges in this script.');
}

function mapPlaidType(t) {
  return { depository: 'Checking', credit: 'Credit Card', investment: 'Investment', loan: 'Loan' }[t] || 'Other';
}

// ---------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------
function syncAllAccounts() {
  const items = getStoredItems();
  if (items.length === 0) {
    SpreadsheetApp.getUi().alert('No accounts linked yet. Use Bank Sync > Link a new account first.');
    return;
  }
  const errors = [];
  items.forEach(function (item) {
    try {
      refreshBalances(item);
      appendNewTransactions(item);
    } catch (e) {
      errors.push(item.nickname + ': ' + e.message);
    }
  });
  saveStoredItems(items);

  if (errors.length) {
    SpreadsheetApp.getUi().alert(
      'Synced with some issues:\n' + errors.join('\n') +
      '\n\nIf an account shows ITEM_LOGIN_REQUIRED, its bank connection expired — re-link it via Bank Sync > Link a new account.'
    );
  } else {
    SpreadsheetApp.getUi().alert('Sync complete.');
  }
}

function refreshBalances(item) {
  const data = plaidPost('/accounts/balance/get', { access_token: item.access_token });
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ACCOUNTS);
  const colA = sheet.getRange('A5:A45').getValues();

  data.accounts.forEach(function (acct) {
    const label = item.accountIdMap[acct.account_id];
    if (!label) return;
    const bal = Math.abs(acct.balances.current || 0);
    for (let i = 0; i < colA.length; i++) {
      if (colA[i][0] === label) {
        sheet.getRange(i + 5, 5).setValue(bal);
        sheet.getRange(i + 5, 7).setValue(new Date());
        break;
      }
    }
  });
}

function appendNewTransactions(item) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSACTIONS);
  let cursor = item.cursor;
  let hasMore = true;
  const added = [];

  while (hasMore) {
    const payload = { access_token: item.access_token };
    if (cursor) payload.cursor = cursor;
    const data = plaidPost('/transactions/sync', payload);
    added.push.apply(added, data.added);
    cursor = data.next_cursor;
    hasMore = data.has_more;
  }
  item.cursor = cursor;
  if (added.length === 0) return;

  let row = findFirstEmptyTransactionRow(sheet);
  added.forEach(function (tx) {
    const label = item.accountIdMap[tx.account_id] || item.nickname;
    sheet.getRange(row, 2).setValue(tx.date);                          // Date
    sheet.getRange(row, 3).setValue(label);                            // Account
    sheet.getRange(row, 4).setValue(tx.merchant_name || tx.name);      // Merchant
    // Column 5 (Category) intentionally left blank — tag it yourself
    sheet.getRange(row, 6).setValue(-tx.amount);                       // Amount (Plaid: +=money out, we store expenses negative)
    sheet.getRange(row, 7).setValue('Normal');                         // Status
    sheet.getRange(row, 8).setValue(0);                                // Reimbursable Amount
    sheet.getRange(row, 11).setValue('plaid:' + tx.transaction_id);    // Notes (dedupe reference)
    // Columns 9 (Net Amount), 12 (Month), 13 (Group) are pre-filled formulas — left untouched
    row++;
  });
}

function findFirstEmptyTransactionRow(sheet) {
  const colB = sheet.getRange('B5:B500').getValues();
  for (let i = 0; i < colB.length; i++) {
    if (!colB[i][0]) return i + 5;
  }
  throw new Error('Transactions sheet is full (row 500 reached). Add more template rows.');
}
