'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PLANTS_DIR = path.join(PROJECT_ROOT, 'data', 'plants_processed');
const FOODS_DIR = path.join(PROJECT_ROOT, 'data', 'foods_processed');
const OUTPUT_FILE = path.join(__dirname, 'output', 'toxins_transformed.json');
const PLACEHOLDER_PATTERNS = [
  /^\s*not specified\b/i,
  /^\s*not explicitly specified\b/i,
  /^\s*not provided\b/i,
  /^\s*not available\b/i,
];

function deriveSeverity(symptoms) {
  if (!symptoms || symptoms.length === 0) return 'medium';
  const sevs = symptoms.map(s => (s.severity || '').toLowerCase());
  if (sevs.includes('fatal')) return 'critical';
  if (sevs.includes('severe')) return 'high';
  if (sevs.includes('moderate')) return 'medium';
  return 'low';
}

function cleanText(text, maxLen) {
  if (!text) return '';
  const cleaned = text
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen || 500);

  if (!cleaned) return '';
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(cleaned))) return '';

  return cleaned;
}

function transformFile(filePath, category) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const filename = path.basename(filePath, '.json');

  const name = (raw.plant && raw.plant.common_name) || filename.replace(/_/g, ' ');
  const scientific = (raw.plant && raw.plant.scientific_name) || '';
  const family = (raw.plant && raw.plant.family) || (raw.basics && raw.basics.family) || '';
  const rawDesc = (raw.plant && raw.plant.description) || (raw.basics && raw.basics.description) || '';
  const description = cleanText(rawDesc, 500);

  const symptoms = (raw.symptoms || [])
    .map(s => ({
      name: cleanText(s.name, 200),
      body_system: cleanText(s.body_system, 100) || 'Other',
      severity: s.severity || 'moderate',
      onset: s.onset ? cleanText(s.onset, 150) : undefined,
      notes: s.notes ? cleanText(s.notes, 300) : undefined,
    }))
    .filter(s => s.name);

  const chemicals = (raw.toxins || [])
    .map(t => ({
      name: cleanText(t.name, 200),
      chemical_formula: t.chemical_formula || null,
      description: t.description ? cleanText(t.description, 400) : null,
      concentration_notes: t.concentration_notes ? cleanText(t.concentration_notes, 400) : null,
    }))
    .filter(t => t.name);

  const treatments = (raw.treatments || [])
    .map(t => ({
      name: cleanText(t.name, 200),
      description: t.description ? cleanText(t.description, 400) : null,
      notes: t.notes ? cleanText(t.notes, 300) : null,
      priority: typeof t.priority === 'number' ? t.priority : 99,
    }))
    .filter(t => t.name);

  // Derive emergencyNote from first treatment
  const sortedTreatments = [...treatments].sort((a, b) => a.priority - b.priority);
  const emergencyNote = sortedTreatments.length > 0 ? sortedTreatments[0].name : undefined;

  const result = {
    id: filename,
    name,
    aliases: [],
    category,
    toxicParts: raw.toxic_parts || [],
    symptoms,
    chemicals,
    treatments,
    severity: deriveSeverity(symptoms),
    description,
    emergencyNote: emergencyNote || undefined,
  };

  if (scientific) result.scientific_name = scientific;
  if (family) result.family = family;

  return result;
}

function main() {
  const results = [];
  let errors = 0;

  const plantFiles = fs.readdirSync(PLANTS_DIR).filter(f => f.endsWith('.json'));
  for (const file of plantFiles) {
    try {
      results.push(transformFile(path.join(PLANTS_DIR, file), 'plant'));
    } catch (e) {
      console.error('Error processing plant ' + file + ':', e.message);
      errors++;
    }
  }

  const foodFiles = fs.readdirSync(FOODS_DIR).filter(f => f.endsWith('.json'));
  for (const file of foodFiles) {
    try {
      results.push(transformFile(path.join(FOODS_DIR, file), 'food'));
    } catch (e) {
      console.error('Error processing food ' + file + ':', e.message);
      errors++;
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  console.log('Transformed ' + results.length + ' entries -> ' + OUTPUT_FILE);
  if (errors > 0) console.log('Errors: ' + errors);

  // Summary
  const bySeverity = results.reduce(function(acc, r) {
    acc[r.severity] = (acc[r.severity] || 0) + 1;
    return acc;
  }, {});
  const byCategory = results.reduce(function(acc, r) {
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {});
  console.log('Severity breakdown:', JSON.stringify(bySeverity));
  console.log('Category breakdown:', JSON.stringify(byCategory));
}

main();
