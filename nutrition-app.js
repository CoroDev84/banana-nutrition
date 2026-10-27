import { initWellness } from "./wellness-ui.js?v=20261025-redesign";
import {
  auth,
  completeRedirectSignIn,
  getApiBaseUrl,
  getCurrentToken,
  isApiConfigured,
  onUserChanged,
  signOutUser,
} from "./nutrition-firebase.js?v=20261027-github";

const state = {
  currentDate: localDateString(new Date()),
  currentScreen: null,
  dayRequest: 0,
  entrySaving: false,
  editingEntryId: null,
  baseEntryMacros: null,
  baseEntryNutrients: null,
  entries: [],
  favorites: [],
  savedMeals: [],
  foodSearchDebounceId: null,
  foodSearchRequestId: 0,
  foodSearchResults: [],
  scannerDetector: null,
  scannerControls: null,
  scannerLibraryPromise: null,
  scannerResultPending: false,
  scannerStream: null,
  scannerTimerId: null,
};

const macroFieldIds = ["calories", "protein", "carbs", "fat"];
const nutrientFieldDefinitions = [
  { key: "fiber", inputId: "nutrient-fiber", label: "Fiber", unit: "g" },
  { key: "sugars", inputId: "nutrient-sugars", label: "Sugars", unit: "g" },
  { key: "addedSugars", inputId: "nutrient-added-sugars", label: "Added sugars", unit: "g" },
  { key: "saturatedFat", inputId: "nutrient-saturated-fat", label: "Sat fat", unit: "g" },
  { key: "transFat", inputId: "nutrient-trans-fat", label: "Trans fat", unit: "g" },
  { key: "cholesterol", inputId: "nutrient-cholesterol", label: "Cholesterol", unit: "mg" },
  { key: "sodium", inputId: "nutrient-sodium", label: "Sodium", unit: "mg" },
  { key: "potassium", inputId: "nutrient-potassium", label: "Potassium", unit: "mg" },
  { key: "calcium", inputId: "nutrient-calcium", label: "Calcium", unit: "mg" },
  { key: "iron", inputId: "nutrient-iron", label: "Iron", unit: "mg" },
  { key: "vitaminD", inputId: "nutrient-vitamin-d", label: "Vitamin D", unit: "mcg" },
];
const dailyNutrientTotalKeys = ["fiber", "sugars", "sodium", "saturatedFat"];
const foodSearchMinLength = 3;
const foodSearchDebounceMs = 350;
const defaultAppScreen = "today";
const preferredBarcodeFormats = ["ean_13", "ean_8", "upc_a", "upc_e"];
const zxingBrowserScriptUrl = "https://unpkg.com/@zxing/browser@0.1.5";

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function getLoginPagePath() {
  return document.body?.dataset.loginPage || "login.html";
}

function getAppScreenElements() {
  return Array.from(document.querySelectorAll("[data-app-screen]"));
}

function normalizeAppScreen(screenId) {
  const normalizedScreenId = String(screenId || "").trim().toLowerCase();
  const availableScreenIds = getAppScreenElements()
    .map((element) => element.dataset.appScreen)
    .filter(Boolean);

  if (!availableScreenIds.length) {
    return normalizedScreenId || defaultAppScreen;
  }

  return availableScreenIds.includes(normalizedScreenId) ? normalizedScreenId : defaultAppScreen;
}

