# Agent Skills

Use agent skills to extend Codex with task-specific capabilities. A skill packages instructions, resources, and optional scripts so Codex can follow a workflow reliably. You can share skills across teams or with the community. Skills build on the [open agent skills standard](https://agentskills.io).

Skills are available in the Codex CLI, IDE extension, and Codex app.

Skills use **progressive disclosure** to manage context efficiently: Codex starts with each skill's metadata (`name`, `description`, file path, and optional metadata from `agents/openai.yaml`). Codex loads the full `SKILL.md` instructions only when it decides to use a skill.

A skill is a directory with a `SKILL.md` file plus optional scripts and references. The `SKILL.md` file must include `name` and `description`.

<FileTree
  class="mt-4"
  tree={[
    {
      name: "my-skill/",
      open: true,
      children: [
        {
          name: "SKILL.md",
          comment: "Required: instructions + metadata",
        },
        {
          name: "scripts/",
          comment: "Optional: executable code",
        },
        {
          name: "references/",
          comment: "Optional: documentation",
        },
        {
          name: "assets/",
          comment: "Optional: templates, resources",
        },
        {
          name: "agents/",
          open: true,
          children: [
            {
              name: "openai.yaml",
              comment: "Optional: appearance and dependencies",
            },
          ],
        },
      ],
    },

]}
/>

## How Codex uses skills

Codex can activate skills in two ways:

1. **Explicit invocation:** Include the skill directly in your prompt. In CLI/IDE, run `/skills` or type `$` to mention a skill.
2. **Implicit invocation:** Codex can choose a skill when your task matches the skill `description`.

Because implicit matching depends on `description`, write descriptions with clear scope and boundaries.

## Create a skill

Use the built-in creator first:

```text
$skill-creator
```

The creator asks what the skill does, when it should trigger, and whether it should stay instruction-only or include scripts. Instruction-only is the default.

You can also create a skill manually by creating a folder with a `SKILL.md` file:

```md
---
name: skill-name
description: Explain exactly when this skill should and should not trigger.
---

Skill instructions for Codex to follow.
```

Codex detects skill changes automatically. If an update doesn't appear, restart Codex.

## Where to save skills

Codex reads skills from repository, user, admin, and system locations. For repositories, Codex scans `.agents/skills` in every directory from your current working directory up to the repository root. If two skills share the same `name`, Codex doesn't merge them; both can appear in skill selectors.

| Skill Scope | Location                                                                                                  | Suggested use                                                                                                                                                                                        |
| :---------- | :-------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REPO`      | `$CWD/.agents/skills` <br /> Current working directory: where you launch Codex.                           | If you're in a repository or code environment, teams can check in skills relevant to a working folder. For example, skills only relevant to a microservice or a module.                              |
| `REPO`      | `$CWD/../.agents/skills` <br /> A folder above CWD when you launch Codex inside a Git repository.         | If you're in a repository with nested folders, organizations can check in skills relevant to a shared area in a parent folder.                                                                       |
| `REPO`      | `$REPO_ROOT/.agents/skills` <br /> The topmost root folder when you launch Codex inside a Git repository. | If you're in a repository with nested folders, organizations can check in skills relevant to everyone using the repository. These serve as root skills available to any subfolder in the repository. |
| `USER`      | `$HOME/.agents/skills` <br /> Any skills checked into the user's personal folder.                         | Use to curate skills relevant to a user that apply to any repository the user may work in.                                                                                                           |
| `ADMIN`     | `/etc/codex/skills` <br /> Any skills checked into the machine or container in a shared, system location. | Use for SDK scripts, automation, and for checking in default admin skills available to each user on the machine.                                                                                     |
| `SYSTEM`    | Bundled with Codex by OpenAI.                                                                             | Useful skills relevant to a broad audience such as the skill-creator and plan skills. Available to everyone when they start Codex.                                                                   |

Codex supports symlinked skill folders and follows the symlink target when scanning these locations.

## Install skills

To install skills beyond the built-ins, use `$skill-installer`:

```bash
$skill-installer install the linear skill from the .experimental folder
```

You can also prompt the installer to download skills from other repositories. Codex detects newly installed skills automatically; if one doesn't appear, restart Codex.

## Enable or disable skills

Use `[[skills.config]]` entries in `~/.codex/config.toml` to disable a skill without deleting it:

```toml
[[skills.config]]
path = "/path/to/skill/SKILL.md"
enabled = false
```

Restart Codex after changing `~/.codex/config.toml`.

## Optional metadata

Add `agents/openai.yaml` to configure UI metadata in the [Codex app](https://developers.openai.com/codex/app), to set invocation policy, and to declare tool dependencies for a more seamless experience with using the skill.

```yaml
interface:
  display_name: "Optional user-facing name"
  short_description: "Optional user-facing description"
  icon_small: "./assets/small-logo.svg"
  icon_large: "./assets/large-logo.png"
  brand_color: "#3B82F6"
  default_prompt: "Optional surrounding prompt to use the skill with"

policy:
  allow_implicit_invocation: false

dependencies:
  tools:
    - type: "mcp"
      value: "openaiDeveloperDocs"
      description: "OpenAI Docs MCP server"
      transport: "streamable_http"
      url: "https://developers.openai.com/mcp"
```

`allow_implicit_invocation` (default: `true`): When `false`, Codex won't implicitly invoke the skill based on user prompt; explicit `$skill` invocation still works.

## Best practices

- Keep each skill focused on one job.
- Prefer instructions over scripts unless you need deterministic behavior or external tooling.
- Write imperative steps with explicit inputs and outputs.
- Test prompts against the skill description to confirm the right trigger behavior.

For more examples, see [github.com/openai/skills](https://github.com/openai/skills) and [the agent skills specification](https://agentskills.io/specification).