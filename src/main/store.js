const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const userDataPath = app.getPath('userData');
const configFilePath = path.join(userDataPath, 'config.json');
const defaultDataFilePath = path.join(userDataPath, 'data.json');

let currentDataFilePath = defaultDataFilePath;
let missingCustomFilePath = null;

function loadStorageConfig() {
  missingCustomFilePath = null;
  try {
    if (fs.existsSync(configFilePath)) {
      const config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
      const customPath = config.activeFilePath || config.dataPath;
      if (customPath) {
        if (fs.existsSync(customPath)) {
          currentDataFilePath = customPath;
          return;
        } else {
          missingCustomFilePath = customPath;
          setActiveDataFilePath(defaultDataFilePath);
        }
      }
    }
  } catch (error) {
    console.error("Erreur lors de la lecture de config.json :", error);
  }
  currentDataFilePath = defaultDataFilePath;
}

function getMissingFilePath() {
  const missing = missingCustomFilePath;
  missingCustomFilePath = null;
  return missing;
}

function validateTabulaFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { valid: false, error: 'not_found' };
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.accounts) && Array.isArray(data.categories) && Array.isArray(data.transactions)) {
      return { valid: true, data };
    }
    return { valid: false, error: 'invalid_format' };
  } catch (e) {
    return { valid: false, error: 'parse_error' };
  }
}

function setActiveDataFilePath(newFilePath) {
  try {
    const cleanPath = (newFilePath || '').trim();
    if (!cleanPath) return false;

    currentDataFilePath = cleanPath;
    fs.writeFileSync(configFilePath, JSON.stringify({ activeFilePath: currentDataFilePath }, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error("Erreur lors de l'enregistrement du chemin :", error);
    return false;
  }
}

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
      { id: 'cat_' + crypto.randomUUID(), name: 'Impôts et taxes' },
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
  return currentDataFilePath;
}

function writeData(data) {
  try {
    const targetDir = path.dirname(currentDataFilePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(currentDataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error("Erreur d'écriture :", error);
    return false;
  }
}

function readData() {
  try {
    if (!fs.existsSync(currentDataFilePath)) {
      const initial = createDefaultData();
      writeData(initial);
      return initial;
    }
    const raw = fs.readFileSync(currentDataFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error("Erreur de lecture :", error);
    const initial = createDefaultData();
    return initial;
  }
}

function init() {
  loadStorageConfig();
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
  getMissingFilePath,
  setActiveDataFilePath,
  validateTabulaFile,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  updateCategories,
  updateAccounts
};