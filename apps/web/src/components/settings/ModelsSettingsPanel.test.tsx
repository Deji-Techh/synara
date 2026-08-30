import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelsSettingsPanel } from "./ModelsSettingsPanel.tsx";
import { ProvidersSettingsPanel } from "./ProvidersSettingsPanel.tsx";

describe("Milestone M19 — Settings for Harness (Models & Providers)", () => {
  it("renders ModelsSettingsPanel with planning, building, verification, and taste models", () => {
    const markup = renderToStaticMarkup(<ModelsSettingsPanel />);
    expect(markup).toContain("Harness Model Configuration");
    expect(markup).toContain("Planning model");
    expect(markup).toContain("Building model");
    expect(markup).toContain("Verification model");
    expect(markup).toContain("Taste model");
  });

  it("renders ProvidersSettingsPanel with base URL, API key, and test connection button", () => {
    const markup = renderToStaticMarkup(<ProvidersSettingsPanel />);
    expect(markup).toContain("Provider Configuration");
    expect(markup).toContain("API Base URL");
    expect(markup).toContain("API Key");
    expect(markup).toContain("Test Connection");
  });
});
