// Restricted PDF fetch endpoint for Suivi Turf Turbo V4.
// Only the official LONAB host is accepted. This is deliberately not an open proxy.
const ALLOWED_HOSTS = new Set(["lonab.bf", "www.lonab.bf"]);
const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 15000;

function validUrl(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error("URL invalide."); }
  if (u.protocol !== "https:") throw new Error("Seules les URL HTTPS sont autorisées.");
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) throw new Error("Source non autorisée. Seuls les journaux du domaine LONAB sont acceptés pour le moment.");
  if (u.username || u.password || u.port) throw new Error("URL contenant des identifiants ou un port personnalisé refusée.");
  return u;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  let target;
  try { target = validUrl(req.query?.url); }
  catch (e) { return res.status(400).json({ error: e.message }); }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response;
    for (let redirects = 0; redirects <= 3; redirects++) {
      response = await fetch(target, { method: "GET", redirect: "manual", signal: controller.signal, headers: { "Accept": "application/pdf,application/octet-stream;q=0.8" } });
      if (![301,302,303,307,308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3) return res.status(502).json({ error: "Redirection PDF invalide ou trop longue." });
      try { target = validUrl(new URL(location, target).toString()); }
      catch (e) { return res.status(403).json({ error: "Redirection vers une source non autorisée : " + e.message }); }
    }
    if (!response || !response.ok) return res.status(502).json({ error: "Téléchargement refusé par la source (HTTP " + (response?.status || "inconnu") + ")." });
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return res.status(413).json({ error: "PDF trop volumineux : limite de 20 Mo." });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return res.status(413).json({ error: "PDF vide ou supérieur à la limite de 20 Mo." });
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return res.status(415).json({ error: "Le fichier reçu n'est pas un PDF valide." });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(bytes.length));
    res.setHeader("Content-Disposition", 'attachment; filename="journal-lonab.pdf"');
    return res.status(200).send(bytes);
  } catch (e) {
    const timeout = e?.name === "AbortError";
    return res.status(timeout ? 504 : 502).json({ error: timeout ? "Délai de téléchargement dépassé." : "Impossible de récupérer le PDF depuis la source autorisée." });
  } finally {
    clearTimeout(timer);
  }
};
