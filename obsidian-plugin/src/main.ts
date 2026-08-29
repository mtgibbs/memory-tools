import {
  App, ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf,
} from "obsidian";
// The renderer is imported from the templates directory the CLI also inlines, so
// this view and the generated HTML page are the same implementation. Copying it
// here would guarantee the two drift, and the drift would be invisible until
// someone noticed the two views disagreed about the map.
import { createSphereGrid, SphereGridHandle, SphereGridNode } from "../../templates/spheregrid.render.js";

const VIEW_TYPE = "spheregrid-view";

interface Settings {
  dataPath: string;      // vault-relative JSON written by `memory-graph spheregrid --data`
  graphBin: string;      // absolute path to bin/memory-graph, for regeneration
  alsoWork: string;      // optional second vault root, passed as --also-work
  center: string;        // --center argument
}

const DEFAULTS: Settings = {
  dataPath: "spheregrid.json",
  graphBin: "",
  alsoWork: "",
  center: "auto",
};

export default class SphereGridPlugin extends Plugin {
  settings: Settings = { ...DEFAULTS };

  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.registerView(VIEW_TYPE, leaf => new SphereGridView(leaf, this));
    this.addRibbonIcon("orbit", "Open sphere grid", () => this.reveal());
    this.addCommand({ id: "open", name: "Open sphere grid", callback: () => this.reveal() });
    this.addCommand({
      id: "regenerate",
      name: "Regenerate layout",
      callback: () => this.regenerate(),
    });
    this.addSettingTab(new SphereGridSettings(this.app, this));
  }

  onunload() {
    // views detach themselves in onClose; nothing global to clean up
  }

  async saveSettings() { await this.saveData(this.settings); }

  async reveal() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) { workspace.revealLeaf(existing[0]); return; }
    // main area, not a sidebar — the map is the thing you are looking at, and
    // the note opens beside it
    const leaf = workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }

  /** Shell out to memory-graph and rewrite the data file, then reload open views. */
  async regenerate() {
    const bin = this.settings.graphBin.trim();
    if (!bin) { new Notice("Sphere Grid: set the memory-graph path in settings first."); return; }
    const vaultRoot = (this.app.vault.adapter as unknown as { basePath?: string }).basePath;
    if (!vaultRoot) { new Notice("Sphere Grid: cannot resolve the vault path."); return; }

    const { execFile } = require("child_process") as typeof import("child_process");
    const path = require("path") as typeof import("path");
    const out = path.join(vaultRoot, this.settings.dataPath);
    const args = ["--vault", vaultRoot];
    if (this.settings.alsoWork.trim()) args.push("--also-work", this.settings.alsoWork.trim());
    args.push("spheregrid", "--data", out);
    if (this.settings.center.trim()) args.push("--center", this.settings.center.trim());

    new Notice("Sphere Grid: regenerating…");
    execFile(bin, args, { timeout: 120_000 }, (err, _stdout, stderr) => {
      if (err) { new Notice("Sphere Grid: " + (stderr || err.message).slice(0, 300)); return; }
      new Notice("Sphere Grid: layout rebuilt.");
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        (leaf.view as SphereGridView).reload();
      }
    });
  }
}

class SphereGridView extends ItemView {
  private handle: SphereGridHandle | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: SphereGridPlugin) { super(leaf); }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Sphere grid"; }
  getIcon() { return "orbit"; }

  async onOpen() { await this.reload(); }

  async onClose() { this.teardown(); }

  private teardown() {
    this.handle?.destroy();
    this.handle = null;
    this.canvas = null;
    this.contentEl.empty();
  }

  async reload() {
    this.teardown();
    const el = this.contentEl;
    el.addClass("spheregrid-view");

    const rel = this.plugin.settings.dataPath;
    if (!(await this.app.vault.adapter.exists(rel))) {
      this.renderEmpty(el, rel);
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await this.app.vault.adapter.read(rel));
    } catch (e) {
      this.renderEmpty(el, rel, String(e));
      return;
    }

    const canvas = el.createEl("canvas");
    const tip = el.createDiv({ cls: "spheregrid-tip" });
    this.canvas = canvas;
    this.handle = createSphereGrid({
      canvas, data, tooltip: tip,
      onOpenNote: n => this.openNote(n),
      // per-vault, so a work map and a personal map do not fight over one key
      storage: {
        get: () => window.localStorage.getItem("spheregrid-opts:" + this.app.vault.getName()),
        set: v => window.localStorage.setItem("spheregrid-opts:" + this.app.vault.getName(), v),
      },
    });
  }

  private renderEmpty(el: HTMLElement, rel: string, err?: string) {
    const d = el.createDiv({ cls: "spheregrid-empty" });
    d.createSpan({ text: err ? `Could not read ${rel}: ${err}` : `No layout at ${rel}.` });
    d.createEl("code", {
      text: "memory-graph spheregrid --data " + rel,
    });
    d.createSpan({ text: "Or run “Sphere Grid: regenerate layout” once the binary path is set." });
  }

  private async openNote(n: SphereGridNode) {
    // A merged work vault is read from a second root that this Obsidian vault
    // does not contain, so its notes have no file here to open. Say that rather
    // than silently doing nothing.
    const path = `${n.realm}/memory/${n.stem}.md`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(
        n.realm.startsWith("work--")
          ? `${n.stem} lives in the work vault, which is not open here.`
          : `Not found in this vault: ${path}`);
      return;
    }
    // split beside the map, and reuse that split on the next click
    const leaf = this.app.workspace.getLeaf("split", "vertical");
    await leaf.openFile(file, { active: true });
  }
}

class SphereGridSettings extends PluginSettingTab {
  constructor(app: App, private plugin: SphereGridPlugin) { super(app, plugin); }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Layout file")
      .setDesc("Vault-relative path to the JSON written by `memory-graph spheregrid --data`.")
      .addText(t => t.setValue(this.plugin.settings.dataPath).onChange(async v => {
        this.plugin.settings.dataPath = v || DEFAULTS.dataPath;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName("memory-graph path")
      .setDesc("Absolute path to bin/memory-graph. Only needed for “Regenerate layout”.")
      .addText(t => t.setPlaceholder("/Users/you/dev/memory-tools/bin/memory-graph")
        .setValue(this.plugin.settings.graphBin).onChange(async v => {
          this.plugin.settings.graphBin = v; await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Also merge work vault")
      .setDesc("Optional second vault root, passed as --also-work. Its realms are marked work-- "
             + "and its notes cannot be opened from here.")
      .addText(t => t.setPlaceholder("~/work-memories/projects")
        .setValue(this.plugin.settings.alsoWork).onChange(async v => {
          this.plugin.settings.alsoWork = v; await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Centre")
      .setDesc("Which realm is marked “you are here”. `auto` uses the working directory.")
      .addText(t => t.setValue(this.plugin.settings.center).onChange(async v => {
        this.plugin.settings.center = v; await this.plugin.saveSettings();
      }));
  }
}
