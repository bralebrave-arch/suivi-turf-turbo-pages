// Suivi Turf Turbo V4 — connecteur Canalturf sécurisé
// Récupération serveur limitée au domaine Canalturf et aux fiches de courses.
const HOSTS = new Set(["canalturf.com", "www.canalturf.com"]);
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15000;

function validateUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Lien invalide."); }
  if (url.protocol !== "https:") throw new Error("Seuls les liens HTTPS sont acceptés.");
  if (!HOSTS.has(url.hostname.toLowerCase())) throw new Error("Source refusée : seule une fiche Canalturf est acceptée pour le moment.");
  if (url.username || url.password || url.port) throw new Error("URL contenant des identifiants ou un port personnalisé refusée.");
  if (!/^\/pronostics-PMU\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\/\d+_[^/]+\.html$/i.test(url.pathname)) throw new Error("Le lien ne correspond pas au format d’une fiche de course Canalturf.");
  return url;
}
function decode(s) {
  return String(s || "").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function text(s) { return decode(String(s || "").replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }
function cellValues(row) { return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]); }
function numberOrNull(value) {
  const s = text(value).replace(/\s/g, "").replace(",", ".");
  if (!s || /^(?:--|-|n\/?a|nc)$/i.test(s)) return null;
  const m = s.match(/^\d+(?:\.\d+)?$/);
  return m ? Number(m[0]) : null;
}
function parsePage(html, url) {
  const clean = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const title = text((clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "");
  const titleRace = title.replace(/^Le pronostic du\s*/i, "").trim();
  const intro = text((clean.match(/<h1\b[^>]*>[\s\S]*?<\/h1>([\s\S]{0,700})/i) || [])[1] || "");
  const heading = intro.match(/(\d{1,2}:\d{2})\s*-\s*(?:R(\d+)\s*C(\d+)|RÉUNION\s+(\d+)\s+COURSE\s+(\d+))\s*-\s*([A-ZÀ-Ÿ][A-ZÀ-Ÿ -]+)/i);
  const metaLine = text((clean.match(/<small\b[^>]*>([\s\S]*?)<\/small>/i) || [])[1] || "");
  const dist = metaLine.match(/(\d{3,4})\s*m/i);
  const disciplineText = metaLine.split(/[-–]/)[0].trim();
  const discipline = /trot/i.test(disciplineText) ? (/mont/i.test(disciplineText) ? "trot_monte" : "trot_attele") : /haie/i.test(disciplineText) ? "haies" : /steeple/i.test(disciplineText) ? "steeple" : /cross/i.test(disciplineText) ? "cross" : /plat/i.test(disciplineText) ? "plat" : "autre";
  const surfaceLine = text((clean.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || "");
  const surface = /PSF/i.test(surfaceLine) ? "PSF" : /herbe/i.test(surfaceLine) ? "Herbe" : null;
  const tables = [...clean.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m => m[1]);
  const table = tables.find(t => /Partants et cotes/i.test(text((t.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i) || [])[1] || "")));
  if (!table) throw new Error("Le tableau « Partants et cotes » est absent ou indisponible sur cette fiche.");
  const headerCells = [...(table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i) || ["", ""])[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m => text(m[1]));
  const body = (table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i) || ["", table])[1];
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const runners = [];
  for (const match of rows) {
    const cells = cellValues(match[1]);
    if (cells.length < 4) continue;
    const number = numberOrNull(cells[0]);
    const horseCell = cells[1] || "";
    const strong = (horseCell.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i) || [])[1];
    const rawHorse = text(strong || horseCell);
    const horseMatch = rawHorse.match(/^(.+?)\s*\(([A-Z]\d+)\)$/i);
    const name = (horseMatch ? horseMatch[1] : rawHorse).trim();
    if (!Number.isInteger(number) || number < 1 || !name) continue;
    const formMatch = horseCell.match(/<\/strong>\s*<br\s*\/?\s*>\s*<small\b[^>]*>([\s\S]*?)<\/small>/i);
    const form = text(formMatch?.[1] || "");
    let jockey = null, trainer = null;
    for (const cell of cells.slice(2)) {
      const sm = cell.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>[\s\S]*?<small\b[^>]*>([\s\S]*?)<\/small>/i);
      if (sm) { jockey = text(sm[1]) || null; trainer = text(sm[2]) || null; break; }
    }
    const draw = numberOrNull(cells[2]);
    const weightKg = numberOrNull(cells[5]);
    const handicapValue = numberOrNull(cells[6]);
    const odds = [];
    cells.slice(7).forEach((v, i) => {
      const label = headerCells[i + 7] || "";
      if (/cote|odds|10h/i.test(label)) odds.push({ label: label || "Colonne de cote non libellée", value: numberOrNull(v), raw: text(v) });
    });
    runners.push({
      number, name, status: "unknown", jockey, trainer, draw, weightKg, handicapValue,
      recentForm: form ? form.split(/[\s,;]+/).filter(Boolean) : [],
      odds: odds.find(x => x.value != null)?.value ?? null,
      oddsDetails: odds,
      provenance: Object.fromEntries(["jockey","trainer","draw","weightKg","handicapValue","recentForm","odds"].map(k => [k, { status: k === "odds" && !odds.some(x => x.value != null) || k === "recentForm" && !form || k === "handicapValue" && handicapValue == null ? "missing" : "unverified", source: "Canalturf", sourceUrl: url.toString(), collectedAt: new Date().toISOString(), note: "Extraction automatique : confirmation humaine requise." }]))
    });
  }
  if (!runners.length) throw new Error("Aucun partant exploitable détecté. Le tableau peut être vide ou la page ne pas encore publier les partants.");
  const path = url.pathname.match(/^\/pronostics-PMU\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/(\d+)_/i);
  const date = path?.[1] || "";
  const track = heading?.[6]?.trim() || decode(path?.[2] || "").replace(/-/g, " ").toUpperCase();
  const caption = text((table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i) || [])[1] || "");
  const raceCode = caption.match(/\b(R\d+C\d+)\b/i)?.[1]?.toUpperCase() || (heading ? "R" + heading[2] + "C" + heading[3] : "");
  const nonRunnerText = text((clean.match(/Non-partant\(s\)[\s\S]{0,500}/i) || [])[0] || "");
  const explicitNonRunners = [...nonRunnerText.matchAll(/\b(\d{1,2})\b/g)].map(m => Number(m[1]));
  return {
    race: {
      raceName: titleRace || title, date, track, discipline, distanceM: numberOrNull(dist?.[1]),
      localTime: heading?.[1] || "", meeting: Number(heading?.[2] || heading?.[4]) || null,
      raceNumber: Number(heading?.[3] || heading?.[5]) || null, raceCode,
      surface, ground: surfaceLine || null, source: "Canalturf",
      sourceUrl: url.toString(), collectedAt: new Date().toISOString(), collectionStatus: "partial",
      runners
    },
    warnings: [
      "Aucune donnée n’est intégrée avant ta confirmation.",
      "Les statuts restent « à confirmer » : la présence dans le tableau ne suffit pas à certifier le statut officiel.",
      ...(!runners.some(r => r.odds != null) ? ["Cotes absentes ou non libellées dans la fiche au moment de la collecte."] : []),
      ...(!runners.some(r => r.recentForm.length) ? ["Performances récentes absentes pour les chevaux détectés."] : []),
      ...(!runners.some(r => r.handicapValue != null) ? ["Valeurs handicap absentes pour les chevaux détectés."] : []),
      ...(explicitNonRunners.length ? ["Non-partants explicitement mentionnés sur la page : " + explicitNonRunners.join(", ") + " — à vérifier."] : [])
    ],
    importedCount: runners.length,
    source: "Canalturf"
  };
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Méthode non autorisée." }); }
  let target;
  try { target = validateUrl(req.query?.url); } catch (e) { return res.status(400).json({ error: e.message }); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(target, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "SuiviTurfTurboV4/1.0 (race-data importer)", "Accept": "text/html,application/xhtml+xml" } });
      if (![301,302,303,307,308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3) return res.status(502).json({ error: "Redirection Canalturf invalide ou trop longue." });
      try { target = validateUrl(new URL(location, target).toString()); } catch (e) { return res.status(403).json({ error: "Redirection vers une source non autorisée : " + e.message }); }
    }
    if (!response?.ok) return res.status(502).json({ error: "Canalturf a refusé la fiche (HTTP " + (response?.status || "inconnu") + ")." });
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return res.status(413).json({ error: "Page trop volumineuse." });
    const html = await response.text();
    if (!html || Buffer.byteLength(html, "utf8") > MAX_BYTES) return res.status(413).json({ error: "Page vide ou trop volumineuse." });
    const result = parsePage(html, target);
    return res.status(200).json(result);
  } catch (e) {
    const timeout = e?.name === "AbortError";
    return res.status(timeout ? 504 : 422).json({ error: timeout ? "Délai de lecture de la fiche dépassé." : (e?.message || "Impossible d’extraire la fiche Canalturf.") });
  } finally { clearTimeout(timer); }
};
