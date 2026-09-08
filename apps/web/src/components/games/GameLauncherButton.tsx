// FILE: GameLauncherButton.tsx
// Purpose: Sidebar gamepad button + game picker popover (replaces placeholder).
// Layer: UI game components

import { LuGamepad2 } from "react-icons/lu";

import { useGameShellStore } from "./gameShellStore";
import { GAME_META, type GameId } from "./gameTypes";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";

export function GameLauncherButton() {
  const openGame = useGameShellStore((s) => s.openGame);
  const activeGame = useGameShellStore((s) => s.game);
  const isOpen = useGameShellStore((s) => s.open);

  const pick = (game: GameId) => openGame(game);

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Take a game break"
        title="Game break — chess or snake"
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/20 bg-muted/10 text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground"
      >
        <LuGamepad2 className="size-4" />
      </PopoverTrigger>
      <PopoverPopup side="right" align="start" sideOffset={8} className="w-60 p-2">
        <p className="px-2 pt-1 text-xs font-semibold text-foreground">Take a break</p>
        <p className="px-2 pb-2 text-[11px] text-muted-foreground">
          Quick games that never steal your keys.
        </p>
        <div className="flex flex-col gap-1">
          {(Object.keys(GAME_META) as GameId[]).map((game) => (
            <button
              key={game}
              type="button"
              onClick={() => pick(game)}
              className="flex items-center justify-between rounded-md px-2 py-2 text-left hover:bg-muted/50"
            >
              <span>
                <span className="block text-xs font-medium text-foreground">
                  {GAME_META[game].title}
                  {isOpen && activeGame === game ? (
                    <span className="ml-1.5 text-[10px] font-normal text-primary">● open</span>
                  ) : null}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {GAME_META[game].blurb}
                </span>
              </span>
              <span aria-hidden="true" className="text-muted-foreground/50">
                →
              </span>
            </button>
          ))}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