function applyAppScreen(screenId) {
  const resolvedScreenId = normalizeAppScreen(screenId);
  const previousScreenId = state.currentScreen;
  state.currentScreen = resolvedScreenId;

  if (previousScreenId === "scan" && resolvedScreenId !== "scan") {
    stopBarcodeScanner({ keepStatus: true });
  }

  getAppScreenElements().forEach((element) => {
    const isActive = element.dataset.appScreen === resolvedScreenId;
    element.hidden = !isActive;
    element.classList.toggle("active", isActive);
    element.setAttribute("aria-hidden", String(!isActive));
  });

  document.querySelectorAll("[data-screen-link]").forEach((element) => {
    if (element.dataset.screenLink === resolvedScreenId) {
      element.setAttribute("aria-current", "page");
      return;
    }
    element.removeAttribute("aria-current");
  });

  const foodScreens = ["meals", "log", "scan", "saved", "saved-meals"];
  document.getElementById("food-tabs").hidden = !foodScreens.includes(resolvedScreenId);
  document.getElementById("day-controls").hidden = !["today", "meals", "saved", "saved-meals"].includes(resolvedScreenId);
  document.querySelectorAll(".bottom-dock [data-screen-link]").forEach(link => {
    const active = link.dataset.screenLink === (foodScreens.includes(resolvedScreenId) ? "meals" : resolvedScreenId === "targets" ? "today" : resolvedScreenId.startsWith("fitness-") ? "goals" : resolvedScreenId);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
  return resolvedScreenId;
}

function setAppScreen(screenId, { replaceHash = false } = {}) {
  const resolvedScreenId = normalizeAppScreen(screenId);
  const nextHash = `#${resolvedScreenId}`;

  if (replaceHash) {
    const url = new URL(window.location.href);
    url.hash = resolvedScreenId;
    window.history.replaceState(null, "", url);
    applyAppScreen(resolvedScreenId);
    return resolvedScreenId;
  }

  if (window.location.hash === nextHash) {
    applyAppScreen(resolvedScreenId);
    return resolvedScreenId;
  }

  window.location.hash = resolvedScreenId;
  return resolvedScreenId;
}

function syncAppScreenFromHash() {
  const requestedScreenId = window.location.hash.replace(/^#/, "") || defaultAppScreen;
  applyAppScreen(requestedScreenId);
}

function setBanner(message, variant = "") {
  const banner = document.getElementById("app-status");
  banner.textContent = message;
  banner.className = "status-banner visible";
  if (variant) {
    banner.classList.add(variant);
  }
}

function clearBanner() {
  const banner = document.getElementById("app-status");
  banner.textContent = "";
  banner.className = "status-banner";
}

function roundMacroValue(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function getServingMultiplierValue() {
  const value = Number(document.getElementById("serving-multiplier").value || 1);
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return value;
}

function formatServingAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  const rounded = Math.round(number * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function formatServingMeasure(food) {
  const label = String(food?.servingLabel || "").trim();
  if (label) {
    return label;
  }

  const amount = formatServingAmount(food?.servingSize);
  const unit = String(food?.servingUnit || "").trim();
  return [amount, unit].filter(Boolean).join(" ") || "";
}

function getServingSizeValue() {
  const value = Number(getOptionalInputValue("serving-size") || "");
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getOptionalInputValue(id) {
  return document.getElementById(id)?.value || "";
}

function setOptionalInputValue(id, value) {
  const input = document.getElementById(id);
  if (input) {
    input.value = value ?? "";
  }
}

function readMacroFormValues() {
  return {
    calories: Number(document.getElementById("calories").value || 0),
    protein: Number(document.getElementById("protein").value || 0),
    carbs: Number(document.getElementById("carbs").value || 0),
    fat: Number(document.getElementById("fat").value || 0),
  };
}

function writeMacroFormValues(macros) {
  macroFieldIds.forEach((fieldId) => {
    document.getElementById(fieldId).value = roundMacroValue(macros[fieldId] || 0).toFixed(1);
  });
}

function roundNutrientValue(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function normalizeNutrients(nutrients = {}) {
  return nutrientFieldDefinitions.reduce((values, field) => {
    const value = nutrients?.[field.key];
    values[field.key] = value === null || value === undefined || value === "" ? null : Number(value);
    return values;
  }, {});
}

function readNutrientFormValues() {
  return nutrientFieldDefinitions.reduce((values, field) => {
    const input = document.getElementById(field.inputId);
    if (!input || input.value === "") {
      return values;
    }
    const value = Number(input.value);
    if (Number.isFinite(value) && value >= 0) {
      values[field.key] = value;
    }
    return values;
  }, {});
}

function writeNutrientFormValues(nutrients = {}) {
  nutrientFieldDefinitions.forEach((field) => {
    const input = document.getElementById(field.inputId);
    if (!input) {
      return;
    }
    const value = nutrients?.[field.key];
    input.value = value === null || value === undefined || value === "" ? "" : roundNutrientValue(value).toFixed(1);
  });
}

function setBaseEntryMacros(macros) {
  state.baseEntryMacros = {
    calories: Number(macros.calories || 0),
    protein: Number(macros.protein || 0),
    carbs: Number(macros.carbs || 0),
    fat: Number(macros.fat || 0),
  };
}

function setBaseEntryNutrients(nutrients = {}) {
  state.baseEntryNutrients = normalizeNutrients(nutrients);
}

function scaleNutrientsForMultiplier(nutrients = {}, divisor = 1) {
  return Object.fromEntries(
    nutrientFieldDefinitions.map((field) => {
      const value = nutrients?.[field.key];
      return [
        field.key,
        value === null || value === undefined || value === "" ? null : Number(value) / divisor,
      ];
    })
  );
}

function syncBaseMacrosFromForm() {
  const multiplier = getServingMultiplierValue();
  const currentMacros = readMacroFormValues();
  setBaseEntryMacros({
    calories: currentMacros.calories / multiplier,
    protein: currentMacros.protein / multiplier,
    carbs: currentMacros.carbs / multiplier,
    fat: currentMacros.fat / multiplier,
  });
}

function syncBaseNutrientsFromForm() {
  const multiplier = getServingMultiplierValue();
  const currentNutrients = readNutrientFormValues();
  const baseNutrients = nutrientFieldDefinitions.reduce((values, field) => {
    if (currentNutrients[field.key] !== undefined) {
      values[field.key] = currentNutrients[field.key] / multiplier;
    }
    return values;
  }, {});
  setBaseEntryNutrients(baseNutrients);
}

function applyServingMultiplierToForm() {
  const multiplier = getServingMultiplierValue();
  if (state.baseEntryMacros) {
    writeMacroFormValues({
      calories: state.baseEntryMacros.calories * multiplier,
      protein: state.baseEntryMacros.protein * multiplier,
      carbs: state.baseEntryMacros.carbs * multiplier,
      fat: state.baseEntryMacros.fat * multiplier,
    });
  }

  if (state.baseEntryNutrients) {
    const nutrients = nutrientFieldDefinitions.reduce((values, field) => {
      const value = state.baseEntryNutrients[field.key];
      values[field.key] = value === null || value === undefined ? null : value * multiplier;
      return values;
    }, {});
    writeNutrientFormValues(nutrients);
  }
}

function applyFoodToEntryForm(food) {
  document.getElementById("entry-food-id").value = food.sourceId ? `${food.source}:${food.sourceId}` : "";
  document.getElementById("food-name").value = food.name || "";
  document.getElementById("brand-name").value = food.brand || "";
  document.getElementById("barcode-snapshot").value = food.barcode || "";
  document.getElementById("barcode-input").value = food.barcode || "";
  setOptionalInputValue("serving-size", food.servingSize || "");
  setOptionalInputValue("serving-unit", food.servingUnit || "");
  setOptionalInputValue("serving-label", formatServingMeasure(food));
  setBaseEntryMacros({
    calories: food.calories ?? 0,
    protein: food.protein ?? 0,
    carbs: food.carbs ?? 0,
    fat: food.fat ?? 0,
  });
  setBaseEntryNutrients(food.nutrients || {});
  applyServingMultiplierToForm();
}

function setFoodSearchStatus(message, variant = "") {
  const status = document.getElementById("food-search-status");
  status.textContent = message;
  status.className = "search-status small-note";
  if (variant) {
    status.classList.add(variant);
  }
}

function renderFoodSearchResults(foods) {
  const container = document.getElementById("food-search-results");
  if (!foods.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = foods
    .map((food) => {
      const summary = [food.brand || "No brand", food.servingLabel].filter(Boolean).join(" | ");
      return `
        <button type="button" class="food-search-result" data-select-food-search="${food.fdcId}">
          <strong>${escapeHtml(food.name)}</strong>
          <div class="small-note">${escapeHtml(summary || "Tap to load this USDA food into the entry form.")}</div>
          <div class="food-search-meta">
            <span><strong>${Number(food.calories || 0).toFixed(1)}</strong> cal</span>
            <span><strong>${Number(food.protein || 0).toFixed(1)}</strong> P</span>
            <span><strong>${Number(food.carbs || 0).toFixed(1)}</strong> C</span>
            <span><strong>${Number(food.fat || 0).toFixed(1)}</strong> F</span>
          </div>
          ${renderNutrientRow(food.nutrients, ["fiber", "sugars", "sodium"])}
        </button>
      `;
    })
    .join("");
}

function clearFoodSearchUi({ keepStatus = false } = {}) {
  if (state.foodSearchDebounceId) {
    window.clearTimeout(state.foodSearchDebounceId);
    state.foodSearchDebounceId = null;
  }

  state.foodSearchRequestId += 1;
  state.foodSearchResults = [];
  renderFoodSearchResults([]);
  if (!keepStatus) {
    setFoodSearchStatus("");
  }
}

function setScannerStatus(message, variant = "") {
  const status = document.getElementById("barcode-scan-status");
  status.textContent = message;
  status.className = "scanner-status small-note";
  if (variant) {
    status.classList.add(variant);
  }
}

function updateScannerUi(isActive) {
  document.getElementById("barcode-scan-start").hidden = isActive;
  document.getElementById("barcode-scan-stop").hidden = !isActive;
  document.getElementById("barcode-scan-shell").hidden = !isActive;
}

function normalizeBarcodeValue(rawValue) {
  const compactValue = String(rawValue || "").trim().replace(/\s+/g, "");
  const digitsOnly = compactValue.replace(/\D/g, "");
  return /^\d{8,14}$/.test(digitsOnly) ? digitsOnly : "";
}

async function getBarcodeDetectorInstance() {
  if (!("BarcodeDetector" in window)) {
    return null;
  }

  if (state.scannerDetector) {
    return state.scannerDetector;
  }

  let formats = preferredBarcodeFormats;
  if (typeof window.BarcodeDetector.getSupportedFormats === "function") {
    try {
      const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
      const matchingFormats = preferredBarcodeFormats.filter((format) => supportedFormats.includes(format));
      if (matchingFormats.length) {
        formats = matchingFormats;
      }
    } catch (error) {
      // Fall back to the preferred formats if the browser cannot report them.
    }
  }

  state.scannerDetector = new window.BarcodeDetector({ formats });
  return state.scannerDetector;
}

function loadScannerLibrary() {
  if (window.ZXingBrowser) {
    return Promise.resolve(window.ZXingBrowser);
  }

  if (state.scannerLibraryPromise) {
    return state.scannerLibraryPromise;
  }

  state.scannerLibraryPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-scanner-lib="zxing-browser"][src="${zxingBrowserScriptUrl}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.ZXingBrowser), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Unable to load the barcode scanner library.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = zxingBrowserScriptUrl;
    script.async = true;
    script.dataset.scannerLib = "zxing-browser";
    script.addEventListener("load", () => {
      if (window.ZXingBrowser) {
        resolve(window.ZXingBrowser);
        return;
      }
      reject(new Error("The barcode scanner library loaded without exposing the expected browser API."));
    }, { once: true });
    script.addEventListener("error", () => {
      reject(new Error("Unable to load the barcode scanner library."));
    }, { once: true });
    document.head.appendChild(script);
  }).catch((error) => {
    state.scannerLibraryPromise = null;
    throw error;
  });

  return state.scannerLibraryPromise;
}

function stopBarcodeScanner({ keepStatus = false } = {}) {
  if (state.scannerTimerId) {
    window.clearTimeout(state.scannerTimerId);
    state.scannerTimerId = null;
  }

  state.scannerResultPending = false;

  if (state.scannerControls?.stop) {
    try {
      state.scannerControls.stop();
    } catch (error) {
      // Ignore stop errors while tearing down the scanner.
    }
    state.scannerControls = null;
  }

  if (state.scannerStream) {
    state.scannerStream.getTracks().forEach((track) => track.stop());
    state.scannerStream = null;
  }

  const video = document.getElementById("barcode-camera-preview");
  if (video.srcObject) {
    video.pause();
    video.srcObject = null;
  }

  updateScannerUi(false);
  if (!keepStatus) {
    setScannerStatus("Camera stopped. You can type the barcode or start the camera again.");
  }
}

async function lookupBarcodeValue(barcode) {
  const normalizedBarcode = normalizeBarcodeValue(barcode);
  if (!normalizedBarcode) {
    throw new Error("Enter a valid UPC or EAN barcode first.");
  }

  document.getElementById("barcode-input").value = normalizedBarcode;
  setBanner("Looking up barcode...", "success");

  const food = await apiFetch(`/api/foods/lookup?barcode=${encodeURIComponent(normalizedBarcode)}`);
  applyFoodToEntryForm({
    ...food,
    barcode: food.barcode || normalizedBarcode,
  });
  clearFoodSearchUi();
  document.getElementById("lookup-result").innerHTML = `
    <strong>${escapeHtml(food.name)}</strong>
    <div class="small-note">
      ${escapeHtml(food.brand || "No brand")} | ${escapeHtml(food.servingLabel || "Serving info unavailable")} | source: ${escapeHtml(food.source)}
    </div>
  `;
  setAppScreen("log", { replaceHash: true });
  setBanner("Barcode data loaded into the entry form.", "success");
}

async function scanBarcodeFrame() {
  if (!state.scannerDetector || !state.scannerStream || state.scannerResultPending) {
    return;
  }

  const video = document.getElementById("barcode-camera-preview");
  try {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const detections = await state.scannerDetector.detect(video);
      const detectedBarcode = detections
        .map((item) => normalizeBarcodeValue(item.rawValue))
        .find(Boolean);

      if (detectedBarcode) {
        state.scannerResultPending = true;
        setScannerStatus(`Detected ${detectedBarcode}. Looking up barcode...`, "success");
        stopBarcodeScanner({ keepStatus: true });
        await lookupBarcodeValue(detectedBarcode);
        return;
      }
    }
  } catch (error) {
    // Keep scanning. Some browsers throw intermittently before the camera frame is stable.
  }

  if (state.scannerStream) {
    state.scannerTimerId = window.setTimeout(() => {
      scanBarcodeFrame();
    }, 250);
  }
}

async function startZxingBarcodeScanner() {
  setScannerStatus("Loading barcode scanner support...", "success");
  const ZXingBrowser = await loadScannerLibrary();

  stopBarcodeScanner({ keepStatus: true });

  const video = document.getElementById("barcode-camera-preview");
  const reader = new ZXingBrowser.BrowserMultiFormatReader();
  state.scannerResultPending = false;

  updateScannerUi(true);
  setScannerStatus("Starting camera...", "success");

  const controls = await reader.decodeFromConstraints(
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    video,
    async (result) => {
      if (!result || state.scannerResultPending) {
        return;
      }

      const rawText = typeof result.getText === "function" ? result.getText() : result.text;
      const detectedBarcode = normalizeBarcodeValue(rawText);
      if (!detectedBarcode) {
        return;
      }

      state.scannerResultPending = true;
      setScannerStatus(`Detected ${detectedBarcode}. Looking up barcode...`, "success");
      stopBarcodeScanner({ keepStatus: true });
      try {
        await lookupBarcodeValue(detectedBarcode);
      } catch (error) {
        document.getElementById("lookup-result").textContent = "";
        setBanner(error.message || "Barcode lookup failed.", "error");
      }
    }
  );

  state.scannerControls = controls || null;
  state.scannerStream = video.srcObject instanceof MediaStream ? video.srcObject : null;
  setScannerStatus("Camera ready. Center the barcode inside the frame.", "success");
}

async function startBarcodeScanner() {
  if (!window.isSecureContext) {
    setScannerStatus("Camera scanning requires HTTPS or localhost.", "error");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setScannerStatus("This browser cannot access the camera. Enter the barcode manually.", "error");
    return;
  }

  const detector = await getBarcodeDetectorInstance();
  if (!detector) {
    try {
      await startZxingBarcodeScanner();
    } catch (error) {
      stopBarcodeScanner({ keepStatus: true });
      setScannerStatus(error.message || "This browser does not support live barcode scanning yet. Enter the barcode manually.", "error");
    }
    return;
  }

  stopBarcodeScanner({ keepStatus: true });
  state.scannerResultPending = false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    state.scannerStream = stream;

    const video = document.getElementById("barcode-camera-preview");
    video.srcObject = stream;
    await video.play();

    updateScannerUi(true);
    setScannerStatus("Camera ready. Center the barcode inside the frame.", "success");
    await scanBarcodeFrame();
  } catch (error) {
    stopBarcodeScanner({ keepStatus: true });
    if (error?.name === "NotAllowedError") {
      setScannerStatus("Camera permission was denied. Allow camera access and try again.", "error");
      return;
    }
    setScannerStatus(error.message || "Unable to start the camera scanner.", "error");
  }
}

async function apiFetch(path, options = {}) {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("Set the Cloud Run URL in nutrition-config.js before using the live tracker.");
  }

  const token = await getCurrentToken();
  if (!token) {
    throw new Error("No Firebase user is signed in.");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const detail = payload?.detail;
    const error = new Error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map(item => item.msg).join("; ") : `Request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function updateProfile(user, profile = null) {
  document.getElementById("profile-email").textContent = profile?.email || user.email || "Unknown user";
  document.getElementById("profile-name").textContent = profile?.displayName || user.displayName || "Nutrition tracker";

  const photo = document.getElementById("profile-photo");
  const photoUrl = profile?.photoUrl || user.photoURL;
  if (photoUrl) {
    photo.src = photoUrl;
    photo.hidden = false;
  } else {
    photo.hidden = true;
  }
}

function updateTotals(totals) {
  wellness.drawNutrition(totals);
}

function formatMealLabel(meal) {
  const normalizedMeal = String(meal || "").trim();
  if (!normalizedMeal) {
    return "Meal";
  }
  return normalizedMeal.charAt(0).toUpperCase() + normalizedMeal.slice(1);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNutrientValue(value, unit) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "";
  }
  return `${numericValue.toFixed(1)} ${unit}`;
}

function renderNutrientRow(nutrients = {}, keys = null) {
  const allowedKeys = keys || nutrientFieldDefinitions.map((field) => field.key);
  const items = nutrientFieldDefinitions
    .filter((field) => allowedKeys.includes(field.key))
    .map((field) => {
      const value = nutrients?.[field.key];
      if (value === null || value === undefined || value === "") {
        return "";
      }
      return `<span><strong>${escapeHtml(field.label)}:</strong> ${escapeHtml(formatNutrientValue(value, field.unit))}</span>`;
    })
    .filter(Boolean);

  if (!items.length) {
    return "";
  }

  return `<div class="nutrient-row">${items.join("")}</div>`;
}

function renderEntries(entries) {
  const meals = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
  };

  entries.forEach((entry) => {
    meals[entry.meal].push(entry);
  });

  document.querySelectorAll("[data-meal-column]").forEach((column) => {
    const meal = column.getAttribute("data-meal-column");
    const items = meals[meal];
    const list = column.querySelector(".entry-list");
    if (!items.length) {
      list.innerHTML = '<div class="empty-state">No entries yet.</div>';
      return;
    }

    list.innerHTML = items
      .map(
        (entry) => {
          const servingMeasure = formatServingMeasure(entry);
          return `
            <article class="entry-card">
            <div class="entry-card-header">
              <div>
                <strong>${escapeHtml(entry.foodNameSnapshot)}</strong>
                <div class="small-note">${escapeHtml(entry.brandSnapshot || "No brand")}</div>
                ${servingMeasure ? `<div class="small-note">Measure: ${escapeHtml(servingMeasure)}</div>` : ""}
              </div>
              <div class="small-note">x${Number(entry.servingMultiplier).toFixed(2)}</div>
            </div>
            <div class="entry-card-footer">
              <div class="macro-row">
                <span><strong>${Number(entry.calories).toFixed(1)}</strong> cal</span>
                <span><strong>${Number(entry.protein).toFixed(1)}</strong> P</span>
                <span><strong>${Number(entry.carbs).toFixed(1)}</strong> C</span>
                <span><strong>${Number(entry.fat).toFixed(1)}</strong> F</span>
              </div>
              ${renderNutrientRow(entry.nutrients)}
              <div class="actions-row">
                <button type="button" class="secondary-action" data-edit-entry="${entry.id}">Edit</button>
                <button type="button" class="danger-action" data-delete-entry="${entry.id}">Delete</button>
              </div>
            </div>
            ${entry.notes ? `<div class="small-note">${escapeHtml(entry.notes)}</div>` : ""}
          </article>
        `;
        }
      )
      .join("");
  });
}

function renderFavorites(favorites) {
  const list = document.getElementById("favorites-list");
  if (!favorites.length) {
    list.innerHTML = '<div class="empty-state">No favorites yet. Fill the form once, then save it here.</div>';
    return;
  }

  list.innerHTML = favorites
    .map(
      (favorite) => {
        const servingMeasure = formatServingMeasure(favorite);
        return `
          <article class="entry-card">
          <div class="entry-card-header">
            <div>
              <strong>${escapeHtml(favorite.foodNameSnapshot)}</strong>
              <div class="small-note">
                ${escapeHtml(favorite.brandSnapshot || "No brand")} | ${escapeHtml(formatMealLabel(favorite.meal))}
              </div>
              ${servingMeasure ? `<div class="small-note">Measure: ${escapeHtml(servingMeasure)}</div>` : ""}
            </div>
            <div class="small-note">Default x${Number(favorite.servingMultiplier).toFixed(2)}</div>
          </div>
          <div class="entry-card-footer">
            <div class="macro-row">
              <span><strong>${Number(favorite.calories).toFixed(1)}</strong> cal</span>
              <span><strong>${Number(favorite.protein).toFixed(1)}</strong> P</span>
              <span><strong>${Number(favorite.carbs).toFixed(1)}</strong> C</span>
              <span><strong>${Number(favorite.fat).toFixed(1)}</strong> F</span>
            </div>
            ${renderNutrientRow(favorite.nutrients)}
            <div class="actions-row">
              <button type="button" class="secondary-action" data-use-favorite="${favorite.id}">Load into Form</button>
              <button type="button" class="danger-action" data-delete-favorite="${favorite.id}">Delete</button>
            </div>
          </div>
          ${favorite.notes ? `<div class="small-note">${escapeHtml(favorite.notes)}</div>` : ""}
        </article>
      `;
      }
    )
    .join("");
}

function getSavedMealTotals(savedMeal) {
  const items = savedMeal.items || [];
  return items.reduce(
    (totals, item) => {
      nutrientFieldDefinitions.forEach((field) => {
        totals.nutrients[field.key] += Number(item.nutrients?.[field.key] || 0);
      });

      return {
        calories: totals.calories + Number(item.calories || 0),
        protein: totals.protein + Number(item.protein || 0),
        carbs: totals.carbs + Number(item.carbs || 0),
        fat: totals.fat + Number(item.fat || 0),
        nutrients: totals.nutrients,
      };
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      nutrients: Object.fromEntries(nutrientFieldDefinitions.map((field) => [field.key, 0])),
    }
  );
}

function renderSavedMeals(savedMeals) {
  const list = document.getElementById("saved-meals-list");
  if (!savedMeals.length) {
    list.innerHTML = '<div class="empty-state">No saved meals yet. Log multiple items in Meals, then save the group here.</div>';
    return;
  }

  list.innerHTML = savedMeals
    .map((savedMeal) => {
      const totals = getSavedMealTotals(savedMeal);
      const nutrientTotals = Object.fromEntries(
        Object.entries(totals.nutrients || {}).filter(([, value]) => Number(value || 0) > 0)
      );
      const items = savedMeal.items || [];
      const itemNames = items
        .map((item) => escapeHtml(item.foodNameSnapshot))
        .join(", ");

      return `
        <article class="entry-card">
          <div class="entry-card-header">
            <div>
              <strong>${escapeHtml(savedMeal.name)}</strong>
              <div class="small-note">
                ${escapeHtml(formatMealLabel(savedMeal.meal))} | ${items.length} item${items.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
          <div class="small-note">${itemNames}</div>
          <div class="entry-card-footer">
            <div class="macro-row">
              <span><strong>${totals.calories.toFixed(1)}</strong> cal</span>
              <span><strong>${totals.protein.toFixed(1)}</strong> P</span>
              <span><strong>${totals.carbs.toFixed(1)}</strong> C</span>
              <span><strong>${totals.fat.toFixed(1)}</strong> F</span>
            </div>
            ${renderNutrientRow(nutrientTotals, ["fiber", "sugars", "sodium"])}
            <div class="actions-row">
              <button type="button" class="primary-action" data-load-saved-meal="${savedMeal.id}">Log Meal</button>
              <button type="button" class="danger-action" data-delete-saved-meal="${savedMeal.id}">Delete</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function bindFoodSearchActions() {
  document.querySelectorAll("[data-select-food-search]").forEach((button) => {
    button.addEventListener("click", async () => {
      const fdcId = Number(button.dataset.selectFoodSearch);
      if (!Number.isInteger(fdcId) || fdcId <= 0) {
        return;
      }

      clearBanner();
      setFoodSearchStatus("Loading USDA nutrition details...", "success");
      try {
        const food = await apiFetch(`/api/foods/fdc/${fdcId}`);
        applyFoodToEntryForm(food);
        document.getElementById("lookup-result").textContent = "";
        clearFoodSearchUi({ keepStatus: true });
        setFoodSearchStatus(`${food.name} loaded from USDA.`, "success");
        setBanner("Food data loaded into the entry form.", "success");
      } catch (error) {
        setFoodSearchStatus(error.message || "Unable to load USDA food details.", "error");
        setBanner(error.message || "Unable to load USDA food details.", "error");
      }
    });
  });
}

function queueFoodSearch(query) {
  const normalizedQuery = query.trim();
  if (state.foodSearchDebounceId) {
    window.clearTimeout(state.foodSearchDebounceId);
    state.foodSearchDebounceId = null;
  }

  state.foodSearchRequestId += 1;
  const requestId = state.foodSearchRequestId;

  if (normalizedQuery.length < foodSearchMinLength) {
    state.foodSearchResults = [];
    renderFoodSearchResults([]);
    if (!normalizedQuery) {
      setFoodSearchStatus("");
      return;
    }

    setFoodSearchStatus(`Type ${foodSearchMinLength} or more letters to search USDA foods.`);
    return;
  }

  setFoodSearchStatus("Searching USDA foods...", "success");
  state.foodSearchDebounceId = window.setTimeout(async () => {
    try {
      const payload = await apiFetch(`/api/foods/search?q=${encodeURIComponent(normalizedQuery)}`);
      if (requestId !== state.foodSearchRequestId) {
        return;
      }

      state.foodSearchResults = payload.foods || [];
      renderFoodSearchResults(state.foodSearchResults);
      bindFoodSearchActions();

      if (state.foodSearchResults.length) {
        setFoodSearchStatus("Select a USDA match to load serving size and macros.", "success");
        return;
      }

      setFoodSearchStatus(`No USDA matches found for "${normalizedQuery}".`, "error");
    } catch (error) {
      if (requestId !== state.foodSearchRequestId) {
        return;
      }

      state.foodSearchResults = [];
      renderFoodSearchResults([]);
      setFoodSearchStatus(error.message || "Unable to search USDA foods.", "error");
    }
  }, foodSearchDebounceMs);
}

function resetEntryForm() {
  state.editingEntryId = null;
  state.baseEntryMacros = null;
  state.baseEntryNutrients = null;
  document.getElementById("entry-form").reset();
  document.getElementById("entry-date").value = state.currentDate;
  document.getElementById("serving-multiplier").value = "1";
  document.getElementById("entry-submit").textContent = "Save Entry";
  document.getElementById("entry-cancel").hidden = true;
  document.getElementById("entry-food-id").value = "";
  setOptionalInputValue("serving-size", "");
  setOptionalInputValue("serving-unit", "");
  setOptionalInputValue("serving-label", "");
  writeNutrientFormValues({});
  document.getElementById("lookup-result").textContent = "";
  clearFoodSearchUi();
}

function fillEntryForm(entry) {
  state.editingEntryId = entry.id;
  clearFoodSearchUi();
  document.getElementById("entry-meal").value = entry.meal;
  document.getElementById("entry-date").value = entry.entryDate;
  document.getElementById("entry-food-id").value = entry.foodId || "";
  document.getElementById("food-name").value = entry.foodNameSnapshot;
  document.getElementById("brand-name").value = entry.brandSnapshot || "";
  document.getElementById("barcode-snapshot").value = entry.barcodeSnapshot || "";
  document.getElementById("barcode-input").value = entry.barcodeSnapshot || "";
  setOptionalInputValue("serving-size", entry.servingSize || "");
  setOptionalInputValue("serving-unit", entry.servingUnit || "");
  setOptionalInputValue("serving-label", formatServingMeasure(entry));
  document.getElementById("serving-multiplier").value = entry.servingMultiplier;
  setBaseEntryMacros({
    calories: Number(entry.calories || 0) / getServingMultiplierValue(),
    protein: Number(entry.protein || 0) / getServingMultiplierValue(),
    carbs: Number(entry.carbs || 0) / getServingMultiplierValue(),
    fat: Number(entry.fat || 0) / getServingMultiplierValue(),
  });
  setBaseEntryNutrients(scaleNutrientsForMultiplier(entry.nutrients, getServingMultiplierValue()));
  applyServingMultiplierToForm();
  document.getElementById("entry-notes").value = entry.notes || "";
  document.getElementById("entry-submit").textContent = "Update Entry";
  document.getElementById("entry-cancel").hidden = false;
  setAppScreen("log", { replaceHash: true });
}

function fillEntryFormFromFavorite(favorite) {
  const defaultMultiplier = Number(favorite.servingMultiplier || 1) || 1;

  resetEntryForm();
  clearFoodSearchUi();
  document.getElementById("entry-meal").value = favorite.meal;
  document.getElementById("entry-food-id").value = favorite.foodId || "";
  document.getElementById("food-name").value = favorite.foodNameSnapshot;
  document.getElementById("brand-name").value = favorite.brandSnapshot || "";
  document.getElementById("barcode-snapshot").value = favorite.barcodeSnapshot || "";
  document.getElementById("barcode-input").value = favorite.barcodeSnapshot || "";
  setOptionalInputValue("serving-size", favorite.servingSize || "");
  setOptionalInputValue("serving-unit", favorite.servingUnit || "");
  setOptionalInputValue("serving-label", formatServingMeasure(favorite));
  document.getElementById("serving-multiplier").value = String(defaultMultiplier);
  setBaseEntryMacros({
    calories: Number(favorite.calories || 0) / defaultMultiplier,
    protein: Number(favorite.protein || 0) / defaultMultiplier,
    carbs: Number(favorite.carbs || 0) / defaultMultiplier,
    fat: Number(favorite.fat || 0) / defaultMultiplier,
  });
  setBaseEntryNutrients(scaleNutrientsForMultiplier(favorite.nutrients, defaultMultiplier));
  applyServingMultiplierToForm();
  document.getElementById("entry-notes").value = favorite.notes || "";
  setAppScreen("log", { replaceHash: true });
}

function bindEntryActions(entries) {
  document.querySelectorAll("[data-edit-entry]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = entries.find((entry) => entry.id === button.dataset.editEntry);
      if (target) {
        fillEntryForm(target);
        setBanner("Editing entry. Save to apply changes.", "success");
      }
    });
  });

  document.querySelectorAll("[data-delete-entry]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm("Delete this entry?");
      if (!confirmed) {
        return;
      }
      try {
        await apiFetch(`/api/entries/${button.dataset.deleteEntry}`, { method: "DELETE" });
        await loadDay(state.currentDate);
        setBanner("Entry deleted.", "success");
      } catch (error) {
        setBanner(error.message || "Unable to delete entry.", "error");
      }
    });
  });
}

