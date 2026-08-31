// FILE: AddSkillDialog.tsx
// Purpose: Modal dialog for creating a new custom agent skill with markdown formatting.
// Layer: Settings UI component

import { useState } from "react";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { toastManager } from "~/components/ui/toast";
import { ensureNativeApi } from "~/nativeApi";

export interface AddSkillDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: () => void;
}

const DEFAULT_STARTER_MARKDOWN = `# Skill Instructions

Describe the workflow, constraints, and requirements for this skill:

- Goal: 
- Requirements:
- Best Practices:
`;

export function AddSkillDialog({ open, onOpenChange, onCreated }: AddSkillDialogProps) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState(DEFAULT_STARTER_MARKDOWN);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setDisplayName("");
    setDescription("");
    setContent(DEFAULT_STARTER_MARKDOWN);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    if (!cleanName) {
      setError("Please provide a valid skill identifier.");
      return;
    }
    if (!content.trim()) {
      setError("Please provide skill instructions.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const api = ensureNativeApi();
      await api.provider.createCustomSkill({
        name: cleanName,
        displayName: displayName.trim() || undefined,
        description: description.trim() || undefined,
        content: content.trim(),
      });

      toastManager.add({
        type: "success",
        title: "Skill created",
        description: `Skill "/${cleanName}" is now available across your projects.`,
      });

      resetForm();
      onCreated?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-xl">
        <form onSubmit={handleSave} className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Add Custom Skill</DialogTitle>
            <DialogDescription>
              Custom skills are saved to your Caide skills folder and can be invoked with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">/name</code>{" "}
              in the composer.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label htmlFor="skill-name" className="font-medium text-foreground">
                Skill Identifier (Slug) <span className="text-destructive">*</span>
              </label>
              <Input
                id="skill-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. database-migration, flutter-auth"
                className="h-8 text-xs font-mono"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Command used to invoke the skill: <code className="text-foreground">/{name ? name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-") : "identifier"}</code>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="skill-display-name" className="font-medium text-foreground">
                  Display Name
                </label>
                <Input
                  id="skill-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Database Migration"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="skill-description" className="font-medium text-foreground">
                  Short Summary
                </label>
                <Input
                  id="skill-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Schema changes & rollback rules"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="skill-content" className="font-medium text-foreground">
                Skill Instructions (Markdown) <span className="text-destructive">*</span>
              </label>
              <textarea
                id="skill-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="# Skill Instructions..."
                rows={9}
                className="w-full rounded-lg border border-input bg-background/50 p-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>
          </div>

          <DialogFooter className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Saving..." : "Create Skill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
