'use strict';

/**
 * Audit site-visible toxin ids against Firestore toxin documents and draft a
 * canonical registry. This script is read-only against Firestore.
 *
 * Outputs:
 *   data/audits/toxin_id_audit.json
 *   data/audits/toxin_id_audit.md
 *   data/toxin_registry.draft.json
 */

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');
const defaultSiteRoot = path.join(workspaceRoot, 'mewguard_site');
const dataRoot = path.join(repoRoot, 'data');
const siteDataDir = path.join(dataRoot, 'site', 'en');
const foodProcessedDir = path.join(dataRoot, 'foods_processed');
const foodListPath = path.join(dataRoot, 'food_list.json');
const adminRoot = path.join(repoRoot, 'admin');

const DEFAULT_AUDIT_DIR = path.join(dataRoot, 'audits');
const DEFAULT_REGISTRY_OUT = path.join(dataRoot, 'toxin_registry.draft.json');

const MANUAL_IMAGE_HINTS = {
  agapanthus_africanus_or_a_orientalis: 'agapanthus_orientalis_or_agapanthus_africanus',
  allium_cepa: 'onions',
  allium_porrum: 'leeks',
  allium_sativum: 'garlic',
  crassula_arborescens: 'crassula_arborescens_or_crassula',
  e_g_satin_pothos: 'eg_satin_pothos',
  grapes: 'vitis__implied',
  ilex_spp: 'ilex',
  raisins: 'vitis__implied',
  starfruit: 'averrhoa_carambola',
};

const SHARED_IMAGE_HINT_IDS = new Set([
  'agapanthus_africanus_or_a_orientalis',
  'allium_cepa',
  'allium_porrum',
  'allium_sativum',
  'crassula_arborescens',
  'e_g_satin_pothos',
  'grapes',
  'ilex_spp',
  'raisins',
  'starfruit',
]);