function bindFavoriteActions() {
  document.querySelectorAll("[data-use-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = state.favorites.find((favorite) => favorite.id === button.dataset.useFavorite);
      if (!target) {
        return;
      }

      fillEntryFormFromFavorite(target);
      setBanner(`${target.foodNameSnapshot} loaded from favorites.`, "success");
    });
  });

  document.querySelectorAll("[data-delete-favorite]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = state.favorites.find((favorite) => favorite.id === button.dataset.deleteFavorite);
      const confirmed = window.confirm(`Delete ${target?.foodNameSnapshot || "this favorite"}?`);
      if (!confirmed) {
        return;
      }

      try {
        await apiFetch(`/api/favorites/${button.dataset.deleteFavorite}`, { method: "DELETE" });
        await loadFavorites();
        setBanner("Favorite deleted.", "success");
      } catch (error) {
        setBanner(error.message || "Unable to delete favorite.", "error");
      }
    });
  });
}

function buildSavedMealItemFromEntry(entry) {
  return {
    foodId: entry.foodId || null,
    foodNameSnapshot: entry.foodNameSnapshot,
    brandSnapshot: entry.brandSnapshot || null,
    barcodeSnapshot: entry.barcodeSnapshot || null,
    servingSize: entry.servingSize || null,
    servingUnit: entry.servingUnit || null,
    servingLabel: entry.servingLabel || null,
    servingMultiplier: Number(entry.servingMultiplier || 1),
    calories: Number(entry.calories || 0),
    protein: Number(entry.protein || 0),
    carbs: Number(entry.carbs || 0),
    fat: Number(entry.fat || 0),
    nutrients: entry.nutrients || {},
    notes: entry.notes || null,
  };
}

