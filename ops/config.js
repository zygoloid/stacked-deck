// Project-wide settings for the kill switch. These cover every game in the
// shared games project, not just Stacked Deck; this codebase lives here only
// until it moves to its own repository.
export const PROJECT = 'zygoloid-github-io';
export const REGION = 'us-central1';
export const RUNTIME_SERVICE_ACCOUNT = `ops-fn@${PROJECT}.iam.gserviceaccount.com`;

// The Pub/Sub topic the billing budget publishes to.
export const BUDGET_TOPIC = 'over-budget';
// Lock down once actual spend reaches this fraction of the budget.
export const BUDGET_FRACTION = 1.0;

// Lock down when database usage across the whole project passes these. Real
// use is far below both; they only catch abuse or a runaway bug.
export const LIMITS = {
  sentBytesPerHour: 1 * 2 ** 30,  // about $1/hour at $1/GB downloaded
  storedBytes: 2 * 2 ** 30,       // the first 1 GB is free, then $5/GB-month
};
export const CHECK_SCHEDULE = 'every 10 minutes';

// Database instances to lock down even if listing them fails. Instances
// found by listing the project are locked down too.
export const KNOWN_INSTANCE_URLS = [
  `https://${PROJECT}-default-rtdb.firebaseio.com`,
  'https://zygoloid-stacked-deck.firebaseio.com',
];
