'use strict';
/**
 * Firestore Seed Script
 *
 * Prerequisites:
 *   1. Firebase project created at console.firebase.google.com
 *   2. .env.local filled with Firebase config values
 *   3. Run transform script first: node pipeline/transform_toxins.js
 *
 * Usage: node pipeline/seed_firestore.js
 */

const path = require('path');

// Load .env.local
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const INPUT_FILE = path.join(__dirname, 'output', 'toxins_transformed.json');
const COLLECTION = 'toxins';

// Validate Firebase config is present
const REQUIRED_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

// Values that indicate the .env.local has not been filled in yet
const PLACEHOLDER_PREFIXES = ['your_', 'YOUR_', '<', 'REPLACE'];

function isPlaceholder(val) {
  if (!val) return true;
  return PLACEHOLDER_PREFIXES.some(p => val.startsWith(p));
}

const missing = REQUIRED_ENV.filter(key => isPlaceholder(process.env[key]));
if (missing.length > 0) {
  console.error('❌ Missing or unconfigured Firebase values in .env.local:');
  missing.forEach(k => console.error('   ' + k + '=' + (process.env[k] || '(not set)')));
  console.error('\nCreate a Firebase project at https://console.firebase.google.com');
  console.error('Then fill in .env.local with your real project values.');
  process.exit(1);
}

// Check input file exists
const fs = require('fs');
if (!fs.existsSync(INPUT_FILE)) {
  console.error('❌ Input file not found: ' + INPUT_FILE);
  console.error('Run first: node pipeline/transform_toxins.js');
  process.exit(1);
}

const toxins = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
console.log('📦 Loaded ' + toxins.length + ' entries from ' + INPUT_FILE);

const { initializeApp } = require('firebase/app');
const { getFirestore, doc, writeBatch } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore writeBatch limit is 500 ops per batch
const BATCH_SIZE = 400;

async function seedInBatches(items) {
  let total = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const item of chunk) {
      // Remove undefined values (Firestore does not accept undefined)
      const clean = JSON.parse(JSON.stringify(item));
      batch.set(doc(db, COLLECTION, clean.id), clean);
    }
    await batch.commit();
    total += chunk.length;
    console.log('  ✓ Committed ' + total + '/' + items.length);
  }
}

async function main() {
  console.log('🌱 Seeding ' + toxins.length + ' entries to Firestore collection "' + COLLECTION + '"...');
  await seedInBatches(toxins);
  console.log('✅ Done! ' + toxins.length + ' toxins written to Firestore.');
  process.exit(0);
}

main().catch(function(e) {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
