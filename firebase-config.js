// ====================================================================
//  PEGA AQUÍ LA CONFIGURACIÓN DE TU PROYECTO DE FIREBASE
//  (Consola de Firebase → ⚙ Configuración del proyecto → "Tus apps" → SDK)
//  Mira el README.md, sección "Configurar Firebase", para el paso a paso.
// ====================================================================

export const firebaseConfig = {
  apiKey: "PEGA_TU_API_KEY",
  authDomain: "PEGA_TU_PROYECTO.firebaseapp.com",
  projectId: "PEGA_TU_PROYECTO",
  storageBucket: "PEGA_TU_PROYECTO.appspot.com",
  messagingSenderId: "PEGA_TU_SENDER_ID",
  appId: "PEGA_TU_APP_ID",
};

// Nota: estas claves NO son secretas; es normal que viajen en el cliente.
// Quien protege tus datos son las reglas de Firestore (ver firestore.rules).
