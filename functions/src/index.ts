import { onRequest } from "firebase-functions/v2/https";

// All guest access goes through these two functions with capability token
// validation. Guests never touch Firestore directly. Stubs reserve the names
// and URLs; real handlers land in M0.

export const hpGuestView = onRequest({ invoker: "public" }, (req, res) => {
  res.status(501).json({ error: "not_built_yet" });
});

export const hpGuestSubmit = onRequest({ invoker: "public" }, (req, res) => {
  res.status(501).json({ error: "not_built_yet" });
});
