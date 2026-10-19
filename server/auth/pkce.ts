// PKCE (RFC 7636, S256) and the OAuth state parameter.
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes → 43 base64url characters (RFC 7636 allows 43–128). */
export const createVerifier = () => randomBytes(32).toString("base64url");

export const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export const createState = () => randomBytes(16).toString("base64url");
