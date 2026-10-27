(function bootstrapNutritionConfig() {
  const isLocalHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

  window.NUTRITION_APP_CONFIG = Object.freeze({
    apiBaseUrl: isLocalHost ? "http://127.0.0.1:8080" : "https://nutrition-api-480736766609.us-central1.run.app",
    // Enable each option only after its OAuth app and Firebase provider are configured.
    signInProviders: { github: true },
    firebase: {
      apiKey: "AIzaSyDoT7NSvrALfPVAFE15iYxqrwZnvwAm0Jk",
      authDomain: "fleet-parser-330316.firebaseapp.com",
      projectId: "fleet-parser-330316",
      appId: "1:480736766609:web:245c546ba13c21b0a8ad30",
    },
  });
})();
