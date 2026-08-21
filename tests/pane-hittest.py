#!/usr/bin/env python3
"""Prove the renderer hit-tests correctly in a canvas that is NOT the window.

The first time this renderer was embedded in an Obsidian pane, every click
missed. It sized itself from `innerWidth` and hit-tested with `ev.clientX`,
which are identical to the canvas's own box on a standalone page and wrong by
the pane's origin anywhere else. Nothing was clickable; you could only pan,
because panning needs no hit test.

So the harness puts the canvas at a deliberate offset, in a box a different size
from the window, and clicks the exact centre of several nodes:

    python3 tests/pane-hittest.py [--data FILE] [--out PNG]

It writes a PNG you read — headless Chrome's --dump-dom hangs on a page with a
requestAnimationFrame loop, and the screenshot path is the one that works.
Look for PASS at the bottom.

Nodes are settled with settleNow() first, on purpose: the assembly animation is
decoration, the slot is the claim, and the mapping is what is under test.
"""

import argparse, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%%;background:#111;overflow:hidden}
#pane{position:absolute;left:317px;top:96px;width:820px;height:560px}
#c{position:absolute;inset:0;width:100%%;height:100%%;display:block}
#out{position:absolute;left:0;top:0;right:0;background:#000;color:#7fff9f;
 font:16px ui-monospace,monospace;padding:20px;line-height:1.6;z-index:9;white-space:pre}
</style></head><body>
<div id="pane"><canvas id="c"></canvas></div><pre id="out">running…</pre>
<script>
%(render)s
const DATA = %(data)s;
const out = document.getElementById("out");
try {
let opened = [];
const cv = document.getElementById("c");
const SG = createSphereGrid({ canvas: cv, data: DATA, onOpenNote: n => opened.push(n) });
function clickAt(x, y) {
  const o = { clientX: x, clientY: y, pointerId: 1, bubbles: true, button: 0 };
  cv.dispatchEvent(new PointerEvent("pointerdown", o));
  cv.dispatchEvent(new PointerEvent("pointerup", o));
}
setTimeout(() => {
 try {
  SG.settleNow();
  const r = cv.getBoundingClientRect(), L = [];
  L.push("canvas box  left " + Math.round(r.left) + "  top " + Math.round(r.top)
         + "   " + Math.round(r.width) + "x" + Math.round(r.height));
  L.push("window      " + innerWidth + "x" + innerHeight + "   (deliberately different)");
  L.push("settled     max |n - home| = "
         + Math.max.apply(null, SG.N.map(n => Math.hypot(n.x-n.hx, n.y-n.hy))).toFixed(3));
  L.push("");
  const pick = SG.N.slice().sort((a,b) => b.conn - a.conn).filter(n => {
    const s = SG.screenOf(n);
    return s.x > 30 && s.y > 30 && s.x < r.width - 30 && s.y < r.height - 30;
  }).slice(0, 8);
  let pass = 0;
  for (const n of pick) {
    opened = [];
    const s = SG.screenOf(n);
    clickAt(r.left + s.x, r.top + s.y);
    const ok = opened.length === 1 && opened[0].stem === n.stem;
    if (ok) pass++;
    L.push((ok ? "  ok   " : "  MISS ") + n.stem.slice(0,34).padEnd(36)
      + "at " + Math.round(s.x) + "," + Math.round(s.y)
      + (ok ? "" : "  -> " + (opened.map(o=>o.stem).join(",") || "nothing")));
  }
  opened = []; clickAt(r.left + 6, r.top + 6);
  const voidOk = opened.length === 0;
  L.push((voidOk ? "  ok   " : "  MISS ") + "corner of the pane opens nothing");
  L.push("");
  L.push(pass === pick.length && voidOk
    ? "PASS  " + pass + "/" + pick.length + " nodes hit exactly, empty space inert"
    : "FAIL  " + pass + "/" + pick.length + " hit");
  out.textContent = L.join("\\n");
 } catch (e) { out.textContent = "THREW in test: " + e.message + "\\n" + e.stack; }
}, 300);
} catch (e) { out.textContent = "THREW at setup: " + e.message + "\\n" + e.stack; }
</script></body></html>"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(Path.home() / ".claude/projects/spheregrid.json"),
                    help="layout JSON from `memory-graph spheregrid --data`")
    ap.add_argument("--out", default="pane-hittest.png")
    a = ap.parse_args()

    if not Path(CHROME).exists():
        print(f"needs Chrome at {CHROME}", file=sys.stderr)
        return 2
    data_path = Path(a.data).expanduser()
    if not data_path.exists():
        print(f"no layout at {data_path} — run: memory-graph spheregrid --data {data_path}",
              file=sys.stderr)
        return 2

    render = (ROOT / "templates" / "spheregrid.render.js").read_text(encoding="utf-8")
    page = PAGE % {"render": render.replace("export function", "function", 1),
                   "data": data_path.read_text(encoding="utf-8")}

    out = Path(a.out).expanduser().resolve()
    out.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        html = Path(tmp) / "hittest.html"
        html.write_text(page, encoding="utf-8")
        # Two Chrome quirks, both worked around rather than fought:
        # --virtual-time-budget starves requestAnimationFrame on a page whose
        # loop never ends (so the harness settles explicitly instead of waiting
        # for frames, and reads a screenshot rather than the DOM), and headless
        # writes the screenshot but does not exit. So: launch, wait for the file
        # to stop growing, then stop it.
        proc = subprocess.Popen(
            [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
             "--window-size=1400,760", "--virtual-time-budget=4000",
             f"--screenshot={out}", f"--user-data-dir={tmp}/cp", html.as_uri()],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            size = -1
            for _ in range(120):                     # up to ~60s
                time.sleep(0.5)
                if out.exists():
                    now = out.stat().st_size
                    if now > 0 and now == size:
                        break                        # written and stable
                    size = now
                if proc.poll() is not None:
                    break
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
    if not out.exists():
        print("chrome produced no screenshot", file=sys.stderr)
        return 1
    print(f"{out} — open it and read the last line (expect PASS)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
