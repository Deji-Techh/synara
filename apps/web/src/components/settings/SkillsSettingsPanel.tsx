// FILE: SkillsSettingsPanel.tsx
// Purpose: Settings → Skills panel. Lists every skill from the unified cross-provider
// catalog (~/.caide/skills plus system harness skills), allows adding custom skills,
// and manages toggles (system skills are always active, custom skills can be toggled).

import { useState } from "react";
import type { ProviderKind, ServerSettings } from "@caide/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ProviderIcon } from "~/components/ProviderIcon";
import { SettingsRow, SettingsSection } from "~/components/settings/SettingsPanelPrimitives";
import { Switch } from "~/components/ui/switch";
import { Button } from "~/components/ui/button";
import { PlusIcon, SkillCubeIcon } from "~/lib/icons";
import { ensureNativeApi } from "~/nativeApi";
import {
  providerDiscoveryQueryKeys,
  skillsCatalogQueryOptions,
} from "~/lib/providerDiscoveryReactQuery";
import { serverQueryKeys, serverSettingsQueryOptions } from "~/lib/serverReactQuery";
import {
  buildSettingsSkillGroups,
  buildSettingsSkillSections,
  providerDisplayName,
  settingsSkillNameKey,
} from "./skillsSettingsModel";
import { AddSkillDialog } from "./AddSkillDialog";

function SkillProviderStack({ providers }: { providers: ReadonlyArray<ProviderKind> }) {
  if (providers.length === 0) {
    return null;
  }

  const label = providers.map(providerDisplayName).join(", ");
  const stackLabel = `Provider ${providers.length === 1 ? "copy" : "copies"}: ${label}`;
  return (
    <span
      className="inline-flex shrink-0 items-center -space-x-1"
      aria-label={stackLabel}
      title={stackLabel}
    >
      {providers.map((provider) => (
        <span
          key={provider}
          className="inline-flex size-4 items-center justify-center rounded-full border border-background bg-background"
        >
          <ProviderIcon provider={provider} className="size-3" />
        </span>
      ))}
    </span>
  );
}

