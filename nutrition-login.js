import { completeRedirectSignIn, onUserChanged, signInWithGoogle } from "./nutrition-firebase.js";


function getAppHomePath() {
  return document.body?.dataset.appHome || "index.html";
}

function setStatus(message, variant = "") {
  const banner = document.getElementById("login-status");
  banner.textContent = message;
  banner.className = "status-banner visible";
  if (variant) {
    banner.classList.add(variant);
  }
}

async function boot() {
  const yearElement = document.getElementById("year");
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  try {
    await completeRedirectSignIn();
  } catch (error) {
    setStatus(error.message || "Unable to finish Google sign-in.", "error");
  }

  onUserChanged((user) => {
    if (user) {
      window.location.href = getAppHomePath();
    }
  });

  document.getElementById("google-sign-in").addEventListener("click", async () => {
    setStatus("Opening Google sign-in...", "success");
    try {
      await signInWithGoogle();
    } catch (error) {
      setStatus(error.message || "Google sign-in failed.", "error");
    }
  });
}

boot();
