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
memory-graph where                                  # which realm is this directory
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

#### `where` — the entry point

A session opens in a directory and has no idea the rest of the vault exists.

```
$ memory-graph where --path ~/dev/pi-cluster
-Users-mtgibbs-dev-pi-cluster
  59 notes · 1 invalidated · about: project_local_coding_agent
  start here
     18 in   project_local_coding_agent
     10 in   feedback_agent_safety_pr_gated
  borders
      6 authored ( 8 total)  -Users-mtgibbs-dev-rethink-memory-and-visualization
      0 authored ( 3 total)  -Users-mtgibbs-ai-research
```

The obvious alternative is a master router at the vault root listing every realm,
and it is the wrong shape: **a router you load has to stay small.** At a few
hundred realms that document is ~25KB of index spent every session to answer a
question that needs three entries. A router you *query* has no size limit, so
this returns only the realm you are in and what borders it.

Entry points rank on **authored** inbound only, the same rule `keystones` uses.
An agent asking "where do I start reading" must not be handed the note that
merely shares the most vocabulary.

The realm slug is the absolute path with separators **and dots** collapsed to
dashes. The dot rule is not a guess — the vault holds
`…-mtgibbs-xyz--claude-worktrees-feat-…`, and only dot-collapsing produces that
doubled dash. Separator-only mapping silently misses every worktree checkout,
which is exactly where a session tends to be sitting when it asks. A worktree
with no notes of its own reports the realm it was cut from.

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

- the **anchor** sits at the hub — the note with the most authored inbound links
  from inside its own realm
- every other note joins a **pod**: a ring of up to six notes that all declare
  the same `type` in frontmatter, chained outward from the hub by visible track
- **hop distance** from the anchor survives as lightness, and in the tooltip

Radius stays readable, and the output is byte-identical on every run over an
unchanged corpus — so a place on the map can be pointed at twice. That is the
thing the force map cannot do.

**There is no centre.** Realms are peers packed to fill the frame, largest first,
each taking the free spot nearest the middle. An earlier version put `--center`
at the origin and ranked the rest by corridor distance, which made one arbitrary
realm the subject of the whole map — pi-cluster sat in the middle because it was
the biggest, which is not a reason. `--center` now only marks *where you are*.

**Position encodes type, not distance.** Hop distance was a real signal, but it
competed with `type` for the same axis and type is the one you can act on: the
notes already declare it (45 feedback, 31 project, 19 reference, 4 user across
this vault), so the make-up of a realm is legible before you read a label. Pods
of one type chain outward from the anchor, and rows fill to **capacity** rather
than a fixed fan — a fan put a two-pod group at the same bearing on consecutive
rows, one pod directly behind the other, which read as a spike shooting out of
the hub while the rest of the disc stayed empty. How many pods fit is a question
about arc length at a given radius, so that is what gets asked.

**Three kinds of line, and they must not be confusable.** Steel and straight is
**track** — pod rings and the spokes that chain them. It is structure, it carries
no data, and it never lights up. A tinted curve is a **link**; a dotted one is
inferred. Between realm discs, a lavender ribbon is a **corridor**. Hovering a
note pushes track down and lifts its links, so the only lines that answer are
real ones.

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

**Zoom discloses; it does not just magnify.** Click a galaxy and it becomes the
subject of the frame — the camera goes in and everything else recedes to 16%,
without re-laying anything out, so you can still see where you are relative to
your neighbours. Escape, or a click into the void, backs out. Note labels tier
on zoom measured against the fitted scale (so a laptop and the wall display
behave alike): anchors, then hubs, then everything. A focused galaxy names all
of its notes regardless.

Labels are **placed**, not just drawn. The spiral packs notes 21 units apart
while a name is ten times that wide, so candidates are ranked — hovered, then
anchors, then by degree — and any whose box overlaps one already placed is
dropped. The important ones get the room; the rest wait for zoom or hover.

#### The art direction is load-bearing

The reference is FFX's sphere grid, and its defining feature is that nodes sit
**on visible track** — small rings joined by line, not a field of dots. Our links
are semantic: they say what relates to what, they do not describe the shape you
are standing on. So the shape gets drawn too, and the generator computes it,
because the generator is the thing that knows which `type` a note declared.
**The track carries no data on purpose** — it is the board, and the chords are
the moves.

The rest, in order of how much it changed:

- **The void has depth.** A seeded 900-point starfield in world space, so it
  parallaxes for free when you pan, plus a screen-space vignette. Flat black
  reads as *nothing here*; a field with depth reads as space with things in it.
