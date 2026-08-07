# memory-tools

Three small commands for the Claude Code memory vault at `~/.claude/projects/*/memory/`.

No dependencies. Python 3 standard library only. Nothing runs in the background, nothing
listens on a port, nothing leaves the machine.

## Install

```bash
git clone git@github.com:mtgibbs/memory-tools.git ~/dev/memory-tools
ln -sf ~/dev/memory-tools/bin/memory-graph   ~/.local/bin/memory-graph
ln -sf ~/dev/memory-tools/bin/memory-infer   ~/.local/bin/memory-infer
ln -sf ~/dev/memory-tools/bin/memory-promote ~/.local/bin/memory-promote
```

Symlinks, not copies — `git pull` updates the commands everywhere at once.

## What each one does

### `memory-graph` — walk the notes

Reading a note shows what it points *at*. It cannot show what points *at it* without
scanning every file. That is the expensive direction, so this is what it precomputes.

```bash
memory-graph neighbors project_local_coding_agent   # in and out, one call
memory-graph path note-a note-b                     # how two notes connect, if at all
memory-graph keystones                              # most linked-to notes
memory-graph orphans                                # notes nothing reaches
memory-graph realms                                 # per-folder summary
```

Every link is tagged `authored` (you wrote it) or `inferred` (a script guessed it).
Add `--json` to any subcommand.

Notes are keyed `<folder>/<name>`, not by filename. Thirteen folders each hold a
`MEMORY.md`; treating those as one node invents a fake 2-hop path between every pair
of folders.

### `memory-infer` — grow the links

Scores every pair of notes by shared rare words (TF-IDF cosine) and writes the
strongest matches back into each file as `[[wikilinks]]`, inside a marked block.

```bash
memory-infer                 # dry run — prints what it would add
memory-infer --write         # actually edit the files
memory-infer --min-score 0.2 # stricter
```

The links go **in the markdown**, so Obsidian draws them and git versions them. No
database, no service.

```markdown
<!-- inferred-links:begin -->
## Related (inferred)

- [[claude-memory-vault-setup]] ⇄ — 0.26 · headless, laptop, killed
<!-- inferred-links:end -->
```

Anything inside the markers is machine-guessed and safe to delete. Anything above is
yours. `⇄` means the link crosses into another folder.

Safe to re-run — it strips its own block before re-scoring, so it cannot feed on its
own output or drift. It never duplicates a link you wrote by hand.

**Why word-overlap and not embeddings:** at this size (~88 notes of dense technical
prose) shared rare terms are a strong signal, it needs no dependencies, it runs
offline, it gives the same answer every time, and it can say *why* two notes matched.
Revisit if the notes grow past a few thousand.

**Threshold:** default `0.15`. Below that, notes start matching on generic project
words. At `0.13` an HOA signing-policy note linked to a docs-vs-memory note purely on
the shared word "role" — a link across unrelated subjects, which is exactly wrong.

### `memory-promote` — the door out of a loop

A Ralph loop writes everything it learns to `progress.txt`. Most of that is a diary and
belongs nowhere else. Some is a real lesson worth keeping.

This moves the lessons out — but only for work that was **accepted**, and only after a
human looks.

```bash
memory-promote propose --project ~/dev/ralphere/projects/foo
# delete the drafts you don't want, then
memory-promote land --project ~/dev/ralphere/projects/foo --write
```

The gate is `passes: true` in `prd.json`. A sandbox run that never landed leaves no
trace in your notes.

Drafts are written to a review folder, never straight to the vault. Deleting a draft
*is* the review. Each one records where it came from:

```yaml
metadata:
  source: loop:fakeloop@fb24bfb
  confidence: durable
```

It sorts lessons three ways and only drafts the first two:

| Sorted as | Example | Drafted |
|---|---|---|
| durable | "the sandbox has no DNS, stub it" | yes |
| unclear | "IssueContext.tenantId IS in the spec" | yes |
| repo-specific | "src/api/findings.ts already exposes…" | no |

A line naming a file inside one repo is only true of that repo. It's a guess, and
skipped lines are listed with `--verbose` so nothing disappears quietly.

## `vault-config/`

Drop-in Obsidian settings that make the folders one map. See `vault-config/README.md`.
The key move: open `~/.claude/projects/` as the vault, not one project's `memory/`
folder — Obsidian resolves `[[links]]` across the whole vault, so the split into
folders was only ever a matter of where you pointed it.

## When to run what

| | When |
|---|---|
| `memory-graph` | any time you need to find or connect something |
| `memory-infer` | on a schedule — nightly or weekly, never per-session |
| `memory-promote` | when a loop's work gets accepted |

`memory-infer` rewrites dozens of files. Running it every session would churn the whole
vault and flood the auto-commit hook. It is a background pass, not an inline step.
