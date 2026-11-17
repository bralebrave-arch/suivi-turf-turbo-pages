/* Suivi Turf Turbo V4 — import des partants depuis une fiche Canalturf.
 * Interface indépendante ; aperçu obligatoire ; aucune intégration sans validation.
 */
(() => {
  "use strict";
  const Core = window.TurfV4DataCore;
  if (!Core) return;
  const pdfSection = document.getElementById("pdfInput")?.closest("section");
  if (!pdfSection) return;
  const section = document.createElement("section");
  section.className = "card";
  section.id = "canalturfImport";
  section.innerHTML = `
    <h2>Import de partants depuis un lien de site</h2>
    <p class="hint">Première source prise en charge : Canalturf. Colle le lien d’une fiche de course. Les données seront extraites puis présentées pour contrôle ; rien ne sera intégré avant ta validation.</p>
    <label>Lien de la fiche Canalturf<input id="canalturfUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://www.canalturf.com/pronostics-PMU/…"></label>
    <div class="actions"><button type="button" id="canalturfFetch">Récupérer les partants</button></div>
    <p id="canalturfStatus" class="small" aria-live="polite">En attente d’un lien Canalturf.</p>
    <div id="canalturfPreview" class="hidden">
      <div class="status warn" id="canalturfMeta"></div>
      <div id="canalturfWarnings" class="status warn"></div>
      <p id="canalturfCounts" class="small" aria-live="polite"></p>
      <div class="actions">
        <button type="button" id="canalturfAllRunners" class="secondary">Confirmer tous comme partants</button>
        <button type="button" id="canalturfResetStatuses" class="secondary">Remettre tous à confirmer</button>
      </div>
      <p class="small">Le bouton « Confirmer tous comme partants » est une validation humaine en bloc : utilise-le uniquement après avoir comparé la liste entière avec la liste officielle. Il ne déduit jamais le statut à partir de la simple présence dans le tableau.</p>
      <div style="overflow-x:auto"><table id="canalturfTable" style="width:100%;border-collapse:collapse;font-size:.86rem"><thead><tr><th>N°</th><th>Cheval</th><th>Jockey</th><th>Entraîneur</th><th>Corde</th><th>Poids</th><th>Valeur</th><th>Performances</th><th>Cote</th><th>Statut à valider</th></tr></thead><tbody id="canalturfRows"></tbody></table></div>
      <div class="actions"><button type="button" id="canalturfConfirm">Valider et transmettre à la course</button><button type="button" class="secondary" id="canalturfCancel">Annuler l’aperçu</button></div>
      <p class="small">Les champs extraits restent non vérifiés. Vérifie chaque cheval, son statut et les informations manquantes. Les cotes absentes n’empêchent pas le transfert et restent vides. La validation ici autorise uniquement le transfert dans le formulaire de course ; elle ne lance pas automatiquement les sept experts.</p>
    </div>`;
  pdfSection.insertAdjacentElement("afterend", section);
  const $ = id => document.getElementById(id);
  let pending = null;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function statusSelects() { return [...$("canalturfRows").querySelectorAll("select[data-status]")]; }
  function updateCounts() {
    const selects = statusSelects();
    const runners = selects.filter(s => s.value === "runner").length;
    const nonRunners = selects.filter(s => s.value === "non_runner").length;
    const unknown = selects.length - runners - nonRunners;
    $("canalturfCounts").textContent = "Total détecté : " + selects.length + " · Partants confirmés : " + runners + " · Non-partants confirmés : " + nonRunners + " · À confirmer : " + unknown;
  }
  function clear() { pending = null; $("canalturfPreview").classList.add("hidden"); $("canalturfRows").innerHTML = ""; }
  function showError(message) { $("canalturfStatus").textContent = message; $("canalturfStatus").className = "status bad"; }
  $("canalturfFetch").addEventListener("click", async () => {
    const url = $("canalturfUrl").value.trim();
    if (!url) { showError("Colle d’abord le lien de la fiche Canalturf."); return; }
    let parsed;
    try { parsed = new URL(url); } catch { showError("Lien invalide."); return; }
    if (parsed.protocol !== "https:" || !["canalturf.com","www.canalturf.com"].includes(parsed.hostname.toLowerCase())) { showError("Seuls les liens HTTPS de Canalturf sont acceptés."); return; }
    $("canalturfFetch").disabled = true; clear();
    $("canalturfStatus").textContent = "Lecture sécurisée de la fiche Canalturf…";
    try {
      const response = await fetch("/api/canalturf?url=" + encodeURIComponent(url), { method:"GET", credentials:"same-origin", headers:{Accept:"application/json"} });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import impossible (HTTP " + response.status + ").");
      if (!data.race || !Array.isArray(data.race.runners) || !data.race.runners.length) throw new Error("Aucun partant exploitable reçu.");
      pending = data;
      const race = data.race;
      $("canalturfMeta").textContent = race.raceName + " · " + race.date + " · " + race.track + " · " + race.raceCode + " · " + (race.localTime || "heure non précisée") + " · " + (race.distanceM || "distance inconnue") + " m · " + race.runners.length + " chevaux détectés";
      $("canalturfWarnings").textContent = (data.warnings || []).join("\n");
      $("canalturfRows").innerHTML = race.runners.map((r,i) => `<tr data-runner="${i}">
        <td>${esc(r.number)}</td><td><strong>${esc(r.name)}</strong></td><td>${esc(r.jockey || "—")}</td><td>${esc(r.trainer || "—")}</td>
        <td>${esc(r.draw ?? "—")}</td><td>${esc(r.weightKg == null ? "—" : r.weightKg + " kg")}</td><td>${esc(r.handicapValue ?? "—")}</td>
        <td>${esc((r.recentForm || []).join(" ") || "Absentes")}</td><td>${esc(r.odds ?? "Absente")}</td>
        <td><select data-status="${i}" aria-label="Statut du cheval ${esc(r.number)}"><option value="unknown">À confirmer</option><option value="runner">Partant confirmé</option><option value="non_runner">Non-partant confirmé</option></select></td>
      </tr>`).join("");
      statusSelects().forEach(select => select.addEventListener("change", updateCounts));
      $("canalturfPreview").classList.remove("hidden");
      updateCounts();
      $("canalturfStatus").textContent = "Extraction terminée : " + race.runners.length + " chevaux chargés. Vérifie l’aperçu avant toute intégration.";
      $("canalturfStatus").className = "status warn";
    } catch (error) { showError(error.message || "Erreur de lecture."); }
    finally { $("canalturfFetch").disabled = false; }
  });
  $("canalturfAllRunners").addEventListener("click", () => {
    if (!pending) return;
    statusSelects().forEach(select => { select.value = "runner"; });
    updateCounts();
    $("canalturfStatus").textContent = "Tous les chevaux sont marqués « partant confirmé » par ton action. Vérifie qu’aucun non-partant officiel ne figure dans la liste avant le transfert.";
    $("canalturfStatus").className = "status warn";
  });
  $("canalturfResetStatuses").addEventListener("click", () => {
    statusSelects().forEach(select => { select.value = "unknown"; });
    updateCounts();
    $("canalturfStatus").textContent = "Tous les statuts ont été remis à « à confirmer ».";
    $("canalturfStatus").className = "status warn";
  });
  $("canalturfConfirm").addEventListener("click", () => {
    if (!pending) return;
    const selectors = statusSelects();
    if (selectors.some(select => select.value === "unknown")) {
      $("canalturfStatus").textContent = "Validation incomplète : il reste " + selectors.filter(s => s.value === "unknown").length + " statut(s) à confirmer.";
      $("canalturfStatus").className = "status warn";
      return;
    }
    const race = pending.race;
    race.runners = race.runners.map((r,i) => ({...r, status:selectors[i].value}));
    race.provenance = {source:"Canalturf",sourceUrl:race.sourceUrl};
    race.runners.forEach(r => {
      r.provenance = r.provenance || {};
      ["jockey","trainer","draw","weightKg","odds","recentForm"].forEach(k => { if (r.provenance[k]) r.provenance[k].status = "unverified"; });
    });
    window.dispatchEvent(new CustomEvent("turfv4:import-canalturf", {detail:race}));
    $("canalturfStatus").textContent = "Données transférées dans le formulaire de course. Vérifie-les puis enregistre la course si elles sont correctes.";
    $("canalturfStatus").className = "status warn";
    clear();
  });
  $("canalturfCancel").addEventListener("click", () => { clear(); $("canalturfStatus").textContent = "Aperçu annulé. Aucune donnée n’a été intégrée."; $("canalturfStatus").className = "small"; });
})();
