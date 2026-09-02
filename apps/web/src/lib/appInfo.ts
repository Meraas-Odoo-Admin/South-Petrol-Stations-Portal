// Single source of truth for the app's user-facing name — round 4 client
// feedback: "ضابط" reads as a military/police rank, which the client
// dislikes; "ضبط الوقود" ("Fuel Control") keeps the same root meaning
// (regulation/control) without the rank connotation, and doesn't bake in
// "Sabha" or any specific directorate name (still an open scope question,
// see docs/OPEN_ITEMS.md). Every user-facing occurrence of the app name
// must read from here, not a literal string, so a future rename is a
// one-line change.
export const APP_NAME = 'ضبط الوقود';
export const APP_TAGLINE = 'منظومة ضبط تعبئة الوقود';
