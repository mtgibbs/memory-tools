// Types for spheregrid.render.js. They live beside the renderer rather than in
// the plugin, so any host that imports it gets them without redeclaring.

export interface SphereGridNode {
  stem: string;
  realm: string;
  short: string;
  type: string;
  work: boolean;
  gold: boolean;
  dead: boolean;
  chal: number;
  hop: number;
  deg: number;
  conn: number;
  si: number;
  x: number;
  y: number;
}

export interface SphereGridRealm {
  name: string;
  short: string;
  n: number;
  work: boolean;
  centre: boolean;
  minor: boolean;
  hue: number;
  rad: number;
  anchor: string;
}

export interface SphereGridHandle {
  P: Record<string, unknown>;
  N: SphereGridNode[];
  E: Array<{ s: number; t: number; i: number; b: number; g: number }>;
  R: SphereGridRealm[];
  readonly focusRealm: SphereGridRealm | null;
  flyTo(realm: SphereGridRealm, pad?: number): void;
  flyOut(): void;
  setFocus(realm: SphereGridRealm | null): void;
  save(): void;
  destroy(): void;
}

export interface SphereGridOptions {
  canvas: HTMLCanvasElement;
  data: unknown;
  tooltip?: HTMLElement | null;
  ambient?: boolean;
  still?: boolean;
  onOpenNote: (n: SphereGridNode) => void;
  storage?: { get(): string | null; set(v: string): void };
}

export function createSphereGrid(opts: SphereGridOptions): SphereGridHandle;
