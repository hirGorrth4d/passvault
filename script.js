/* =========================================================
   CONFIGURACIÓN
   Reemplazá esta URL por el endpoint de tu API en AWS
   (API Gateway + Lambda + DynamoDB).
   La API debe exponer:
     GET    /vault        -> lista de credenciales [{id, site, username, password}]
     POST   /vault         -> crea una credencial {site, username, password}
     DELETE /vault/{id}    -> elimina una credencial por id
   ========================================================= */
const API_BASE_URL = "https://xn6xrgjogj.execute-api.us-east-1.amazonaws.com/vault";

/* =========================================================
   Selectores
   ========================================================= */
const lengthInput = document.getElementById("length");
const lengthValueOutput = document.getElementById("lengthValue");
const optUpper = document.getElementById("optUpper");
const optNumbers = document.getElementById("optNumbers");
const optSymbols = document.getElementById("optSymbols");
const btnGenerate = document.getElementById("btnGenerate");
const genOutput = document.getElementById("genOutput");
const btnToggleGen = document.getElementById("btnToggleGen");
const btnCopyGen = document.getElementById("btnCopyGen");
const strengthMeter = document.getElementById("strengthMeter");
const genHint = document.getElementById("genHint");

const entryForm = document.getElementById("entryForm");
const siteInput = document.getElementById("site");
const userInput = document.getElementById("user");
const passwordInput = document.getElementById("password");
const btnTogglePwd = document.getElementById("btnTogglePwd");
const btnUseGenerated = document.getElementById("btnUseGenerated");
const vaultBody = document.getElementById("vaultBody");
const vaultStatus = document.getElementById("vaultStatus");

let lastGenerated = "";
let genVisible = false;

/* =========================================================
   Generador de contraseñas (100% en el navegador, sin AWS)
   ========================================================= */

lengthInput.addEventListener("input", () => {
  lengthValueOutput.textContent = lengthInput.value;
});

function randomInt(max) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