function buildEntryPayloadFromSavedMealItem(savedMeal, item) {
  return {
    entryDate: state.currentDate,
    meal: savedMeal.meal,
    foodId: item.foodId || null,
    foodNameSnapshot: item.foodNameSnapshot,
    brandSnapshot: item.brandSnapshot || null,
    barcodeSnapshot: item.barcodeSnapshot || null,
    servingSize: item.servingSize || null,
    servingUnit: item.servingUnit || null,
    servingLabel: item.servingLabel || null,
    servingMultiplier: Number(item.servingMultiplier || 1),
    calories: Number(item.calories || 0),
    protein: Number(item.protein || 0),
    carbs: Number(item.carbs || 0),
    fat: Number(item.fat || 0),
    nutrients: item.nutrients || {},
    notes: item.notes || null,
  };
}

async function handleSaveMealGroup(meal) {
  clearBanner();
  const entries = state.entries.filter((entry) => entry.meal === meal);
  if (!entries.length) {
    setBanner(`Add entries to ${formatMealLabel(meal)} before saving it as a meal.`, "error");
    return;
  }

  const defaultName = `${formatMealLabel(meal)} Meal`;
  const name = window.prompt("Name this saved meal", defaultName);
  if (name === null) {
    return;
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    setBanner("Enter a name before saving the meal.", "error");
    return;
  }

  try {
    await apiFetch("/api/saved-meals", {
      method: "POST",
      body: JSON.stringify({
        name: trimmedName,
        meal,
        items: entries.map(buildSavedMealItemFromEntry),
      }),
    });
    await loadSavedMeals();
    setAppScreen("saved-meals", { replaceHash: true });
    setBanner("Saved meal created.", "success");
  } catch (error) {
    setBanner(error.message || "Unable to save meal.", "error");
  }
}

