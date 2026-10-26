// Where this game's backend lives. See docs/online.md.
export const PROJECT = 'zygoloid-github-io';
// This game's own database instance (never the project's default one).
export const INSTANCE = 'zygoloid-stacked-deck';
export const INSTANCE_URL = 'https://zygoloid-stacked-deck.firebaseio.com';
// Functions run where the database is.
export const REGION = 'us-central1';
// Whether callable functions require an App Check token. Turn on once the
// game sends them (APP_CHECK_SITE_KEY in src/firebase-config.js) and the App
// Check metrics show its requests are verified.
export const ENFORCE_APP_CHECK = false;
// The functions' own service account, with database access only.
export const RUNTIME_SERVICE_ACCOUNT = `stacked-deck-fn@${PROJECT}.iam.gserviceaccount.com`;
