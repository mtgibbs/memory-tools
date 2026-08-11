---
name: memory-graph
description: Search, traverse, and write the linked memory notes at ~/.claude/projects/*/memory/. Use when you need to find what you already know, see how topics connect, or write a new note. Also for promoting an accepted loop's lessons into notes (memory-promote), proposing constitution amendments from notes (memory-amend), and invalidating stale notes instead of deleting them (memory-stale).
---

# The memory graph

Memory is markdown files at `~/.claude/projects/<project-folder>/memory/*.md`, linked with
`[[wikilinks]]` and `[text](file.md)` links. Every project folder has a `MEMORY.md` index.

Obsidian resolves links across the *whole* vault, so links between project folders work.
Treat it as one graph, not thirteen separate ones.

Commands are on PATH (source: `~/dev/memory-tools`).

## Reading

`MEMORY.md` for the current project is already in your context at session start. Use it first.

When that is not enough:

```bash
memory-graph neighbors <note-name>          # what links to and from it
memory-graph neighbors <note-name> --hops 2 # widen
memory-graph path <note-a> <note-b>         # how two topics connect, if at all
memory-graph keystones                      # the notes everything points at
memory-graph orphans                        # notes nothing reaches
memory-graph realms                         # per-folder summary
```

Add `--json` when you want to process the result.

`memory-graph neighbors` is the one to reach for most. Reading a note file shows what it
points at; it cannot show what points at it. Backlinks only come from this.

## Briefing a spec (how loops read the map)

Before writing a spec's "prior decisions / facts" section, ask the map:

```bash
memory-graph brief <topic terms>
```

Curate the output into the spec. This is the ONLY way loop work consumes the map —
pushed in at authoring time, never pulled at run time. Invalidated notes are
excluded automatically.

## Authored vs inferred — this matters

Every link is tagged:

- **`authored`** — a human or an agent deliberately wrote it. Trust it.
- **`inferred`** — `memory-infer` guessed it from word overlap. It is a suggestion.

A note with many inbound links may look central while being mostly machine-guessed. Check
the split before treating something as important. `memory-graph keystones` shows both counts.

Inferred links live inside this block in each file:

```markdown
<!-- inferred-links:begin -->
## Related (inferred)
...
<!-- inferred-links:end -->
```

**Never edit inside those markers.** The block is regenerated wholesale. Anything you write
there is lost on the next run. Write your links in the body above it.

## Writing a note

One fact per file. The file *is* the unit of linking — a fact buried inside a longer note
can never be pointed at, so it may as well not be in the graph.

```markdown
---
name: <kebab-case-slug>
description: <one line — this is what gets read when deciding relevance>
metadata:
  node_type: memory
  type: user | feedback | project | reference
---

The fact. For `feedback` and `project`, follow with **Why:** and **How to apply:** lines.
Link related notes with [[their-slug]].
```

Then **add a one-line entry to that folder's `MEMORY.md`**. A note with no index entry is
findable only by search, which is the thing the map exists to replace.

Two rules that are easy to get wrong:

- **Do not put content in `MEMORY.md`.** It is a table of contents. Some folders got this
  wrong and their content is unlinkable as a result.
- **Do not name a note `MEMORY`.** Thirteen files already share that name, so `[[MEMORY]]`
  resolves ambiguously.

Link generously. A `[[link]]` to a note that does not exist yet is fine — it shows up as a
hollow node in Obsidian and marks something worth writing.

## Growing the links

```bash
memory-infer            # dry run
memory-infer --write    # edit the files
```

Scores note pairs by shared rare words and writes the best matches into each file.

**Do not run this as part of normal work.** It rewrites dozens of files at once, which
floods the auto-commit hook. It is a scheduled background pass — nightly or weekly.

## Promoting a loop's lessons

A Ralph loop writes what it learns to `progress.txt`. That stays with the loop. It becomes
a memory note only when the work is **accepted** — `passes: true` in `prd.json`.

```bash
memory-promote propose --project <loop-project-dir>
# review: delete drafts you do not want
memory-promote land --project <loop-project-dir> --write
```

Never skip the review step. Drafts land in a review folder, not the vault, exactly so a
failed sandbox run cannot write itself into the notes.

## Proposing law from notes

A note that keeps getting cited as a reason is a candidate constitution amendment.
`memory-amend` is the queue — the human is always the gate:

```bash
memory-amend propose --constitution <repo>/specs/constitution.md   # scope auto-derives to that repo's realm
memory-amend status --constitution ...                             # read-only view of the whole queue
```

Never accept or decline on the user's behalf. Declines are remembered forever.

## Time: invalidate, never delete

A note that describes a situation that ended gets a status, not deletion — later
decisions lean on the history:

```bash
memory-stale propose        # heuristic: in-flight language + old dates; human confirms
memory-stale status
```

Invalidated notes carry `status: expired|superseded` in frontmatter. **Respect it when
reading:** such a note is history, not current truth — do not act on its claims, and do
not link new notes to it. The tools already enforce this (infer skips them, amend won't
propose them, graph labels them ⚠ EXPIRED).

## What does not belong in memory

- Anything the repo already records — code structure, git history, `CLAUDE.md`
- Anything true only of one repo (that goes in that repo's docs)
- Work logs and diaries — git already has them
- Anything from a loop that was not accepted