- **Bloom is coloured and local.** First attempt stacked twelve discs at `.05`
  over 4.4× the node radius and fogged the lattice, the rims and the ticks into
  milk. Bloom now uses a saturated, *darker* colour than the body — blooming the
  near-white body colour is what made the haze.
- **Nodes are beads, not dots.** One offset highlight arc reads as a lit sphere
  and costs one more `arc()`, where a per-node gradient would cost 106
  allocations a frame.
- **The rim is an instrument, not a diagram.** A fine ring with 36 graduations,
  every ninth one long. A dashed circle costs the same and says less.
- **Type says what kind of thing you're reading.** Tracked small caps for place
  names, monospace for file names. One of these is territory; one is files.

Glow is a cached sprite per colour, not `shadowBlur` — same falloff, paid once
instead of 106 times a frame.

#### Two vaults, one map

Work memory lives in its own vault, not as prefixed realms inside the personal
one — deliberately, so neither is ever copied into the other. `--also-work`
merges a second root at read time and marks its realms `work--`:

```bash
memory-graph --also-work ~/work-memories/projects spheregrid
memory-graph --also-work ~/work-memories/projects where     # resolves either side
```

The work/personal apparatus was already in here — boundary edges, the lock glyph
on a crossing corridor, `work--` realm names — and **nothing had ever populated
it**, so the split rendered with everything on one side. Merged, this vault reads
366 notes across 35 realms, with 8 boundary links over 2 crossing corridors.

Each side gets its own hemisphere. A lock on a crossing only means something if
there is a line to cross; interleaved, the glyph marks a boundary the layout does
not have. Packing is still largest-first into the nearest free spot — a realm on
the wrong side just pays for the distance, so the split is a strong preference
rather than a wall.

#### What actually made it slow

Merged, the map is 366 notes and it lagged. Measured before touching anything:
**avg 11.4 ms, p95 56 ms, 11,309 canvas calls a frame.**

Cutting calls to 6,950 (39% off) barely moved the average and did nothing for
the spikes — **it was never call-bound.** What it is:

- **`backdrop-filter: blur()` on the panels.** A canvas repainting at 60fps
  underneath forces the browser to re-blur those regions every frame. Deleted.
  This one is invisible to a profiler that hides the chrome before measuring,
  which is exactly what mine did — it was found by reasoning about what the
  measurement could not see.
- **Fillrate, not draw calls.** At `devicePixelRatio` 2 the backing store is
  3200×2000 = 6.4M pixels, and the background *and* the vignette each covered
  all of it every frame. The backing store is capped at 1.5 (44% fewer pixels,
  indistinguishable on a starfield and soft gradients) and the vignette is
  pre-rendered once per resize and blitted instead of shaded.
- **Allocation.** 35 radial gradients and ~470 colour strings were built per
  frame. Both are now built once.

Also cheaper, and worth having anyway: viewport culling in every pass (at 35
realms most of the map leaves the screen the moment you zoom), eight batched
star tiers instead of 900 individual arcs, and skipping bead highlights and rim
graduations below the size where they resolve.

> **Caveat, stated plainly:** the p95 number is not trustworthy in a headless
> harness that calls `draw()` in a tight synchronous loop — ablation showed the
> spikes were identical with every feature disabled, which means they are the
> measurement, not the page. The average and the call counts are real; the
> spike fixes are reasoned, not verified.

`?ambient` gives the wall display a slow tour with no chrome.

#### `--data`, and the Obsidian plugin

```bash
memory-graph spheregrid --data ~/.claude/projects/spheregrid.json
```

Writes the layout payload instead of a page. `obsidian-plugin/` renders that file
as a workspace view; click a note and it opens in a split beside the map.

**There is one renderer.** `templates/spheregrid.render.js` is inlined into the
standalone HTML by this command and *imported* by the plugin — not copied. Two
renderers would drift, and the drift would be invisible until someone noticed the
two views disagreed about the map. Layout is not reimplemented either: it is
computed here and the plugin is a viewer.

`tests/pane-hittest.py` covers the mapping that made this hard: the renderer
originally sized itself from `innerWidth` and hit-tested with `ev.clientX`, which
are the canvas's own box on a standalone page and wrong by the pane's origin
anywhere else — so in Obsidian nothing was clickable and only panning worked. The
test puts the canvas at an offset in a differently-sized box and clicks the exact
centre of eight nodes.

The plugin is the answer to "should we build our own notes app". The thing worth
having is Obsidian with a different graph view, and building it standalone means
rebuilding editing, search, backlinks, file watching, conflict handling, sync and
mobile — the ninety percent of Obsidian that is not the graph — to get a view you
can inject instead. The right-hand pane there **is** Obsidian's pane.
