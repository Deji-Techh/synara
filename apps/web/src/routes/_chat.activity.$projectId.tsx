import { createFileRoute } from "@tanstack/react-router";

import { ProjectActivityView } from "~/components/activity/ProjectActivityView";

function ProjectActivityRouteView() {
  const { projectId } = Route.useParams();
  return <ProjectActivityView projectId={projectId} />;
}

export const Route = createFileRoute("/_chat/activity/$projectId")({
  component: ProjectActivityRouteView,
});