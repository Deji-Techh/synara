// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant web/code-intelligence backends.

export {
  htmlToText,
  fetchPage,
  webFetchTool,
  ALL_WEB_FETCH_TOOLS,
  WEB_FETCH_TIMEOUT_MS,
  WEB_FETCH_MAX_BYTES,
  WebFetchError,
  type FetchedPage,
} from "./webFetch.ts";
export {
  duckDuckGoSearch,
  executeWebSearch,
  webSearchTool,
  webCrawlTool,
  ALL_WEB_SEARCH_TOOLS,
  setWebSearchProvider,
  type SearchHit,
  type WebSearchProvider,
} from "./webSearch.ts";
export {
  pollinationsGenerate,
  executeGenerateImage,
  generateImageTool,
  ALL_IMAGE_TOOLS,
  setImageProvider,
  type GeneratedImage,
  type ImageProvider,
} from "./generateImage.ts";
export {
  searchWorkspace,
  lookupSymbol,
  executeExploreCode,
  codeSearchTool,
  lspSymbolLookupTool,
  exploreCodeTool,
  ALL_CODE_TOOLS,
  setExplorerRunner,
  type CodeHit,
  type SymbolHit,
  type ExplorerRunner,
} from "./codeSearch.ts";
