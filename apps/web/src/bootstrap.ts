// FILE: bootstrap.ts
// Purpose: Completes synchronous renderer storage migration before any app store can hydrate.

import "./polyfills";
import { __polyfillLoaded } from "./polyfills";
void __polyfillLoaded;

import "./storageOriginMigration";

import { bootstrapSignedOutScreen } from "./authSignedOut";
import { bootstrapPairingSession } from "./pairingBootstrap";

if (!bootstrapSignedOutScreen()) {
  void bootstrapPairingSession().then((result) => {
    if (result === "not-pairing") {
      return import("./main");
    }
  });
}
