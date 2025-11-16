// js/app.js
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("imageInput");
  const generateBtn = document.querySelector(".generate-btn");
  const tryBtn = document.querySelector(".try-btn");
  const altOut = document.getElementById("altTextOutput");
  const capOut = document.getElementById("captionOutput");
  const fileOut = document.getElementById("filenameOutput");
  const copyAlt = document.getElementById("copyAlt");
  const copyCap = document.getElementById("copyCaption");
  const copyFile = document.getElementById("copyFilename");

  let currentDataUrl = null;

  // Read file to dataURL
  input.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      currentDataUrl = reader.result; // data:image/...
      // optionally show a thumbnail or filename in UI

      // Show preview
    const preview = document.getElementById("imagePreview");
    const uploadArea = document.querySelector(".upload-area");

    preview.src = reader.result;
    preview.style.display = "block";

    // Hide upload UI + activate preview mode
    uploadArea.classList.add("preview-active");
    };
    reader.readAsDataURL(file);
  });

  async function callGenerate(keyword = "") {
    if (!currentDataUrl) {
      alert("Please choose an image first.");
      return;
    }
    // UI state
    const originalText = generateBtn ? generateBtn.textContent : null;
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = "Generating…";
    }
    altOut.textContent = "Generating alt text…";
    capOut.textContent = "Generating caption…";
    fileOut.textContent = "Generating file name…";
    altOut.classList.remove("has-content");
    capOut.classList.remove("has-content");
    fileOut.classList.remove("has-content");

    try {
      const resp = await fetch("/.netlify/functions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: currentDataUrl, keyword })
      });
      const json = await resp.json();

      if (json.error) {
        altOut.textContent = "Error: " + (json.error || json.raw || "Unknown");
        capOut.textContent = "";
        fileOut.textContent = "";
        return;
      }

      altOut.textContent = json.alt || "";
      capOut.textContent = json.caption || "";
      fileOut.textContent = json.filename || "";

      altOut.classList.add("has-content");
      capOut.classList.add("has-content");
      fileOut.classList.add("has-content");


    } catch (err) {
      altOut.textContent = "Network error";
      capOut.textContent = "";
      fileOut.textContent = "";
    } finally {
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.textContent = originalText || "Generate ALT Text";
      }
    }
  }

  // Wire up buttons
  if (generateBtn) generateBtn.addEventListener("click", () => callGenerate());
  if (tryBtn) tryBtn.addEventListener("click", () => {
    // If tryBtn exists on About page, redirect to homepage or open upload
    const uploadAnchor = document.querySelector(".upload-area");
    if (uploadAnchor) window.location.href = "/";
  });

  // Copy buttons
  function wireCopy(button, targetEl) {
    if (!button || !targetEl) return;
    button.addEventListener("click", async () => {
      const text = targetEl.textContent || targetEl.innerText;
      try {
        await navigator.clipboard.writeText(text);
        button.classList.add("copied");
        setTimeout(() => button.classList.remove("copied"), 1000);
      } catch (e) {
        // fallback
        alert("Copy failed. Select and copy manually.");
      }
    });
  }

  wireCopy(copyAlt, altOut);
  wireCopy(copyCap, capOut);
  wireCopy(copyFile, fileOut);

  // Optional: drag & drop on .upload-area
  const uploadArea = document.querySelector(".upload-area");
  if (uploadArea) {
    uploadArea.addEventListener("dragover", (e) => { e.preventDefault(); uploadArea.classList.add("dragover"); });
    uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("dragover"));
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        input.files = e.dataTransfer.files;
        const evt = new Event("change");
        input.dispatchEvent(evt);
      }
    });
  }
});
