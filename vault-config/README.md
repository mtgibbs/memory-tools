# Obsidian vault config for the memory corpus

Drop-in `.obsidian/` config that makes the realm architecture visible in graph view.

## Install

The vault root is `~/.claude/projects/`. Every one of the 86 memory files lives in a
`<project-slug>/memory/` subfolder, and **there are zero other markdown files under that tree** —
so the vault sees the memory corpus and nothing else.

```bash
mkdir -p ~/.claude/projects/.obsidian
cp graph.json app.json ~/.claude/projects/.obsidian/
```

Then in Obsidian: *Open folder as vault* → `~/.claude/projects`.

Non-markdown noise (334 `.jsonl` transcripts, 291 `.json`) is excluded via `userIgnoreFilters` in
`app.json` and never reaches the graph regardless, since Obsidian only graphs markdown.

**Why the parent directory is the vault root:** Obsidian resolves `[[wikilinks]]` *vault-wide*, not
folder-wide. Opening one project's `memory/` folder gives you one island. Opening the parent makes
all 13 realms a single graph where cross-realm links resolve. **The silo is a vault-scoping
choice, not a property of the data** — no migration required to undo it.

## What the settings do

| Setting | Value | Why |
|---|---|---|
| `hideUnresolved` | `false` | **The whole point.** Unresolved `[[links]]` render as their own nodes — this is how a stub into an absent realm shows up as a hollow node. Turning this on hides the gaps. |
| `showOrphans` | `true` | Unlinked notes stay visible. With 86 notes and only 89 links, a lot of the corpus is orphaned — hiding it would flatter the graph. |
| `showAttachments` | `false` | Keeps transcripts out. |
| `nodeSizeMultiplier` | `1.4` | Node size already scales with incoming links, so keystones grow on their own. This just amplifies it. |
| `showArrow` | `true` | Direction matters here — ideas→work is a push, work→ideas is a publish. |
| `textFadeMultiplier` | `-0.8` | Labels stay readable when zoomed out, so the map is legible when shown to other people. |

## Color groups

Listed **identity tier first** — in Obsidian the first matching group wins, so `feedback_*` and
`user_*` notes keep their gold color even inside a realm's color band. That's deliberate: the
identity tier is the most densely-linked material in the corpus and should read as a layer that
cuts across realms rather than belonging to any one of them.

| Color | Group |
|---|---|
| gold | identity tier (`feedback_*`, `user_*`) |
| blue | pi-cluster |
| green | hoa |
| orange | ai-research |
| purple | mtgibbs.xyz |
| red | explore-k3s-cluster-game |

**Fixed 2026-08-10 — groups key on frontmatter, not filenames.** Obsidian search matches
frontmatter text, so the groups now query content: gold = `"type: feedback" OR "type: user"`
(catches every naming convention, hoa included), and an ash group for
`"status: expired" OR "status: superseded"` sits FIRST — group order is first-match-wins, so an
invalidated note looks dead no matter what else it is. The graph now shows the same three signals
the tools respect: realm (color band), identity tier (gold), and time (ash).

## What you will actually see today

Measured 2026-08-07 across all 86 files:

- **89 wikilinks total** — 83 resolve within their own project, **1 crosses projects**, 5 unresolved.
- So the graph is **13 disconnected islands**, not a cloud. pi-cluster is 47 of 86 files and holds
  nearly all the link density.
- The vault is necessary but not sufficient. It removes the *structural* barrier to a connected
  graph; the missing piece is linking discipline, which no config can supply.

### The ghost nodes are the interesting part

Five unresolved links render hollow today. One of them is the architecture appearing on its own:

- `[[coredns-forward-gotcha]]` — a real note, but it lives in `~/dev/pi-cluster/memory/` (the
  in-repo prose convention), **not** in the harness memory tree. A note in one store is already
  reaching for a note in a different store and failing. That is precisely the cross-realm stub
  case, occurring naturally, unprompted.
- `[[everything-as-code]]` — almost certainly meant `feedback_everything_as_code`; a naming
  mismatch, not a missing note.
- `[[family-board]]`, `[[silver-intake-sink]]`, `[[canvas-summer-only-ronin]]` — referenced, never
  written.

### Empirical keystones

Top nodes by incoming links, which is exactly what graph view sizes on:

| Links | Note | Realm |
|---|---|---|
| 17 | `project_local_coding_agent` | pi-cluster |
| 5 | `feedback_drive_ops_directly` | pi-cluster |
| 5 | `feedback_agent_safety_pr_gated` | pi-cluster |
| 5 | `user_digital_homesteading` | pi-cluster |
| 4 | `feedback_docs_over_memory` | pi-cluster |
| 4 | `hoa-minutes-use-exact-values` | hoa |

`project_local_coding_agent` is a genuine hub at 17 inbound — more than 3× the next node. And **6
of the top 10 are `feedback_*` / `user_*`**, which is a real empirical result: the identity tier is
already the most-connected material in the corpus. That is a strong argument for it being the tier
that replicates across machines and subscriptions — it is doing the connective work.
