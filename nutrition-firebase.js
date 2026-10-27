import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
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

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
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