function bindSavedMealActions() {
  document.querySelectorAll("[data-load-saved-meal]").forEach((button) => {
    button.addEventListener("click", async () => {
      const savedMeal = state.savedMeals.find((meal) => meal.id === button.dataset.loadSavedMeal);
      if (!savedMeal) {
        return;
      }

      try {
        const items = savedMeal.items || [];
        await Promise.all(
          items.map((item) =>
            apiFetch("/api/entries", {
              method: "POST",
              body: JSON.stringify(buildEntryPayloadFromSavedMealItem(savedMeal, item)),
            })
          )
        );
        await loadDay(state.currentDate);
        setAppScreen("meals", { replaceHash: true });
        setBanner(`${savedMeal.name} logged for ${state.currentDate}.`, "success");
      } catch (error) {
        setBanner(error.message || "Unable to log saved meal.", "error");
      }
    });
  });

  document.querySelectorAll("[data-delete-saved-meal]").forEach((button) => {
    button.addEventListener("click", async () => {
      const savedMeal = state.savedMeals.find((meal) => meal.id === button.dataset.deleteSavedMeal);
      const confirmed = window.confirm(`Delete ${savedMeal?.name || "this saved meal"}?`);
      if (!confirmed) {
        return;
      }

      try {
        await apiFetch(`/api/saved-meals/${button.dataset.deleteSavedMeal}`, { method: "DELETE" });
        await loadSavedMeals();
        setBanner("Saved meal deleted.", "success");
      } catch (error) {
        setBanner(error.message || "Unable to delete saved meal.", "error");
      }
    });
  });
}

