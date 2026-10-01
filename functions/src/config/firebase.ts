import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Initialize the Admin SDK exactly once (module is cached by Node).
// No credentials are passed: on Cloud Functions it uses the runtime service
// account, and when FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST are
// set the SDK targets the emulators by itself — so no emulator branch here.
const app = initializeApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
