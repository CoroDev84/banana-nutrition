import { auth, authErrorMessage, getEnabledProviders, linkSignInProvider, onUserChanged } from "./nutrition-firebase.js?v=20261027-github";

const section = document.getElementById("sign-in-settings");
const list = document.getElementById("linked-providers");
const status = document.getElementById("link-status");
const signOutButton = document.getElementById("sign-out");
let busy = false;

function render() {
  const user = auth.currentUser;
  const providers = getEnabledProviders();
  section.hidden = !user || providers.length < 2;
  list.replaceChildren();
  if (!user) return;
  for (const provider of providers) {
    const linked = user.providerData.some(({ providerId }) => providerId === provider.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-action";
    button.textContent = provider.name + (linked ? " · Connected" : " · Connect");
    button.disabled = busy || linked;
    button.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      const originalUid = auth.currentUser?.uid;
      signOutButton.disabled = true;
      render();
      status.textContent = "Opening " + provider.name + " to connect it to this account…";
      try {
        await linkSignInProvider(provider.key);
        status.textContent = provider.name + " connected. Either sign-in method now opens this account.";
      } catch (error) {
        status.textContent = authErrorMessage(error, true);
      } finally {
        busy = false;
        signOutButton.disabled = false;
        if (auth.currentUser?.uid !== originalUid) window.location.replace(document.body?.dataset.loginPage || "login.html");
        else render();
      }
    });
    list.append(button);
  }
}
onUserChanged(() => { status.textContent = ""; render(); });
