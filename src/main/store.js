const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'data.json');

function createDefaultData() {
  return {
    accounts: [
      { id: 'acc_' + crypto.randomUUID(), name: 'Courant', initial_balance_cents: 0 },
      { id: 'acc_' + crypto.randomUUID(), name: 'Livret A', initial_balance_cents: 0 },
      { id: 'acc_' + crypto.randomUUID(), name: 'Espèces', initial_balance_cents: 0 }
    ],
    categories: [
      { id: 'cat_' + crypto.randomUUID(), name: 'Alimentation' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Logement' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Transports' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Santé' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Loisirs' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Équipement' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Habillement' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Frais bancaires' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Investissements' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Revenus de placements' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Salaire' },
      { id: 'cat_' + crypto.randomUUID(), name: 'Divers' }
    ],
    transactions: []
  };
}

function resetToDefault() {
  const freshData = createDefaultData();
  writeData(freshData);
  return freshData;
}

function getDataFilePath() {
  return dataFilePath;
}

function writeData(data) {
  try {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error("Erreur d'écriture :", error);
    return false;
  }
}

function readData() {
  try {
    if (!fs.existsSync(dataFilePath)) {
      const initial = createDefaultData();
      writeData(initial);
      return initial;
    }
    const raw = fs.readFileSync(dataFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error("Erreur de lecture :", error);
    const initial = createDefaultData();
    return initial;
  }
}

function init() {
  return readData();
}

function addTransaction(transaction) {
  const data = readData();
  const newTransaction = {
    id: 'tx_' + crypto.randomUUID(),
    date: transaction.date,
    type: transaction.type,
    payee: (transaction.payee || '').trim(),
    note: (transaction.note || '').trim(),
    account_id: transaction.account_id,
    to_account_id: transaction.type === 'transfer' ? transaction.to_account_id : null,
    category_id: transaction.type === 'transfer' ? null : transaction.category_id,
    amount_cents: Math.abs(Math.round(transaction.amount_cents))
  };

  data.transactions.unshift(newTransaction);
  writeData(data);
  return newTransaction;
}

function updateTransaction(updatedTx) {
  const data = readData();
  const index = data.transactions.findIndex(t => t.id === updatedTx.id);
  if (index !== -1) {
    data.transactions[index] = {
      ...data.transactions[index],
      date: updatedTx.date,
      type: updatedTx.type,
      payee: (updatedTx.payee || '').trim(),
      note: (updatedTx.note || '').trim(),
      account_id: updatedTx.account_id,
      to_account_id: updatedTx.type === 'transfer' ? updatedTx.to_account_id : null,
      category_id: updatedTx.type === 'transfer' ? null : updatedTx.category_id,
      amount_cents: Math.abs(Math.round(updatedTx.amount_cents))
    };
    writeData(data);
    return data.transactions[index];
  }
  return null;
}

function deleteTransaction(id) {
  const data = readData();
  data.transactions = data.transactions.filter(t => t.id !== id);
  writeData(data);
  return true;
}

function updateCategories(newCategories) {
  const data = readData();
  const validCategoryIds = new Set(newCategories.map(c => c.id));

  data.categories = newCategories;

  data.transactions = data.transactions.filter(t => {
    if (t.type === 'transfer') return true;
    return validCategoryIds.has(t.category_id);
  });

  writeData(data);
  return data.categories;
}

function updateAccounts(newAccounts) {
  const data = readData();
  const validAccountIds = new Set(newAccounts.map(a => a.id));
  
  data.accounts = newAccounts.map(acc => ({
    ...acc,
    initial_balance_cents: Math.round(acc.initial_balance_cents || 0)
  }));

  data.transactions = data.transactions.filter(t => {
    const sourceValid = validAccountIds.has(t.account_id);
    const destValid = t.type === 'transfer' ? validAccountIds.has(t.to_account_id) : true;
    return sourceValid && destValid;
  });

  writeData(data);
  return data.accounts;
}

module.exports = {
  init,
  readData,
  writeData,
  resetToDefault,
  getDataFilePath,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  updateCategories,
  updateAccounts,
  resetToDefault,
};