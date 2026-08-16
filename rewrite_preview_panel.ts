import fs from "fs";

const file = "apps/web/src/components/chat/PreviewPanel.tsx";
let content = fs.readFileSync(file, "utf-8");

// Rewrite the main return of PreviewPanel
const oldReturnStart = `  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="preview-pane">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">`;
const oldReturnEnd = `    </div>
  );
}`;

const oldReturnStr = content.substring(content.indexOf(oldReturnStart), content.lastIndexOf(oldReturnEnd) + oldReturnEnd.length);

const newReturnStr = `  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="preview-pane">
      {/* Top Header: Choose Simulator */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <select
          value={panelState.deviceId}
          onChange={(event) => {
            handleDeviceChange(event.target.value as PreviewDeviceId);
            if (panelState.status === "idle" || panelState.status === "failed") {
              handleStart();
            }
          }}
          className="bg-transparent text-sm font-medium text-foreground outline-none appearance-none"
        >
          <option value="" disabled>Choose a simulator</option>
          {PREVIEW_DEVICE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <LucideChevronDownIcon className="size-4 text-muted-foreground -ml-1" />
        <div className="min-w-0 flex-1" />
        {isRunning && (
          <div className="flex shrink-0 items-center gap-1 mr-2">
            <button type="button" onClick={() => handleReload(true)} className="p-1.5 text-muted-foreground hover:text-foreground">
              <RefreshCwIcon className="size-3.5" />
            </button>
            <button type="button" onClick={handleStop} className="p-1.5 text-red-500 hover:text-red-400">
              <DeviceRecordStopIcon className="size-3.5" />
            </button>
          </div>
        )}
        <StatusPill state={panelState} />
      </div>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-black/5 dark:bg-black/20">
        <div className={cn("flex-1 overflow-auto", panelState.activeTab === "preview" ? "block" : "hidden")}>
          {(panelState.status === "idle" || panelState.status === "starting" || panelState.status === "failed") ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <DeviceScreen kind={panelState.deviceId === "tablet" ? "iPad" : "iPhone"}>
                <div className="flex h-full w-full flex-col items-center justify-center bg-black p-6 text-center">
                  {panelState.status === "starting" ? (
                    <>
                      <LoaderIcon className="size-5 animate-spin text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">Starting simulator...</p>
                    </>
                  ) : panelState.status === "failed" ? (
                    <>
                      <p className="text-sm text-red-500 mb-3">{panelState.error ?? "Failed to start"}</p>
                      <button onClick={handleStart} className="text-xs bg-white text-black px-3 py-1.5 rounded-full font-medium">Retry</button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Choose a simulator to<br/>start streaming it here.
                    </p>
                  )}
                </div>
              </DeviceScreen>
            </div>
          ) : (
            isRunning && panelState.url !== null && (
              <PreviewDeviceFrame
                threadId={props.threadId}
                deviceId={panelState.deviceId}
                url={panelState.url}
                reloadToken={panelState.reloadToken}
              />
            )
          )}
        </div>
        
        {panelState.activeTab === "problems" && <div className="flex-1 overflow-hidden"><ProblemList state={panelState.analyze} /></div>}
        {panelState.activeTab === "tests" && <div className="flex-1 overflow-hidden"><TestResults state={panelState.test} /></div>}
        {panelState.activeTab === "qualityGate" && (
          <div className="flex-1 overflow-hidden">
            <QualityGatePanel
              analyze={panelState.analyze}
              test={panelState.test}
              onRunAnalyze={handleRunAnalyze}
              onRunTest={handleRunTest}
            />
          </div>
        )}
        {panelState.activeTab === "release" && (
          <div className="flex-1 overflow-hidden">
            <ReleasePanel build={panelState.build} onBuild={handleBuild} />
          </div>
        )}
      </div>

      {/* Bottom Nav Bar for Tabs */}
      <div
        className="flex shrink-0 items-center justify-center gap-6 border-t border-border px-4 py-3 bg-background"
        role="tablist"
      >
        {PREVIEW_TABS.map((tab) => {
          const TabIcon = tab.icon;
          const isSelected = panelState.activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 transition-colors",
                isSelected ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              )}
            >
              <TabIcon aria-hidden="true" className="size-4" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}`;

content = content.replace(oldReturnStr, newReturnStr);

fs.writeFileSync(file, content, "utf-8");
console.log("Rewrote PreviewPanel.tsx UI");
