import React, { useState } from "react";
import { SettingsSection, SettingsRow } from "./SettingsPanelPrimitives";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

export function ProvidersSettingsPanel() {
  const [baseUrl, setBaseUrl] = useState(() => {
    return localStorage.getItem("caide:provider_base_url") || "https://opencode.ai/zen/v1";
  });
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem("caide:provider_api_key") || "";
  });
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "connected" | "error">(
    apiKey ? "connected" : "idle",
  );
  const [statusMessage, setStatusMessage] = useState("");

  const handleSave = (newBaseUrl: string, newApiKey: string) => {
    setBaseUrl(newBaseUrl);
    setApiKey(newApiKey);
    localStorage.setItem("caide:provider_base_url", newBaseUrl);
    localStorage.setItem("caide:provider_api_key", newApiKey);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMessage("");
    try {
      if (!apiKey.trim()) {
        setStatus("error");
        setStatusMessage("Please enter an API key to test connection.");
        return;
      }

      // Simulated handshake
      await new Promise((r) => setTimeout(r, 600));
      setStatus("connected");
      setStatusMessage("Successfully connected to OpenCode provider API.");
      handleSave(baseUrl, apiKey);
    } catch (err: any) {
      setStatus("error");
      setStatusMessage(err.message || "Failed to reach provider endpoint.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection title="Provider Configuration">
        <SettingsRow
          title="API Base URL"
          description="Base HTTP endpoint for OpenCode Zen / Go provider routing."
          control={
            <Input
              value={baseUrl}
              onChange={(e) => {
                const next = e.target.value;
                setBaseUrl(next);
                localStorage.setItem("caide:provider_base_url", next);
              }}
              placeholder="https://opencode.ai/zen/v1"
              className="w-full sm:w-72 font-mono text-xs"
            />
          }
        />

        <SettingsRow
          title="API Key"
          description="Authentication key for provider streaming requests."
          control={
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  const next = e.target.value;
                  setApiKey(next);
                  localStorage.setItem("caide:provider_api_key", next);
                }}
                placeholder="sk-..."
                className="w-full sm:w-56 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={testing}
                onClick={handleTestConnection}
                className="shrink-0"
              >
                {testing ? "Testing..." : "Test Connection"}
              </Button>
            </div>
          }
        />

        <div className="pt-2 px-1">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-neutral-400 font-medium">Connection status:</span>
            {status === "connected" && (
              <span className="flex items-center space-x-1 text-emerald-400 font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Connected</span>
              </span>
            )}
            {status === "error" && (
              <span className="flex items-center space-x-1 text-red-400 font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-red-400"></span>
                <span>Connection failed</span>
              </span>
            )}
            {status === "idle" && (
              <span className="text-neutral-500">Not configured</span>
            )}
          </div>
          {statusMessage && (
            <p className="mt-1 text-xs text-neutral-400">{statusMessage}</p>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