function randomChar(set) {
  return set[randomInt(set.length)];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generatePassword() {
  const length = Number(lengthInput.value);
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()_-+=?";

  const sets = [lower];
  if (optUpper.checked) sets.push(upper);
  if (optNumbers.checked) sets.push(numbers);
  if (optSymbols.checked) sets.push(symbols);

  const pool = sets.join("");

  // garantiza al menos un carácter de cada set elegido
  let chars = sets.map((set) => randomChar(set));
  while (chars.length < length) {
    chars.push(randomChar(pool));
  }
  return shuffle(chars).slice(0, length).join("");
}

function calculateStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

function renderStrength(score) {
  const segments = strengthMeter.querySelectorAll("span");
  segments.forEach((seg, i) => {
    seg.classList.remove("lit-weak", "lit-ok", "lit-strong");
    if (i < score) {
      seg.classList.add(score <= 1 ? "lit-weak" : score <= 2 ? "lit-ok" : "lit-strong");
    }
  });
}

function renderGenOutput() {
  const placeholderLength = lastGenerated.length || Number(lengthInput.value);
  genOutput.textContent = genVisible ? lastGenerated : "•".repeat(placeholderLength);
  btnToggleGen.setAttribute("aria-pressed", String(genVisible));
  btnToggleGen.textContent = genVisible ? "🙈" : "👁";
}

btnGenerate.addEventListener("click", () => {
  lastGenerated = generatePassword();
  genVisible = true;
  renderGenOutput();
  renderStrength(calculateStrength(lastGenerated));
  genHint.textContent = "Contraseña generada. Copiala o usala en el formulario de abajo.";
  btnUseGenerated.disabled = false;
});

btnToggleGen.addEventListener("click", () => {
  if (!lastGenerated) return;
  genVisible = !genVisible;
  renderGenOutput();
});

btnUseGenerated.addEventListener("click", () => {
  if (!lastGenerated) return;
  passwordInput.value = lastGenerated;
});

btnTogglePwd.addEventListener("click", () => {
  const showing = passwordInput.type === "text";
  passwordInput.type = showing ? "password" : "text";
  btnTogglePwd.setAttribute("aria-pressed", String(!showing));
  btnTogglePwd.textContent = showing ? "👁" : "🙈";
});

/* =========================================================
   Copiar al portapapeles
   ========================================================= */

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

function flashHint(el, message) {
  const prev = el.textContent;
  el.textContent = message;
  setTimeout(() => {
    el.textContent = prev;
  }, 1800);
}

btnCopyGen.addEventListener("click", async () => {
  if (!lastGenerated) return;
  await copyToClipboard(lastGenerated);
  flashHint(genHint, "Copiada al portapapeles.");
});

/* =========================================================
   Bóveda (fetch a la API en AWS: GET / POST / DELETE)
   ========================================================= */

function isApiConfigured() {
  return !API_BASE_URL.includes("TU-API-ID");
}

function setStatus(message, isError = false) {
  vaultStatus.textContent = message;
  vaultStatus.classList.toggle("status-error", Boolean(isError));
}

async function loadVault() {
  if (!isApiConfigured()) {
    setStatus("Configurá API_BASE_URL en script.js para conectar con tu API.", true);
    return;
  }
  try {
    const res = await fetch(API_BASE_URL, { method: "GET" });
    if (!res.ok) throw new Error("GET " + res.status);
    const data = await res.json();
    renderVault(data);
    setStatus("");
  } catch (err) {
    setStatus("No se pudo cargar la bóveda. Revisá la conexión con la API.", true);
  }
}

function renderVault(items) {
  vaultBody.innerHTML = "";
  if (!items || items.length === 0) {
    vaultBody.innerHTML =
      '<tr class="empty-row"><td colspan="4">La bóveda está vacía. Agregá tu primera credencial.</td></tr>';
    return;
  }
  items.forEach((item) => vaultBody.appendChild(buildRow(item)));
}

function buildRow(item) {
  const tr = document.createElement("tr");
  tr.dataset.id = item.id;

  const tdSite = document.createElement("td");
  tdSite.textContent = item.site;

  const tdUser = document.createElement("td");
  tdUser.textContent = item.username;

  const tdPass = document.createElement("td");
  const passSpan = document.createElement("span");
  passSpan.className = "masked";
  let passVisible = false;
  passSpan.textContent = "•".repeat(Math.min(item.password.length, 16));

  const btnToggleRow = document.createElement("button");
  btnToggleRow.type = "button";
  btnToggleRow.className = "icon-btn";
  btnToggleRow.setAttribute("aria-label", "Mostrar contraseña");
  btnToggleRow.textContent = "👁";
  btnToggleRow.addEventListener("click", () => {
    passVisible = !passVisible;
    passSpan.textContent = passVisible
      ? item.password
      : "•".repeat(Math.min(item.password.length, 16));
    btnToggleRow.textContent = passVisible ? "🙈" : "👁";
  });

  tdPass.appendChild(passSpan);
  tdPass.appendChild(btnToggleRow);

  const tdActions = document.createElement("td");

  const btnCopyRow = document.createElement("button");
  btnCopyRow.type = "button";
  btnCopyRow.className = "icon-btn";
  btnCopyRow.setAttribute("aria-label", "Copiar contraseña");
  btnCopyRow.textContent = "⧉";
  btnCopyRow.addEventListener("click", async () => {
    await copyToClipboard(item.password);
    setStatus("Contraseña de " + item.site + " copiada.");
  });

  const btnDelete = document.createElement("button");
  btnDelete.type = "button";
  btnDelete.className = "btn btn-danger";
  btnDelete.textContent = "Eliminar";
  btnDelete.addEventListener("click", () => deleteEntry(item.id, tr));

  tdActions.appendChild(btnCopyRow);
  tdActions.appendChild(btnDelete);

  tr.append(tdSite, tdUser, tdPass, tdActions);
  return tr;
}

entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isApiConfigured()) {
    setStatus("Configurá API_BASE_URL en script.js antes de guardar.", true);
    return;
  }

  const payload = {
    site: siteInput.value.trim(),
    username: userInput.value.trim(),
    password: passwordInput.value,
  };
  if (!payload.site || !payload.username || !payload.password) return;

  try {
    const res = await fetch(API_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("POST " + res.status);

    entryForm.reset();
    passwordInput.type = "password";
    btnTogglePwd.textContent = "👁";
    await loadVault();
    setStatus("Credencial guardada.");
  } catch (err) {
    setStatus("No se pudo guardar la credencial.", true);
  }
});

async function deleteEntry(id, rowEl) {
  const confirmed = window.confirm("¿Eliminar esta credencial?");
  if (!confirmed) return;

  try {
    const res = await fetch(`${API_BASE_URL}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("DELETE " + res.status);

    rowEl.remove();
    if (!vaultBody.children.length) {
      vaultBody.innerHTML =
        '<tr class="empty-row"><td colspan="4">La bóveda está vacía. Agregá tu primera credencial.</td></tr>';
    }
    setStatus("Credencial eliminada.");
  } catch (err) {
    setStatus("No se pudo eliminar la credencial.", true);
  }
}

/* =========================================================
   Inicialización
   ========================================================= */

renderGenOutput();
loadVault();