async function loadDay(dateValue) {
  const date = new Date(dateValue + "T12:00:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || Number.isNaN(date.getTime()) || localDateString(date) !== dateValue) throw new Error("Choose a valid date.");
  const request = ++state.dayRequest;
  const uid = auth.currentUser?.uid;
  state.currentDate = dateValue;
  document.getElementById("entry-date").value = dateValue;
  wellness.syncDate(); wellness.clearDay();
  state.entries = []; renderEntries([]);
  document.getElementById("day-controls").setAttribute("aria-busy", "true");
  try {
    const [profile, entriesPayload, totals, targetResult] = await Promise.all([
      apiFetch("/api/me"), apiFetch(`/api/entries?date=${dateValue}`), apiFetch(`/api/totals?date=${dateValue}`),
      apiFetch(`/api/wellness/targets?date=${dateValue}`).then(payload => ({payload})).catch(error => ({error}))
    ]);
    if (request !== state.dayRequest || uid !== auth.currentUser?.uid) return;
    updateProfile(auth.currentUser, profile);
    state.entries = entriesPayload.entries || [];
    wellness.useTargets(targetResult.payload || null);
    renderEntries(state.entries); bindEntryActions(state.entries); updateTotals(totals);
    if (targetResult.error) setBanner(targetResult.error.status === 404 ? "Daily targets need the updated service. Food logging is available." : "Daily targets could not be loaded. " + targetResult.error.message, "error");
  } finally {
    if (request === state.dayRequest) document.getElementById("day-controls").removeAttribute("aria-busy");
  }
}

async function loadFavorites() {
  const favoritesPayload = await apiFetch("/api/favorites");
  state.favorites = favoritesPayload.favorites || [];
  renderFavorites(state.favorites);
  bindFavoriteActions();
}

async function loadSavedMeals() {
  const savedMealsPayload = await apiFetch("/api/saved-meals");
  state.savedMeals = savedMealsPayload.meals || [];
  renderSavedMeals(state.savedMeals);
  bindSavedMealActions();
}

async function handleBarcodeLookup(event) {
  event.preventDefault();
  const barcode = document.getElementById("barcode-input").value.trim();
  if (!barcode) {
    setBanner("Enter a barcode first.", "error");
    return;
  }

  setBanner("Looking up barcode...", "success");
  try {
    const food = await apiFetch(`/api/foods/lookup?barcode=${encodeURIComponent(barcode)}`);
    applyFoodToEntryForm({
      ...food,
      barcode: food.barcode || barcode,
    });
    clearFoodSearchUi();
    document.getElementById("lookup-result").innerHTML = `
      <strong>${escapeHtml(food.name)}</strong>
      <div class="small-note">
        ${escapeHtml(food.brand || "No brand")} | ${escapeHtml(food.servingLabel || "Serving info unavailable")} | source: ${escapeHtml(food.source)}
      </div>
    `;
    setBanner("Barcode data loaded into the entry form.", "success");
  } catch (error) {
    document.getElementById("lookup-result").textContent = "";
    setBanner(error.message || "Barcode lookup failed.", "error");
  }
}

function buildEntryPayload() {
  return {
    entryDate: document.getElementById("entry-date").value,
    meal: document.getElementById("entry-meal").value,
    foodId: document.getElementById("entry-food-id").value || null,
    foodNameSnapshot: document.getElementById("food-name").value.trim(),
    brandSnapshot: document.getElementById("brand-name").value.trim() || null,
    barcodeSnapshot: document.getElementById("barcode-snapshot").value.trim() || null,
    servingSize: getServingSizeValue(),
    servingUnit: getOptionalInputValue("serving-unit").trim() || null,
    servingLabel: getOptionalInputValue("serving-label").trim() || null,
    servingMultiplier: Number(document.getElementById("serving-multiplier").value || 1),
    calories: Number(document.getElementById("calories").value || 0),
    protein: Number(document.getElementById("protein").value || 0),
    carbs: Number(document.getElementById("carbs").value || 0),
    fat: Number(document.getElementById("fat").value || 0),
    nutrients: readNutrientFormValues(),
    notes: document.getElementById("entry-notes").value.trim() || null,
  };
}

function buildFavoritePayload() {
  const payload = buildEntryPayload();
  return {
    meal: payload.meal,
    foodId: payload.foodId,
    foodNameSnapshot: payload.foodNameSnapshot,
    brandSnapshot: payload.brandSnapshot,
    barcodeSnapshot: payload.barcodeSnapshot,
    servingSize: payload.servingSize,
    servingUnit: payload.servingUnit,
    servingLabel: payload.servingLabel,
    servingMultiplier: payload.servingMultiplier,
    calories: payload.calories,
    protein: payload.protein,
    carbs: payload.carbs,
    fat: payload.fat,
    nutrients: payload.nutrients,
    notes: payload.notes,
  };
}

async function handleEntrySubmit(event) {
  event.preventDefault();
  if (state.entrySaving) return;
  state.entrySaving = true;
  document.getElementById("entry-submit").disabled = true;
  clearBanner();

  try {
    const payload = buildEntryPayload();
    state.currentDate = payload.entryDate;
    if (state.editingEntryId) {
      await apiFetch(`/api/entries/${state.editingEntryId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setBanner("Entry updated.", "success");
    } else {
      await apiFetch("/api/entries", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setBanner("Entry saved.", "success");
    }
    resetEntryForm();
    await loadDay(payload.entryDate);
    setAppScreen("meals", { replaceHash: true });
  } catch (error) {
    setBanner(error.message || "Unable to save entry.", "error");
  } finally {
    state.entrySaving = false;
    document.getElementById("entry-submit").disabled = false;
  }
}

async function handleFavoriteSave() {
  clearBanner();

  try {
    const payload = buildFavoritePayload();
    if (!payload.foodNameSnapshot) {
      throw new Error("Enter a food name before saving a favorite.");
    }

    await apiFetch("/api/favorites", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadFavorites();
    setAppScreen("saved", { replaceHash: true });
    setBanner("Favorite saved.", "success");
  } catch (error) {
    setBanner(error.message || "Unable to save favorite.", "error");
  }
}

async function loadAuthenticatedExperience() {
  const results = await Promise.allSettled([
    loadDay(state.currentDate),
    loadFavorites(),
    loadSavedMeals(),
    wellness.loadFitness(),
  ]);
  const firstFailure = results.find((result) => result.status === "rejected");
  if (firstFailure) {
    throw firstFailure.reason;
  }
}

function bindPageActions() {
  const yearElement = document.getElementById("year");
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }
  document.querySelectorAll("[data-screen-link]").forEach((element) => {
    element.addEventListener("click", (event) => {
      const targetScreenId = element.dataset.screenLink;
      if (!targetScreenId) {
        return;
      }
      event.preventDefault();
      setAppScreen(targetScreenId);
    });
  });
  window.addEventListener("hashchange", syncAppScreenFromHash);
  setAppScreen(window.location.hash.replace(/^#/, "") || defaultAppScreen, { replaceHash: true });
  document.getElementById("dashboard-date").value = state.currentDate;
  document.getElementById("entry-date").value = state.currentDate;
  document.getElementById("entry-form").addEventListener("submit", handleEntrySubmit);
  document.getElementById("food-name").addEventListener("input", (event) => {
    document.getElementById("entry-food-id").value = "";
    queueFoodSearch(event.target.value);
  });
  document.getElementById("favorite-save").addEventListener("click", async () => {
    await handleFavoriteSave();
  });
  document.querySelectorAll("[data-save-meal]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleSaveMealGroup(button.dataset.saveMeal);
    });
  });
  document.getElementById("barcode-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const barcode = normalizeBarcodeValue(document.getElementById("barcode-input").value);
    if (!barcode) {
      setBanner("Enter a valid UPC or EAN barcode first.", "error");
      return;
    }

    try {
      await lookupBarcodeValue(barcode);
    } catch (error) {
      document.getElementById("lookup-result").textContent = "";
      setBanner(error.message || "Barcode lookup failed.", "error");
    }
  });
  document.getElementById("barcode-scan-start").addEventListener("click", async () => {
    await startBarcodeScanner();
  });
  document.getElementById("barcode-scan-stop").addEventListener("click", () => {
    stopBarcodeScanner();
  });
  document.getElementById("serving-multiplier").addEventListener("input", () => {
    applyServingMultiplierToForm();
  });
  macroFieldIds.forEach((fieldId) => {
    document.getElementById(fieldId).addEventListener("input", () => {
      syncBaseMacrosFromForm();
    });
  });
  nutrientFieldDefinitions.forEach((field) => {
    document.getElementById(field.inputId).addEventListener("input", () => {
      syncBaseNutrientsFromForm();
    });
  });
  document.getElementById("dashboard-date").addEventListener("change", async (event) => {
    try {
      clearBanner();
      await loadDay(event.target.value);
    } catch (error) {
      setBanner(error.message || "Unable to load that day.", "error");
    }
  });
  document.getElementById("entry-cancel").addEventListener("click", () => {
    const wasEditing = Boolean(state.editingEntryId);
    resetEntryForm();
    clearBanner();
    if (wasEditing) {
      setAppScreen("meals", { replaceHash: true });
    }
  });
  document.getElementById("sign-out").addEventListener("click", async () => {
    stopBarcodeScanner({ keepStatus: true });
    await signOutUser();
    window.location.href = getLoginPagePath();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopBarcodeScanner({ keepStatus: true });
    }
  });
  window.addEventListener("beforeunload", () => {
    stopBarcodeScanner({ keepStatus: true });
  });
}

async function boot() {
  bindPageActions();

  if (!isApiConfigured()) {
    document.getElementById("config-warning").hidden = false;
    setBanner("Firebase is ready. Add the Cloud Run URL to nutrition-config.js to turn on live API calls.", "error");
  }

  try {
    await completeRedirectSignIn();
  } catch (error) {
    setBanner(error.message || "Unable to finish Google sign-in.", "error");
  }

  onUserChanged(async (user) => {
    if (!user) {
      window.location.href = getLoginPagePath();
      return;
    }

    updateProfile(user);

    if (!isApiConfigured()) {
      return;
    }

    try {
      await loadAuthenticatedExperience();
    } catch (error) {
      setBanner(error.message || "Unable to load the nutrition dashboard.", "error");
    }
  });
}

const wellness = initWellness({apiFetch, state, setAppScreen, setBanner, loadDay, escapeHtml, localDateString});
resetEntryForm();
boot();