function parseArgs(argv) {
  const args = {
    siteRoot: defaultSiteRoot,
    auditDir: DEFAULT_AUDIT_DIR,
    registryOut: DEFAULT_REGISTRY_OUT,
    firestore: 'auto',
    imageMap: null,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value after ${arg}`);
      return argv[index];
    };

    if (arg === '--site-root') args.siteRoot = path.resolve(next());
    else if (arg === '--audit-dir') args.auditDir = path.resolve(next());
    else if (arg === '--registry-out') args.registryOut = path.resolve(next());
    else if (arg === '--image-map') args.imageMap = path.resolve(next());
    else if (arg === '--firestore') args.firestore = next();
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['auto', 'live', 'off'].includes(args.firestore)) {
    throw new Error('--firestore must be one of: auto, live, off');
  }

  if (!args.imageMap) {
    args.imageMap = path.join(args.siteRoot, 'src', 'data', 'firestore-images.generated.json');
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node pipeline/audit_toxin_registry.js [options]

Options:
  --firestore auto|live|off  Fetch live Firestore docs when possible. Default: auto
  --image-map PATH           Fallback image map JSON. Default: ../mewguard_site/src/data/firestore-images.generated.json
  --site-root PATH           Sibling mewguard_site root. Default: ../mewguard_site
  --audit-dir PATH           Audit report output directory. Default: data/audits
  --registry-out PATH        Draft registry output path. Default: data/toxin_registry.draft.json
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
}

function cleanText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/\s+/g, ' ').trim();
}

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function slugifyLoose(value, separator = '_') {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`${escapeRegExp(separator)}+`, 'g'), separator)
    .replace(new RegExp(`^${escapeRegExp(separator)}|${escapeRegExp(separator)}$`, 'g'), '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugifyFoodName(name) {
  return cleanText(name)
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' slashseparator ')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_slashseparator_/g, '__')
    .replace(/^_+|_+$/g, '');
}

function compactId(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function fallbackName(slug) {
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return fs.readFileSync(filePath, 'utf8').split('\n').reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return env;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
    return env;
  }, {});
}

function loadImageMap(imageMapPath) {
  if (!fs.existsSync(imageMapPath)) return {};
  return readJson(imageMapPath);
}

function hasImageUrls(data) {
  return uniqueStrings([
    ...(Array.isArray(data.imageUrls) ? data.imageUrls : []),
    data.imageUrl,
  ]).length > 0;
}

function firestoreDocFromImageMap(id, urls) {
  return {
    id,
    category: null,
    name: null,
    scientificName: null,
    imageUrls: uniqueStrings(Array.isArray(urls) ? urls : [urls]),
    hasImage: true,
    source: 'image-map',
  };
}

async function loadFirestoreDocs(args, imageMap) {
  if (args.firestore === 'off') {
    return {
      source: {
        mode: 'image-map',
        detail: args.imageMap,
        liveError: null,
      },
      docs: new Map(Object.entries(imageMap).map(([id, urls]) => [id, firestoreDocFromImageMap(id, urls)])),
    };
  }

  const adminEnv = parseEnvFile(path.join(adminRoot, '.env.local'));
  const serviceAccountPath = adminEnv.FIREBASE_ADMIN_KEY_PATH || process.env.FIREBASE_ADMIN_KEY_PATH;
  const resolvedServiceAccountPath = serviceAccountPath && (
    path.isAbsolute(serviceAccountPath) ? serviceAccountPath : path.resolve(adminRoot, serviceAccountPath)
  );

  if (!resolvedServiceAccountPath || !fs.existsSync(resolvedServiceAccountPath)) {
    if (args.firestore === 'live') {
      throw new Error('Missing Firebase service account. Set FIREBASE_ADMIN_KEY_PATH in admin/.env.local or the environment.');
    }
    return {
      source: {
        mode: 'image-map',
        detail: args.imageMap,
        liveError: 'Firebase service account not found; used image map fallback.',
      },
      docs: new Map(Object.entries(imageMap).map(([id, urls]) => [id, firestoreDocFromImageMap(id, urls)])),
    };
  }

  try {
    const requireFromAdmin = createRequire(path.join(adminRoot, 'package.json'));
    const admin = requireFromAdmin('firebase-admin');
    const serviceAccount = readJson(resolvedServiceAccountPath);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    const snapshot = await admin.firestore().collection('toxins').get();
    const docs = new Map();

    for (const doc of snapshot.docs) {
      const data = doc.data() || {};
      const urls = uniqueStrings([
        ...(Array.isArray(data.imageUrls) ? data.imageUrls : []),
        data.imageUrl,
      ]);
      docs.set(doc.id, {
        id: doc.id,
        category: data.category || null,
        name: data.name || data.common_name || data.commonName || null,
        scientificName: data.scientific_name || data.scientificName || null,
        imageUrls: urls,
        hasImage: urls.length > 0,
        source: 'firestore',
      });
    }

    return {
      source: {
        mode: 'firestore',
        detail: 'toxins collection',
        liveError: null,
      },
      docs,
    };
  } catch (error) {
    if (args.firestore === 'live') throw error;
    return {
      source: {
        mode: 'image-map',
        detail: args.imageMap,
        liveError: `Firestore fetch failed; used image map fallback. ${error.message}`,
      },
      docs: new Map(Object.entries(imageMap).map(([id, urls]) => [id, firestoreDocFromImageMap(id, urls)])),
    };
  }
}

function loadSitePlants() {
  return listJsonFiles(siteDataDir).map((file) => {
    const sourcePath = path.join(siteDataDir, file);
    const raw = readJson(sourcePath);
    const fileSlug = path.basename(file, '.json');
    const canonicalId = cleanText(raw.slug, fileSlug);
    return {
      canonicalId,
      category: 'plant',
      name: cleanText(raw.name, fallbackName(canonicalId)),
      scientificName: cleanText(raw.scientificName),
      aliases: asStringList(raw.aliases),
      sourcePath: path.relative(repoRoot, sourcePath),
    };
  });
}

function rawFoodName(raw, slug) {
  const plant = raw.plant || {};
  return cleanText(raw.name, cleanText(plant.common_name, fallbackName(slug)));
}

function rawFoodScientificName(raw) {
  const plant = raw.plant || {};
  return cleanText(raw.scientific_name, cleanText(plant.scientific_name));
}

function qualityScoreFood(raw, slug) {
  const safetyNotes = asStringList(raw.safetyNotes);
  const description = cleanText(raw.description, cleanText(raw.plant && raw.plant.description));
  const symptoms = Array.isArray(raw.symptoms) ? raw.symptoms : [];
  const toxicParts = raw.toxicParts || raw.toxic_parts || [];

  return (
    (safetyNotes.length > 0 ? 40 : 0) +
    (description ? 20 : 0) +
    (symptoms.length > 0 ? 20 : 0) +
    (asStringList(toxicParts).length > 0 ? 10 : 0) +
    (slug.includes('__') ? -5 : 0)
  );
}

function loadSiteFoods() {
  const entries = listJsonFiles(foodProcessedDir).map((file) => {
    const slug = path.basename(file, '.json');
    const sourcePath = path.join(foodProcessedDir, file);
    const raw = readJson(sourcePath);
    return {
      canonicalId: slug,
      category: 'food',
      name: rawFoodName(raw, slug),
      scientificName: rawFoodScientificName(raw),
      aliases: asStringList(raw.aliases),
      sourcePath: path.relative(repoRoot, sourcePath),
      qualityScore: qualityScoreFood(raw, slug),
    };
  });
  const bySlug = new Map(entries.map((entry) => [entry.canonicalId, entry]));

  if (!fs.existsSync(foodListPath)) {
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  return readJson(foodListPath)
    .map((item) => cleanText(item.name))
    .filter(Boolean)
    .map((name) => {
      const preferredSlug = slugifyFoodName(name);
      const candidates = [
        preferredSlug,
        preferredSlug.replace(/__/g, '_'),
        preferredSlug.replace(/_and_/g, '_'),
      ]
        .map((slug) => bySlug.get(slug))
        .filter(Boolean);

      if (candidates.length === 0) {
        return {
          canonicalId: preferredSlug,
          category: 'food',
          name,
          scientificName: '',
          aliases: [],
          sourcePath: null,
          qualityScore: 0,
          missingSourceFile: true,
        };
      }

      return [...candidates].sort((a, b) => b.qualityScore - a.qualityScore)[0];
    });
}

function buildCandidateIds(entry) {
  const candidates = [];
  const add = (id, reason) => {
    const cleaned = cleanText(id);
    if (cleaned) candidates.push({ id: cleaned, reason });
  };

  add(entry.canonicalId, 'canonicalId');
  add(entry.canonicalId.replace(/_/g, '-'), 'canonicalId dash variant');
  add(entry.canonicalId.replace(/__/g, '_'), 'canonicalId single slash variant');
  add(entry.canonicalId.replace(/_/g, '__'), 'canonicalId double underscore variant');
  add(slugifyLoose(entry.name, '_'), 'name slug');
  add(slugifyLoose(entry.name, '-'), 'name dash slug');
  add(slugifyFoodName(entry.name), 'name slash slug');
  add(slugifyFoodName(entry.name).replace(/__/g, '_'), 'name single slash slug');
  add(slugifyLoose(entry.scientificName, '_'), 'scientificName slug');
  add(slugifyLoose(entry.scientificName, '-'), 'scientificName dash slug');
  add(slugifyFoodName(entry.scientificName), 'scientificName slash slug');

  for (const alias of entry.aliases) {
    add(slugifyLoose(alias, '_'), 'alias slug');
    add(slugifyLoose(alias, '-'), 'alias dash slug');
  }

  if (MANUAL_IMAGE_HINTS[entry.canonicalId]) {
    add(MANUAL_IMAGE_HINTS[entry.canonicalId], 'manual audit hint');
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

function findImageResolution(entry, firestoreDocs) {
  const canonicalDoc = firestoreDocs.get(entry.canonicalId);
  if (canonicalDoc && canonicalDoc.hasImage) {
    return {
      status: 'canonical',
      sourceId: entry.canonicalId,
      sourceDoc: canonicalDoc,
      candidates: [{ id: entry.canonicalId, reason: 'canonicalId', match: 'exact' }],
    };
  }

  const candidates = buildCandidateIds(entry);
  const matches = [];

  for (const candidate of candidates) {
    const doc = firestoreDocs.get(candidate.id);
    if (doc && doc.hasImage) {
      matches.push({ ...candidate, match: 'exact', doc });
    }
  }

  if (matches.length === 0) {
    const compactMatches = [];
    const candidateCompacts = candidates.map((candidate) => ({ ...candidate, compact: compactId(candidate.id) }));
    for (const doc of firestoreDocs.values()) {
      if (!doc.hasImage) continue;
      const docCompact = compactId(doc.id);
      const candidate = candidateCompacts.find((item) => item.compact && item.compact === docCompact);
      if (candidate) {
        compactMatches.push({ ...candidate, id: doc.id, match: 'compact-id', doc });
      }
    }
    matches.push(...compactMatches);
  }

  const dedupedMatches = [];
  const seen = new Set();
  for (const match of matches) {
    if (match.id === entry.canonicalId) continue;
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    dedupedMatches.push(match);
  }

  if (dedupedMatches.length > 0) {
    const preferred = dedupedMatches.sort((a, b) => {
      const aManual = a.reason === 'manual audit hint' ? 1 : 0;
      const bManual = b.reason === 'manual audit hint' ? 1 : 0;
      if (aManual !== bManual) return bManual - aManual;
      const aExact = a.match === 'exact' ? 1 : 0;
      const bExact = b.match === 'exact' ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return a.id.localeCompare(b.id);
    })[0];

    return {
      status: 'alternate',
      sourceId: preferred.id,
      sourceDoc: preferred.doc,
      candidates: dedupedMatches.map(({ doc, ...candidate }) => candidate),
    };
  }

  return {
    status: canonicalDoc ? 'canonical-doc-missing-image' : 'unresolved',
    sourceId: null,
    sourceDoc: canonicalDoc || null,
    candidates: candidates.map((candidate) => ({ ...candidate, match: 'no-image-doc' })),
  };
}

function buildRegistryEntry(entry, resolution, canonicalIds) {
  const sourceId = resolution.sourceId;
  const useSharedImage = Boolean(
    sourceId &&
    sourceId !== entry.canonicalId &&
    (SHARED_IMAGE_HINT_IDS.has(entry.canonicalId) || canonicalIds.has(sourceId))
  );
  const legacyIds = sourceId && sourceId !== entry.canonicalId && !useSharedImage ? [sourceId] : [];
  const sharedImageFrom = sourceId && sourceId !== entry.canonicalId && useSharedImage ? sourceId : null;
  const imageMissing = resolution.status === 'canonical-doc-missing-image';

  return {
    canonicalId: entry.canonicalId,
    category: entry.category,
    name: entry.name,
    scientificName: entry.scientificName || null,
    legacyIds,
    sharedImageFrom,
    imageMissing,
    reviewStatus: resolution.status === 'canonical' ? 'exact' : 'needs_review',
  };
}

function summarizeEntry(entry, resolution, registryEntry, firestoreDocs) {
  const canonicalDoc = firestoreDocs.get(entry.canonicalId);
  const alternateCandidates = resolution.candidates.filter((candidate) => (
    candidate.id !== entry.canonicalId && candidate.match !== 'no-image-doc'
  ));

  let status;
  if (resolution.status === 'canonical') status = 'has_canonical_image';
  else if (registryEntry.sharedImageFrom) status = 'resolved_by_shared_image';
  else if (registryEntry.legacyIds.length > 0) status = 'resolved_by_legacy_id';
  else if (registryEntry.imageMissing) status = 'missing_firestore_image';
  else status = 'unresolved';

  return {
    canonicalId: entry.canonicalId,
    category: entry.category,
    name: entry.name,
    scientificName: entry.scientificName || null,
    sourcePath: entry.sourcePath,
    status,
    currentSiteHasImage: resolution.status === 'canonical',
    firestoreDocExists: Boolean(canonicalDoc),
    firestoreDocHasImage: Boolean(canonicalDoc && canonicalDoc.hasImage),
    suggestedImageSource: registryEntry.sharedImageFrom || registryEntry.legacyIds[0] || null,
    legacyIds: registryEntry.legacyIds,
    sharedImageFrom: registryEntry.sharedImageFrom,
    imageMissing: registryEntry.imageMissing,
    candidateMatches: alternateCandidates,
  };
}

function normalizedConceptKey(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function buildDuplicateConceptGroups(siteEntries) {
  const byName = new Map();
  const byScientificName = new Map();

  for (const entry of siteEntries) {
    const nameKey = `${entry.category}|${normalizedConceptKey(entry.name)}`;
    if (normalizedConceptKey(entry.name)) {
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey).push(entry);
    }

    const scientificNameKey = `${entry.category}|${normalizedConceptKey(entry.scientificName)}`;
    if (normalizedConceptKey(entry.scientificName)) {
      if (!byScientificName.has(scientificNameKey)) byScientificName.set(scientificNameKey, []);
      byScientificName.get(scientificNameKey).push(entry);
    }
  }

  const renderGroup = (kind, key, entries) => ({
    kind,
    value: key.split('|').slice(1).join('|'),
    category: key.split('|')[0],
    entries: entries.map((entry) => ({
      canonicalId: entry.canonicalId,
      name: entry.name,
      scientificName: entry.scientificName || null,
      sourcePath: entry.sourcePath,
    })),
  });

  return [
    ...[...byName.entries()]
      .filter(([, entries]) => entries.length > 1)
      .map(([key, entries]) => renderGroup('name', key, entries)),
    ...[...byScientificName.entries()]
      .filter(([, entries]) => entries.length > 1)
      .map(([key, entries]) => renderGroup('scientificName', key, entries)),
  ].sort((a, b) => `${a.kind}:${a.value}`.localeCompare(`${b.kind}:${b.value}`));
}

function findDuplicateIds(entries) {
  const seen = new Set();
  const duplicates = new Set();
  for (const entry of entries) {
    if (seen.has(entry.canonicalId)) duplicates.add(entry.canonicalId);
    seen.add(entry.canonicalId);
  }
  return [...duplicates].sort();
}

function renderMarkdown(report) {
  const lines = [];
  const counts = report.counts;
  lines.push('# Toxin ID Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Firestore source: ${report.firestore.source.mode} (${report.firestore.source.detail})`);
  if (report.firestore.source.liveError) {
    lines.push(`Firestore note: ${report.firestore.source.liveError}`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Site-visible toxins: ${counts.siteVisible} (${counts.plants} plants, ${counts.foods} foods)`);
  lines.push(`- Firestore docs inspected: ${counts.firestoreDocs}`);
  lines.push(`- Firestore docs with images: ${counts.firestoreDocsWithImages}`);
  lines.push(`- Current site-visible entries without canonical images: ${counts.currentMissingImages}`);
  lines.push(`- Resolved by legacy id: ${counts.resolvedByLegacyId}`);
  lines.push(`- Resolved by shared image: ${counts.resolvedBySharedImage}`);
  lines.push(`- Explicit missing Firestore images: ${counts.missingFirestoreImage}`);
  lines.push(`- Unresolved: ${counts.unresolved}`);
  lines.push(`- Duplicate canonical ids: ${counts.duplicateCanonicalIds}`);
  lines.push(`- Duplicate concept groups for review: ${counts.duplicateConceptGroups}`);
  lines.push('');
  lines.push('## Current Missing Images');
  lines.push('');
  lines.push('| Canonical ID | Category | Name | Status | Suggested source | Notes |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const item of report.currentMissingImages) {
    const source = item.suggestedImageSource || '';
    const notes = item.imageMissing
      ? 'Canonical Firestore doc exists but has no image.'
      : item.candidateMatches.map((candidate) => `${candidate.id} (${candidate.reason}; ${candidate.match})`).join('<br>');
    lines.push(`| \`${item.canonicalId}\` | ${item.category} | ${escapeMarkdownCell(item.name)} | ${item.status} | ${source ? `\`${source}\`` : ''} | ${escapeMarkdownCell(notes)} |`);
  }

  lines.push('');
  lines.push('## Duplicate Concept Groups');
  lines.push('');
  if (report.duplicateConceptGroups.length === 0) {
    lines.push('No duplicate name or scientific-name groups found.');
  } else {
    lines.push('| Kind | Category | Value | Canonical IDs |');
    lines.push('| --- | --- | --- | --- |');
    for (const group of report.duplicateConceptGroups) {
      const ids = group.entries.map((entry) => `\`${entry.canonicalId}\``).join('<br>');
      lines.push(`| ${group.kind} | ${group.category} | ${escapeMarkdownCell(group.value)} | ${ids} |`);
    }
  }
  lines.push('');
  lines.push('## Draft Registry');
  lines.push('');
  lines.push(`Draft registry written to \`${path.relative(repoRoot, report.outputs.registryDraft)}\`.`);
  lines.push('All non-canonical image resolutions are marked `needs_review` and should be confirmed before migration.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function escapeMarkdownCell(value) {
  return cleanText(value).replace(/\|/g, '\\|');
}

