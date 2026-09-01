import { Effect, ServiceMap } from "effect";

export interface ProjectFaviconResolverShape {
  readonly resolvePath: (cwd: string) => Effect.Effect<string | null>;
  readonly resolveFavicon: (
    cwd: string,
  ) => Effect.Effect<import("effect").Option.Option<{ readonly bytes: Uint8Array; readonly contentType: string }>>;
}

export class ProjectFaviconResolver extends ServiceMap.Service<
  ProjectFaviconResolver,
  ProjectFaviconResolverShape
>()("caide/project/Services/ProjectFaviconResolver") {}
