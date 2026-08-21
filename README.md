# memory-tools

Five small commands that turn a directory of markdown notes into a linked,
time-aware memory graph for coding agents. Extracted live from a working
setup — the decision ledgers in `state/` and the tuning stories in the code
comments are left in on purpose: they are part of the explanation, not
accidents. One person's real corpus shaped every threshold in here.

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
memory-graph challenged                             # claims marked doubted, not yet resolved
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

### `memory-amend` — the Rule Proposer

A constitution is founding intent — it does not morph. Change arrives as
**amendments**: proposed from the notes, ratified by a human, appended as a
separate vessel. (Terms per GitHub spec-kit's constitution workflow and the
MAC paper's Rule Proposer role; the ratifier here stays human on purpose.)

```bash
memory-amend propose --constitution <repo>/specs/constitution.md
# review drafts in amendment-review/, then per candidate:
memory-amend accept <note>    # prints the block to PR into specs/amendments.md
memory-amend decline <note>   # remembered forever — never proposed again
```

**Scope is derived, not configured:** a constitution is a realm's own law, so by
default only notes from the repo's own vault realm (worktree checkouts included)
may propose against it. HOA notes can't leak into pi-cluster's queue because they
were never in scope — absence, not filtering. `--realm <slug>` overrides,
`--all-realms` opts out explicitly and says so in the output.

Notes that *explicitly* say "propose as a constitution upgrade" always rank
first — a deliberate proposal beats any volume of imperative phrasing.
Declines persist in `state/amendment-decisions.jsonl` (append-only), so a
rejected rule stays rejected. The tool never edits a constitution and never
opens a PR — the PR review is the ratification, and it is yours.

### `memory-stale` — invalidation, never deletion

A stale note was true when written and wrong now. It gets a status, not deleted —
later decisions lean on the history (the Zep/Graphiti bi-temporal idea):

```
status: expired | superseded
invalidated: YYYY-MM-DD
superseded_by: <note-name>     # superseded only
```

Git records when a note was written; this records when it stopped holding.
Queue shape, human-gated: `propose` (heuristic: in-flight language AND newest
mentioned date older than --age-days) → edit the proposal → `confirm` applies
the frontmatter, or `keep` marks it live forever.

The other tools respect the mark: `memory-infer` skips invalidated notes,
`memory-amend` won't propose them as law, `memory-graph` labels them
`⚠ EXPIRED — history, not current`.

Sharp edge: `confirm`/`keep` write the global decision ledger regardless of
--vault — don't rehearse decisions against a copy.

### `memory-graph brief` — how loops read the map

Loops never pull from the map at run time. They read it through the spec: §6
("prior decisions / facts the implementer must know") gets filled at authoring
time, and every fresh iteration reads it as part of the spec. `brief` generates
that block:

```bash
memory-graph brief verify gate false-green   # §6-ready markdown, top 5 notes
```

Ranked by term match, authored links listed, invalidated notes excluded —
history must not brief new work. Curate before pasting; it's a draft, not an
oracle, and it says so in its own header comment.

### `memory-graph spheregrid` — the atlas that holds still

The force map makes every edge a force, so a note that reaches into five realms
gets dragged to the barycentre and the realm structure smears. It fights that
with three separate corrections — crippled boundary springs, a per-realm field,
a pre-pass that packs anchors before physics starts — which is three attempts to
make a simulation stop simulating.

This one assigns positions instead.

```bash
memory-graph spheregrid                        # centred on this project
memory-graph spheregrid --center pi-cluster    # centred somewhere else
memory-graph spheregrid --min-galaxy 4         # under 4 notes renders as minor
```

- **radius** is hops from that realm's anchor — the note with the most authored
  inbound links from inside its own realm
- within a hop, **angle** is set by a golden-angle spiral, most-connected first

Radius stays readable, and the output is byte-identical on every run over an
unchanged corpus — so a place on the map can be pointed at twice. That is the
thing the force map cannot do.

**There is no centre.** Realms are peers packed to fill the frame, largest first,
each taking the free spot nearest the middle. An earlier version put `--center`
at the origin and ranked the rest by corridor distance, which made one arbitrary
realm the subject of the whole map — pi-cluster sat in the middle because it was
the biggest, which is not a reason. `--center` now only marks *where you are*.

**Notes pack at constant density, not on fixed rings.** One circle per hop wastes
the disc whenever a band is thin: `notes-from-hearing` runs 1/6/4/1 across four
hops, so its last lonely note sat at radius 100 and set the size of a disc whose
other eleven were bunched inside 63. Every small realm rendered as a few dots
marooned in a large empty circle. A Vogel spiral (`r = c·√i`, golden-angle step)
fixes spacing instead of radii, so a disc's size tracks how many notes it holds.
Hop boundaries are still recorded as they pass, and still drawn as rings.

Physics survives as animation only. Springs pull each node to its assigned slot;
dragging displaces a node and letting go returns it. Nothing at run time can
change where a note lives.

**One world, camera moves.** Nothing is re-laid-out on navigation, so pi-cluster
is always in the same place and you can learn where things are. Every note draws
at every zoom — the packed lattice *is* the picture, and a level-of-detail rule
that hides it until you zoom in is answering a question this corpus does not ask.
Collapsing a realm to a single blob is the graceful degradation for zooming far
out, not the resting state.

**`--center` is the entry point, not a preference.** An agent working in
pi-cluster enters the map at pi-cluster's root, so radius means "hops from where
I came in." Default is `auto`: the realm slug for the current directory, which is
the absolute path with every separator turned into a dash — the same rule Claude
Code uses to name the folder.

Expired notes stay drawn as hollow outlines. They are terrain, not deletions —
the FFX grid keeps its unlit regions on screen, and so does this. Challenged
claims get a broken ring. Inferred links are ghost chords, **off by default**:
vocabulary overlap drawn at the same weight as something you wrote is how machine
echo starts looking like corroboration.

`?ambient` gives the wall display a slow tour with no chrome.
