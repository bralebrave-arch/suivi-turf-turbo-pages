/* Suivi Turf Turbo V4 — noyau de données hippiques
 * Version 0.1.0 — 04/11/2026
 * Sans dépendance externe. Ne collecte pas le web : prépare, normalise et contrôle
 * les données reçues d'un connecteur autorisé ou saisies/importées par l'utilisateur.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TurfV4DataCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCHEMA_VERSION = '1.0.0';
  const STATUSES = new Set(['verified', 'corroborated', 'unverified', 'missing', 'conflicting', 'stale']);
  const DISCIPLINES = new Set(['plat', 'trot_attele', 'trot_monte', 'haies', 'steeple', 'cross', 'autre']);
  const asText = v => v == null ? '' : String(v).trim();
  const asNumber = v => v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
  const unique = a => [...new Set(a)];
  const nowIso = () => new Date().toISOString();
  const safeUrl = value => {
    try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null; }
    catch (_) { return null; }
  };

  function field(value, source = {}) {
    const status = STATUSES.has(source.status) ? source.status : (value == null || value === '' ? 'missing' : 'unverified');
    return {
      value: value == null || value === '' ? null : value,
      status,
      source: asText(source.source) || null,
      sourceUrl: safeUrl(source.sourceUrl),
      collectedAt: source.collectedAt && !Number.isNaN(Date.parse(source.collectedAt)) ? new Date(source.collectedAt).toISOString() : null,
      note: asText(source.note) || null
    };
  }

  function normalizeRunner(input = {}, defaults = {}) {
    const num = asNumber(input.number ?? input.numero);
    const name = asText(input.name ?? input.nom);
    const recent = Array.isArray(input.recentForm ?? input.forme) ? (input.recentForm ?? input.forme).map(x => asText(x)).filter(Boolean).slice(0, 12) : [];
    const source = input.provenance || {};
    const runner = {
      id: asText(input.id) || `runner-${num ?? 'x'}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      number: num,
      name,
      status: ['runner', 'non_runner', 'unknown'].includes(input.status) ? input.status : 'unknown',
      jockey: field(input.jockey, source.jockey),
      trainer: field(input.trainer, source.trainer),
      draw: field(asNumber(input.draw), source.draw),
      weightKg: field(asNumber(input.weightKg), source.weightKg),
      odds: field(asNumber(input.odds), source.odds),
      recentForm: field(recent.length ? recent : null, source.recentForm),
      distanceSuitability: field(input.distanceSuitability ?? null, source.distanceSuitability),
      trackSuitability: field(input.trackSuitability ?? null, source.trackSuitability),
      groundSuitability: field(input.groundSuitability ?? null, source.groundSuitability),
      disciplineSuitability: field(input.disciplineSuitability ?? null, source.disciplineSuitability),
      valueSuitability: field(asNumber(input.valueSuitability), source.valueSuitability),
      scenarioSuitability: field(asNumber(input.scenarioSuitability), source.scenarioSuitability),
      historicalPerformances: Array.isArray(input.historicalPerformances) ? input.historicalPerformances.slice(0, 30).map(p => ({
        date: asText(p?.date), discipline: asText(p?.discipline), distanceM: asNumber(p?.distanceM),
        track: asText(p?.track), ground: asText(p?.ground), surface: asText(p?.surface),
        placing: asNumber(p?.placing), fieldSize: asNumber(p?.fieldSize), status: asText(p?.status),
        sourceStatus: asText(p?.sourceStatus), source: asText(p?.source), sourceUrl: safeUrl(p?.sourceUrl)
      })) : [],
      notes: asText(input.notes) || null
    };
    if (defaults.source && !runner.jockey.source) runner.jockey.source = defaults.source;
    return runner;
  }

  function normalizeRace(input = {}) {
    const disciplineRaw = asText(input.discipline).toLowerCase().replace(/[ -]+/g, '_');
    const discipline = DISCIPLINES.has(disciplineRaw) ? disciplineRaw : 'autre';
    const runnersInput = Array.isArray(input.runners) ? input.runners : [];
    const runners = runnersInput.map(r => normalizeRunner(r));
    const race = {
      schemaVersion: SCHEMA_VERSION,
      id: asText(input.id) || `race-${Date.now()}`,
      raceName: asText(input.raceName ?? input.name),
      date: asText(input.date),
      localTime: asText(input.localTime),
      track: asText(input.track ?? input.hippodrome),
      country: asText(input.country),
      discipline,
      distanceM: asNumber(input.distanceM ?? input.distance),
      surface: field(input.surface ?? null, input.provenance?.surface),
      ground: field(input.ground ?? null, input.provenance?.ground),
      startType: field(input.startType ?? null, input.provenance?.startType),
      source: asText(input.source) || null,
      sourceUrl: safeUrl(input.sourceUrl),
      collectedAt: input.collectedAt && !Number.isNaN(Date.parse(input.collectedAt)) ? new Date(input.collectedAt).toISOString() : nowIso(),
      collectionStatus: ['complete', 'partial', 'manual', 'failed'].includes(input.collectionStatus) ? input.collectionStatus : 'manual',
      runners
    };
    return race;
  }

  function validateRace(race, options = {}) {
    const errors = [], warnings = [], seenNumbers = new Set(), seenIds = new Set();
    if (!race.raceName) errors.push('Nom de course manquant.');
    if (!race.date || Number.isNaN(Date.parse(race.date))) errors.push('Date de course absente ou invalide.');
    if (!race.track) warnings.push('Hippodrome non renseigné.');
    if (!race.discipline || race.discipline === 'autre') warnings.push('Discipline non déterminée.');
    if (!Number.isFinite(race.distanceM) || race.distanceM <= 0) warnings.push('Distance absente ou invalide.');
    if (!race.runners.length) errors.push('Aucun partant importé.');
    race.runners.forEach((r, i) => {
      const label = r.number == null ? `Ligne ${i + 1}` : `N° ${r.number}`;
      if (!r.name) errors.push(`${label} : nom du cheval manquant.`);
      if (!Number.isInteger(r.number) || r.number <= 0) errors.push(`${label} : numéro de partant invalide.`);
      if (seenNumbers.has(r.number)) errors.push(`Numéro de partant dupliqué : ${r.number}.`);
      seenNumbers.add(r.number);
      if (seenIds.has(r.id)) errors.push(`Identifiant de partant dupliqué : ${r.id}.`);
      seenIds.add(r.id);
      if (r.status === 'unknown') warnings.push(`${label} ${r.name} : statut partant/non-partant à confirmer.`);
      if (r.odds.status === 'stale') warnings.push(`${label} ${r.name} : cote périmée.`);
      if (r.odds.value != null && r.odds.value <= 0) errors.push(`${label} ${r.name} : cote invalide.`);
    });
    const active = race.runners.filter(r => r.status !== 'non_runner');
    const min = options.minimumRunners ?? 3;
    if (active.length < min) warnings.push(`Seulement ${active.length} partant(s) actif(s) : analyse complète déconseillée.`);
    const missingNames = race.runners.filter(r => !r.name).length;
    const unresolvedStatuses = race.runners.filter(r => r.status === 'unknown').length;
    const critical = race.runners.filter(r => !r.number || !r.name || r.status === 'unknown').length;
    const completeness = race.runners.length ? Math.round(100 * (1 - critical / race.runners.length)) : 0;
    const canAnalyze = errors.length === 0 && active.length >= min && unresolvedStatuses === 0;
    return { valid: errors.length === 0, canAnalyze, errors, warnings: unique(warnings), completeness, counts: { total: race.runners.length, active: active.length, nonRunners: race.runners.length - active.length, missingNames, unresolvedStatuses } };
  }

  function assessFreshness(race, maxAgeHours = 24) {
    const collected = Date.parse(race.collectedAt || '');
    if (!Number.isFinite(collected)) return { status: 'missing', ageHours: null, label: 'Horodatage absent' };
    const ageHours = Math.max(0, (Date.now() - collected) / 3600000);
    return { status: ageHours > maxAgeHours ? 'stale' : 'fresh', ageHours: Math.round(ageHours * 10) / 10, label: ageHours > maxAgeHours ? 'Données à actualiser' : 'Données récentes' };
  }

  function summarizeSources(race) {
    const fields = ['jockey','trainer','draw','weightKg','odds','recentForm','distanceSuitability','trackSuitability','groundSuitability','disciplineSuitability'];
    const counts = Object.fromEntries([...STATUSES].map(s => [s, 0]));
    race.runners.forEach(r => fields.forEach(k => { const s = r[k]?.status; if (counts[s] != null) counts[s]++; }));
    const urls = unique(race.runners.flatMap(r => fields.map(k => r[k]?.sourceUrl).filter(Boolean)));
    return { counts, sourceUrls: urls };
  }

  function makeAnalysisReadiness(race) {
    const validation = validateRace(race);
    const freshness = assessFreshness(race);
    const sources = summarizeSources(race);
    const blockers = [...validation.errors];
    if (validation.counts.unresolvedStatuses) blockers.push(`${validation.counts.unresolvedStatuses} statut(s) de partant à confirmer.`);
    if (freshness.status !== 'fresh') blockers.push(freshness.label + '.');
    return { ready: validation.canAnalyze && freshness.status === 'fresh', validation, freshness, sources, blockers: unique(blockers), recommendation: validation.canAnalyze && freshness.status === 'fresh' ? 'Données suffisamment structurées pour lancer les moteurs.' : 'Compléter ou actualiser les données avant de lancer une analyse complète.' };
  }

  return { SCHEMA_VERSION, field, normalizeRunner, normalizeRace, validateRace, assessFreshness, summarizeSources, makeAnalysisReadiness };
});
