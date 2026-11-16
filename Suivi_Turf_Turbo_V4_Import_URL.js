/* URL-to-PDF bridge. The server endpoint enforces the LONAB host allowlist. */
(() => {
  "use strict";
  const input = document.getElementById("pdfInput");
  const readButton = document.getElementById("readPdf");
  const status = document.getElementById("pdfStatus");
  if (!input || !readButton || !status) return;

  const label = document.createElement("label");
  label.textContent = "Ou saisir le lien direct du journal PDF (LONAB)";
  const urlInput = document.createElement("input");
  urlInput.type = "url";
  urlInput.id = "pdfUrlInput";
  urlInput.inputMode = "url";
  urlInput.placeholder = "https://lonab.bf/sites/default/files/…/journal.pdf";
  urlInput.autocomplete = "url";
  label.appendChild(urlInput);

  const button = document.createElement("button");
  button.type = "button";
  button.id = "downloadPdfUrl";
  button.textContent = "Télécharger et analyser le PDF";
  button.style.marginTop = "10px";
  button.style.width = "100%";
  const section = input.closest("section");
  const anchor = document.getElementById("readPdf");
  anchor.parentElement.insertAdjacentElement("afterend", label);
  label.insertAdjacentElement("afterend", button);

  button.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
      status.textContent = "Saisis d’abord le lien direct du PDF.";
      return;
    }
    button.disabled = true;
    status.textContent = "Téléchargement sécurisé du PDF LONAB…";
    try {
      const response = await fetch("/api/pdf-proxy?url=" + encodeURIComponent(url), {
        method: "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/pdf" }
      });
      if (!response.ok) {
        let message = "Téléchargement impossible (HTTP " + response.status + ").";
        try { const data = await response.json(); if (data.error) message = data.error; } catch (_) {}
        throw new Error(message);
      }
      const blob = await response.blob();
      if (blob.size > 20 * 1024 * 1024) throw new Error("PDF supérieur à la limite de 20 Mo.");
      const file = new File([blob], "journal-lonab.pdf", { type: "application/pdf" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      status.textContent = "PDF téléchargé (" + Math.ceil(blob.size / 1024) + " Ko). Lancement de l’analyse locale…";
      readButton.click();
    } catch (error) {
      status.textContent = "Téléchargement du PDF impossible : " + (error?.message || "erreur inconnue");
    } finally {
      button.disabled = false;
    }
  });
})();
