// Dev helper: create a throwaway user in the Auth emulator and print its ID
// token, for manual curl/Postman testing.
//
// Typical flow (two terminals):
//   1) npm run serve      # starts the emulators
//   2) npm run token      # prints a fresh ID token to stdout
//
// This can never reach a real Firebase project by construction: it only ever
// POSTs to http://<host>/identitytoolkit... where <host> defaults to the local
// Auth emulator port from firebase.json. FIREBASE_AUTH_EMULATOR_HOST is only set
// inside `emulators:exec`, so we fall back to that default instead of refusing.
// This is a CLI script (not function code), so console output is intentional and
// it lives outside src/ (not bundled into the deployed function).

const DEFAULT_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

interface SignUpResponse {
  idToken: string;
  localId: string;
}

async function main(): Promise<void> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? DEFAULT_AUTH_EMULATOR_HOST;
  const projectId = process.env.GCLOUD_PROJECT ?? "collectify-case";
  const email = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "password123";

  // The emulator ignores the API key, but the endpoint requires one to be present.
  const url = `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
  } catch {
    // fetch throws a TypeError when the connection is refused (emulator down).
    console.error(`Auth emulator'a ulaşılamadı (${host}), önce \`npm run serve\` çalıştır`);
    process.exit(1);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(`Auth emulator signUp failed (${response.status}): ${text}`);
    process.exit(1);
  }

  const data = (await response.json()) as SignUpResponse;
  // Context goes to stderr; the token alone goes to stdout so it is easy to
  // capture: TOKEN=$(npm run --silent token)
  console.error(`# project=${projectId} email=${email} uid=${data.localId}`);
  console.log(data.idToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