export function SkillsSettingsPanel() {
  const queryClient = useQueryClient();
  const catalogQuery = useQuery(skillsCatalogQueryOptions());
  const serverSettingsQuery = useQuery(serverSettingsQueryOptions());
  const [isAddSkillOpen, setIsAddSkillOpen] = useState(false);

  const disabledSkillNames = new Set(
    (serverSettingsQuery.data?.skills.disabled ?? []).map((name) => settingsSkillNameKey(name)),
  );

  const skillGroups = buildSettingsSkillGroups(catalogQuery.data?.skills ?? []);
  const skillSections = buildSettingsSkillSections(catalogQuery.data?.skills ?? []);

  const isSystemGroup = (group: (typeof skillGroups)[number]) =>
    group.sources.some((s) => s.origin === "system" || s.origin === "caide");

  const customSkillGroups = skillGroups.filter((group) => !isSystemGroup(group));
  const systemSkillGroups = skillGroups.filter((group) => isSystemGroup(group));

  const setSkillEnabled = (skillName: string, enabled: boolean) => {
    const latestSettings = queryClient.getQueryData<ServerSettings>(serverQueryKeys.settings());
    const currentDisabled = latestSettings?.skills.disabled ?? [...disabledSkillNames];
    const key = settingsSkillNameKey(skillName);
    const next = new Set(currentDisabled.map((name) => settingsSkillNameKey(name)));
    if (enabled) {
      next.delete(key);
    } else {
      next.add(key);
    }
    const disabled = [...next].sort();
    if (latestSettings) {
      queryClient.setQueryData(serverQueryKeys.settings(), {
        ...latestSettings,
        skills: { disabled },
      });
    }
    void ensureNativeApi()
      .server.updateSettings({ skills: { disabled } })
      .then((nextSettings) => {
        queryClient.setQueryData(serverQueryKeys.settings(), nextSettings);
        void queryClient.invalidateQueries({ queryKey: providerDiscoveryQueryKeys.all });
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
      });
  };

  const setAllCustomSkillsEnabled = (enabled: boolean) => {
    const latestSettings = queryClient.getQueryData<ServerSettings>(serverQueryKeys.settings());
    const next = new Set(
      (latestSettings?.skills.disabled ?? [...disabledSkillNames]).map((name) =>
        settingsSkillNameKey(name),
      ),
    );
    const customNames = customSkillGroups.map((group) =>
      settingsSkillNameKey(group.primarySkill.name),
    );
    if (enabled) {
      for (const key of customNames) {
        next.delete(key);
      }
    } else {
      for (const key of customNames) {
        next.add(key);
      }
    }
    const disabled = [...next].sort();
    if (latestSettings) {
      queryClient.setQueryData(serverQueryKeys.settings(), {
        ...latestSettings,
        skills: { disabled },
      });
    }
    void ensureNativeApi()
      .server.updateSettings({ skills: { disabled } })
      .then((nextSettings) => {
        queryClient.setQueryData(serverQueryKeys.settings(), nextSettings);
        void queryClient.invalidateQueries({ queryKey: providerDiscoveryQueryKeys.all });
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
      });
  };

  const totalSkills = skillGroups.length;
  const totalCustomSkills = customSkillGroups.length;
  const enabledCustomSkills = customSkillGroups.filter(
    (group) => !disabledSkillNames.has(group.key),
  ).length;
  const allCustomSkillsDisabled = totalCustomSkills > 0 && enabledCustomSkills === 0;
  const caideSkillsDir = catalogQuery.data?.caideSkillsDir;

  return (
    <div className="space-y-8">
      <SettingsSection
        title="Portable skills"
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => setIsAddSkillOpen(true)}
          >
            <PlusIcon className="size-3.5" />
            <span>Add skill</span>
          </Button>
        }
      >
        <SettingsRow
          title="Disable all custom skills"
          description="Turn every custom skill off at once. Built-in system skills are always active."
          status={
            <span className="text-xs font-medium text-muted-foreground">
              {catalogQuery.isLoading
                ? "Scanning…"
                : totalCustomSkills === 0
                  ? `${systemSkillGroups.length} system skills active`
                  : `${enabledCustomSkills} of ${totalCustomSkills} custom skill${totalCustomSkills === 1 ? "" : "s"} enabled`}
            </span>
          }
          control={
            <Switch
              checked={allCustomSkillsDisabled}
              disabled={totalCustomSkills === 0}
              onCheckedChange={(checked) => setAllCustomSkillsEnabled(!Boolean(checked))}
              aria-label={
                allCustomSkillsDisabled ? "Enable all custom skills" : "Disable all custom skills"
              }
            />
          }
        />
        <SettingsRow
          title="Caide skills folder"
          description="Skills placed here are available on every provider. When a provider already ships its own copy of a skill, that copy is used; otherwise Caide's copy is the fallback."
          status={
            caideSkillsDir ? (
              <code className="break-all text-[11px] text-muted-foreground">{caideSkillsDir}</code>
            ) : null
          }
        />
      </SettingsSection>

      {catalogQuery.isError ? (
        <SettingsSection title="Skills">
          <SettingsRow
            title="Skill discovery failed"
            description="Caide could not scan the skill folders. Retry after checking that the server is running."
          />
        </SettingsSection>
      ) : null}

      {!catalogQuery.isLoading && !catalogQuery.isError && totalSkills === 0 ? (
        <SettingsSection title="Skills">
          <SettingsRow
            title="No skills found"
            description="Click 'Add skill' above to create custom skills, or place markdown skill folders into ~/.caide/skills."
          />
        </SettingsSection>
      ) : null}

      {skillSections.map((section) => {
        return (
          <SettingsSection key={section.key} title={section.title}>
            {section.groups.map((group) => {
              const isSystem = isSystemGroup(group);
              const enabled = isSystem ? true : !disabledSkillNames.has(group.key);
              return (
                <SettingsRow
                  key={group.key}
                  title={
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <SkillCubeIcon
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="truncate">{group.displayName}</span>
                      {isSystem ? (
                        <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          System
                        </span>
                      ) : null}
                    </span>
                  }
                  description={group.description}
                  status={
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <SkillProviderStack providers={group.providers} />
                        <span className="truncate text-[11px] text-muted-foreground">
                          {group.sources.map((source) => source.originInfo.label).join(" · ")}
                        </span>
                      </span>
                      {group.sources.map((source) => (
                        <code
                          key={source.skill.path}
                          className="truncate text-[11px] text-muted-foreground"
                        >
                          {source.skill.path}
                        </code>
                      ))}
                    </span>
                  }
                  control={
                    <Switch
                      checked={enabled}
                      disabled={isSystem}
                      onCheckedChange={(checked) =>
                        setSkillEnabled(group.primarySkill.name, Boolean(checked))
                      }
                      aria-label={
                        isSystem
                          ? `${group.displayName} is a system skill and is always enabled`
                          : `Enable the ${group.displayName} skill`
                      }
                    />
                  }
                />
              );
            })}
          </SettingsSection>
        );
      })}

      <AddSkillDialog
        open={isAddSkillOpen}
        onOpenChange={setIsAddSkillOpen}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: providerDiscoveryQueryKeys.all });
        }}
      />
    </div>
  );
}
