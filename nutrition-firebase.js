import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  GithubAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const appConfig = window.NUTRITION_APP_CONFIG;
const firebaseApp = initializeApp(appConfig.firebase);
const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account",
});


export function getApiBaseUrl() {
  return (appConfig.apiBaseUrl || "").trim();
}

export function isApiConfigured() {
  return getApiBaseUrl().length > 0;
}

export const signInProviders = Object.freeze([
  { key: "google", id: "google.com", name: "Google" },
  { key: "github", id: "github.com", name: "GitHub" },
]);

export function getEnabledProviders() {
  return signInProviders.filter(({ key }) => key === "google" || appConfig.signInProviders?.[key] === true);
}

function createProvider(key) {
  if (!getEnabledProviders().some((provider) => provider.key === key)) {
    throw Object.assign(new Error("Provider unavailable"), { code: "auth/operation-not-allowed" });
  }
  if (key === "google") return googleProvider;
  if (key === "github") {
    const provider = new GithubAuthProvider();
    provider.addScope("user:email");
    return provider;
  }
  throw Object.assign(new Error("Provider unavailable"), { code: "auth/operation-not-allowed" });
}

export function signInWithProvider(key) {
  return signInWithPopup(auth, createProvider(key));
}

export function signInWithGoogle() {
  return signInWithProvider("google");
}

export async function linkSignInProvider(key) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error("Sign in first"), { code: "auth/requires-recent-login" });
  const uid = user.uid;
  const result = await linkWithPopup(user, createProvider(key));
  if (result.user.uid !== uid || auth.currentUser?.uid !== uid) {
    // Fail closed: never display the previous user's data under a different session.
    await signOut(auth);
    throw Object.assign(new Error("Account changed"), { code: "auth/user-mismatch" });
  }
  await result.user.getIdToken(true);
  return result;
}

export function authErrorMessage(error, linking = false) {
  switch (error?.code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request": return "Sign-in was cancelled. You can try again.";
    case "auth/popup-blocked": return "Allow pop-ups for this site, then try again.";
    case "auth/account-exists-with-different-credential":
      return "Use your existing sign-in method first. Then open Account → Sign-in methods to add this one and keep your history.";
    case "auth/credential-already-in-use":
    case "auth/email-already-in-use": return "This login belongs to another account. Your accounts have not been merged. Use your original sign-in method to access your history.";
    case "auth/provider-already-linked": return "This sign-in method is already connected.";
    case "auth/requires-recent-login": return "Sign out and sign back in with your existing method, then try adding this method again.";
    case "auth/operation-not-allowed": return "This sign-in option is not ready yet. Please use another available method.";
    case "auth/unauthorized-domain": return "Sign-in is not configured for this website address.";
    case "auth/network-request-failed": return "Check your connection and try again.";
    case "auth/user-disabled": return "This account is disabled.";
    case "auth/user-mismatch": return "Your account changed. Sign in again with your original method.";
    default: return linking ? "Unable to add this sign-in method. Your existing login still works; try again later." : "Unable to sign in. Please try again.";
  }
}

export async function completeRedirectSignIn() {
  return getRedirectResult(auth);
}

export function onUserChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getCurrentToken(forceRefresh = false) {
  if (!auth.currentUser) {
    return null;
  }
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function signOutUser() {
  await signOut(auth);
}

export { auth };
