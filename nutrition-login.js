import { authErrorMessage, completeRedirectSignIn, getEnabledProviders, onUserChanged, signInWithProvider } from "./nutrition-firebase.js?v=20261027-github";

const buttons = [...document.querySelectorAll("[data-sign-in]")];
const enabled = getEnabledProviders();
for (const button of buttons) button.hidden = !enabled.some(({ key }) => key === button.dataset.signIn);
document.getElementById("existing-account-note").hidden = enabled.length === 1;

function setStatus(message, variant = "") {
  const banner = document.getElementById("login-status");
  banner.textContent = message;
  banner.className = "status-banner visible " + variant;
}

async function boot() {
  try { await completeRedirectSignIn(); }
  catch (error) { setStatus(authErrorMessage(error), "error"); }
  onUserChanged((user) => {
    if (user) window.location.replace(document.body?.dataset.appHome || "index.html");
  });
  for (const button of buttons) button.addEventListener("click", async () => {
    if (button.disabled) return;
    const provider = enabled.find(({ key }) => key === button.dataset.signIn);
    if (!provider) return;
    buttons.forEach((item) => { item.disabled = true; });
    setStatus("Opening " + provider.name + " sign-in…");
    try { await signInWithProvider(provider.key); }
    catch (error) { setStatus(authErrorMessage(error), "error"); }
    finally { buttons.forEach((item) => { item.disabled = false; }); }
  });
}
boot();