async function main() {
  const args = parseArgs(process.argv);
  const imageMap = loadImageMap(args.imageMap);
  const firestore = await loadFirestoreDocs(args, imageMap);
  const firestoreDocs = firestore.docs;

  const siteEntries = [...loadSitePlants(), ...loadSiteFoods()];
  const canonicalIds = new Set(siteEntries.map((entry) => entry.canonicalId));
  const registry = [];
  const summaries = [];
  const duplicateConceptGroups = buildDuplicateConceptGroups(siteEntries);
  const duplicateCanonicalIds = findDuplicateIds(siteEntries);

  for (const entry of siteEntries) {
    const resolution = findImageResolution(entry, firestoreDocs);
    const registryEntry = buildRegistryEntry(entry, resolution, canonicalIds);
    registry.push(registryEntry);
    summaries.push(summarizeEntry(entry, resolution, registryEntry, firestoreDocs));
  }

  const currentMissingImages = summaries.filter((item) => !item.currentSiteHasImage);
  const report = {
    generatedAt: new Date().toISOString(),
    firestore: {
      source: firestore.source,
    },
    counts: {
      siteVisible: siteEntries.length,
      plants: siteEntries.filter((entry) => entry.category === 'plant').length,
      foods: siteEntries.filter((entry) => entry.category === 'food').length,
      firestoreDocs: firestoreDocs.size,
      firestoreDocsWithImages: [...firestoreDocs.values()].filter((doc) => doc.hasImage).length,
      currentMissingImages: currentMissingImages.length,
      resolvedByLegacyId: currentMissingImages.filter((item) => item.status === 'resolved_by_legacy_id').length,
      resolvedBySharedImage: currentMissingImages.filter((item) => item.status === 'resolved_by_shared_image').length,
      missingFirestoreImage: currentMissingImages.filter((item) => item.status === 'missing_firestore_image').length,
      unresolved: currentMissingImages.filter((item) => item.status === 'unresolved').length,
      duplicateCanonicalIds: duplicateCanonicalIds.length,
      duplicateConceptGroups: duplicateConceptGroups.length,
    },
    currentMissingImages,
    duplicateCanonicalIds,
    duplicateConceptGroups,
    allSiteVisibleImages: summaries,
    outputs: {
      jsonReport: path.join(args.auditDir, 'toxin_id_audit.json'),
      markdownReport: path.join(args.auditDir, 'toxin_id_audit.md'),
      registryDraft: args.registryOut,
    },
  };

  writeJson(report.outputs.registryDraft, registry);
  writeJson(report.outputs.jsonReport, report);
  fs.mkdirSync(path.dirname(report.outputs.markdownReport), { recursive: true });
  fs.writeFileSync(report.outputs.markdownReport, renderMarkdown(report));

  console.log(`Site-visible toxins: ${report.counts.siteVisible} (${report.counts.plants} plants, ${report.counts.foods} foods)`);
  console.log(`Firestore docs inspected: ${report.counts.firestoreDocs} (${report.counts.firestoreDocsWithImages} with images)`);
  console.log(`Current missing canonical images: ${report.counts.currentMissingImages}`);
  console.log(`Resolved by legacy id: ${report.counts.resolvedByLegacyId}`);
  console.log(`Resolved by shared image: ${report.counts.resolvedBySharedImage}`);
  console.log(`Explicit missing Firestore images: ${report.counts.missingFirestoreImage}`);
  console.log(`Unresolved: ${report.counts.unresolved}`);
  console.log(`Wrote ${path.relative(repoRoot, report.outputs.jsonReport)}`);
  console.log(`Wrote ${path.relative(repoRoot, report.outputs.markdownReport)}`);
  console.log(`Wrote ${path.relative(repoRoot, report.outputs.registryDraft)}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
