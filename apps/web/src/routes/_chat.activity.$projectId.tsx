import { createFileRoute } from "@tanstack/react-router";

import { ProjectActivityView } from "~/components/activity/ProjectActivityView";

import { ProjectId } from "@caide/contracts";

function ProjectActivityRouteView() {
  const { projectId } = Route.useParams();
  return <ProjectActivityView projectId={projectId as ProjectId} />;
}

export const Route = createFileRoute("/_chat/activity/$projectId")({
  component: ProjectActivityRouteView,
});
