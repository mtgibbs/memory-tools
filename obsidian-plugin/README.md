# Sphere Grid — Obsidian plugin

The atlas as a workspace view. Click a note on the map and it opens in a split
beside it — which is the whole reason this is a plugin and not an app.

## Why a plugin

The thing you want is *Obsidian with a different graph view*. Building it as a
standalone app means rebuilding markdown editing, search, backlinks, file
watching, conflict handling, sync and mobile — the ninety percent of Obsidian
that is not the graph — in order to get a view you can inject instead.

The right-hand pane here **is** Obsidian's pane. That is zero work.

## One renderer, not two

`src/main.ts` imports `../../templates/spheregrid.render.js` — the same file the
CLI inlines into its standalone HTML page. It is not copied. Two renderers would
drift, and the drift would be invisible until someone noticed the two views
disagreed about the map.

Layout is not reimplemented either. `memory-graph spheregrid --data` writes the
positions and this renders them, so there is one implementation of the layout and
one of the drawing. The plugin is a viewer.

## Install

```bash
npm install && npm run build
```

Then copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/spheregrid/` and enable it in
**Settings → Community plugins**.

Point the vault at `~/.claude/projects` — the realms resolve as folders and
`[[links]]` resolve across all of them. See `../vault-config/README.md`.

## Generate the layout

```bash
memory-graph spheregrid --data ~/.claude/projects/spheregrid.json
```

Or set the **memory-graph path** in plugin settings and run
**Sphere Grid: regenerate layout** from the command palette. That shells out, so
it is desktop only — `manifest.json` says so.

## Settings

| | |
|---|---|
| **Layout file** | vault-relative path to the JSON. Default `spheregrid.json` |
| **memory-graph path** | absolute path to `bin/memory-graph`; only needed to regenerate |
| **Also merge work vault** | passed through as `--also-work` |
| **Centre** | which realm is marked *you are here* |

## Known edges

- **Work notes cannot be opened from here.** A merged work vault is read from a
  second root this Obsidian vault does not contain, so those notes have no file
  to open. Clicking one says so rather than doing nothing.
- **The layout is a build artifact.** It does not follow edits until you
  regenerate. That is the same trade the standalone page makes, and the same one
  `memory-infer` makes — a scheduled pass, not an inline one.
- **Desktop only**, because regeneration shells out. The view itself would work
  on mobile against a committed layout file; the manifest could relax if that
  turns out to matter.
