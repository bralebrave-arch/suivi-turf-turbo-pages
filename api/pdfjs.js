// Same-origin, fixed-version PDF.js asset proxy. No user-controlled upstream URL.
const VERSION = "6.5.438";
const FILES = new Set(["pdf.mjs", "pdf.worker.mjs"]);
const MAX_BYTES = 12 * 1024 * 1024;
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const asset = String(req.query?.asset || "");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  if (!FILES.has(asset)) return res.status(400).json({ error: "Fichier PDF.js non autorisé." });
  try {
    const upstream = await fetch("https://cdn.jsdelivr.net/npm/pdfjs-dist@" + VERSION + "/build/" + asset, {
      headers: { "Accept": "application/javascript, text/javascript, */*;q=0.8" }
    });
    if (!upstream.ok) return res.status(502).json({ error: "Source PDF.js indisponible (HTTP " + upstream.status + ")." });
    const declared = Number(upstream.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) return res.status(502).json({ error: "Ressource PDF.js trop volumineuse." });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return res.status(502).json({ error: "Ressource PDF.js vide ou trop volumineuse." });
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Content-Length", String(bytes.length));
    return res.status(200).send(bytes);
  } catch (_) {
    return res.status(502).json({ error: "Impossible de récupérer PDF.js depuis le serveur." });
  }
};
