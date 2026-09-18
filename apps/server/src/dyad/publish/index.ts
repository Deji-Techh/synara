// FILE: index.ts
// Purpose: Publish integrations (Phase 4): per-app link store, GitHub
// (gh-first + PAT), Vercel, Coolify agent tools.

export {
  readPublishLinks,
  writePublishLinks,
  clearPublishCache,
  type GithubPublishLink,
  type VercelPublishLink,
  type CoolifyPublishLink,
  type PublishLinks,
  type PublishPatch,
} from "./publishStore.ts";
export {
  GITHUB_API_BASE_URL,
  GithubApiError,
  isGhCliAuthenticated,
  listGithubRepos,
  createGithubRepo,
  listGithubBranches,
  addGithubCollaborator,
  pushWithGhCli,
} from "./githubApi.ts";
export {
  getGithubToken,
  createGithubRepoTool,
  githubPushTool,
  githubStatusTool,
  githubCollaboratorTool,
  listGithubReposTool,
  ALL_GITHUB_TOOLS,
} from "./githubTools.ts";
export {
  GithubOAuthError,
  requestGithubDeviceCode,
  pollGithubAccessToken,
  saveGithubOAuthToken,
  disconnectGithubOAuth,
  type GithubDeviceCode,
  type GithubPollResult,
} from "./githubOAuth.ts";
export {
  VERCEL_API_BASE_URL,
  VercelApiError,
  NEON_VERCEL_ENV_KEYS,
  getVercelAuthUser,
  listVercelProjects,
  createVercelProject,
  listVercelDeployments,
  triggerVercelDeployment,
  syncNeonEnvToVercel,
  removeNeonEnvFromVercel,
} from "./vercelApi.ts";
export {
  VERCEL_ENV_TARGETS,
  NEON_VERCEL_ENV_KEYS as NEON_VERCEL_OWNED_KEYS,
  buildVercelEnvPayload,
  canonicalOrigin,
  reconcileTrustedDomains,
  type VercelEnvTarget,
  type VercelEnvVar,
  type NeonBranchEnvValues,
} from "./vercelEnvSync.ts";
export {
  getVercelToken,
  vercelConnectTool,
  vercelDeployTool,
  vercelDeploymentsTool,
  vercelEnvSyncTool,
  vercelDisconnectTool,
  ALL_VERCEL_TOOLS,
} from "./vercelTools.ts";
export {
  CoolifyApiError,
  probeCoolifyInstance,
  listCoolifyServers,
  listCoolifyProjects,
  createCoolifyProject,
  triggerCoolifyDeploy,
  getCoolifyApplication,
} from "./coolifyApi.ts";
export {
  getCoolifyToken,
  coolifyConnectTool,
  coolifyDiscoverTool,
  coolifyDeployTool,
  coolifyStatusTool,
  coolifyDisconnectTool,
  ALL_COOLIFY_TOOLS,
} from "./coolifyTools.ts";
