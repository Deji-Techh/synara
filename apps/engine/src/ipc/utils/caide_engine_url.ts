export function getCaideEngineBaseUrl(): string {
  return process.env.CAIDE_ENGINE_URL ?? "https://engine.dyad.sh/v1";
}
