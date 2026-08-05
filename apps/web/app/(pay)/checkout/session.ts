/**
 * Compatibility barrel for checkout session contracts, transport, and funding behavior.
 * Existing consumers keep this stable import path while implementation stays intent-based.
 */

export * from "./session-client";
export * from "./session-funding";
export * from "./session-types";
