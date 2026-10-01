import { useEffect, useRef, useCallback, useState, type ReactNode } from "react";

const MAX_SNAPSHOTS = 6;

interface ActivePixel { key: string; col: number; row: number; fadingAt: number; }
interface SnapshotPixel { col: number; row: number; opacity: number; }
interface Colors { bg1: string; bg2: string; pixel: string; }

interface TrailConfig {
  name: string;
  radius: number;       // 0 = 1칸, 1 = 3×3, 2 = 5×5
  fadeDuration: number; // ms, 0 = 사라지지 않음
  fadeDelay: number;    // 활성 상태 유지 ms
  desc: string;
}

const TRAIL_PRESETS: TrailConfig[] = [
  { name: "Trace",     radius: 0, fadeDuration: 700,  fadeDelay: 80,   desc: "한 칸, 빠른 페이드" },
  { name: "Ghost",     radius: 0, fadeDuration: 2400, fadeDelay: 300,  desc: "한 칸, 느린 페이드" },
];

interface Snapshot {
  id: number;
  pixels: SnapshotPixel[];
  srcW: number;
  srcH: number;
  pixelSize: number;
  colors: Colors;
  thumb: string;
}

// ── Canvas render ────────────────────────────────────────────────────────────
function renderPixels(
  ctx: CanvasRenderingContext2D,
  pixels: SnapshotPixel[],
  pixelSize: number,
  srcW: number, srcH: number,
  dstW: number, dstH: number,
  colors: Colors,
  transparent = false
) {
  const native = document.createElement("canvas");
  native.width  = srcW;
  native.height = srcH;
  const nc = native.getContext("2d")!;

  if (!transparent) {
    const grad = nc.createLinearGradient(0, 0, srcW * 0.7, srcH);
    grad.addColorStop(0, colors.bg1);
    grad.addColorStop(1, colors.bg2);
    nc.fillStyle = grad;
    nc.fillRect(0, 0, srcW, srcH);
  }

  pixels.forEach((px) => {
    nc.globalAlpha = px.opacity;
    nc.fillStyle   = colors.pixel;
    nc.fillRect(px.col * pixelSize, px.row * pixelSize, pixelSize, pixelSize);
  });
  nc.globalAlpha = 1;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(native, 0, 0, dstW, dstH);
}

// Checkerboard for transparent preview
function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = 8;
  for (let y = 0; y < h; y += s) {
    for (let x = 0; x < w; x += s) {
      ctx.fillStyle = (Math.floor(x / s) + Math.floor(y / s)) % 2 === 0 ? "#e0e0e0" : "#f8f8f8";
      ctx.fillRect(x, y, s, s);
    }
  }
}

// ── SVG export ───────────────────────────────────────────────────────────────
function exportSVG(
  pixels: SnapshotPixel[],
  pixelSize: number,
  srcW: number, srcH: number,
  dstW: number, dstH: number,
  colors: Colors,
  transparent = false
): string {
  const rects = pixels.map((px) => {
    const x = px.col * pixelSize;
    const y = px.row * pixelSize;
    const op = px.opacity < 1 ? ` opacity="${px.opacity.toFixed(3)}"` : "";
    return `  <rect x="${x}" y="${y}" width="${pixelSize}" height="${pixelSize}" fill="${colors.pixel}"${op}/>`;
  }).join("\n");

  const bgDefs = transparent ? "" : `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.7" y2="0">
      <stop offset="0%" stop-color="${colors.bg1}"/>
      <stop offset="100%" stop-color="${colors.bg2}"/>
    </linearGradient>
  </defs>
  <rect width="${srcW}" height="${srcH}" fill="url(#bg)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dstW}" height="${dstH}" viewBox="0 0 ${srcW} ${srcH}">${bgDefs}
${rects}
</svg>`;
}

function makeThumb(pixels: SnapshotPixel[], pixelSize: number, srcW: number, srcH: number, colors: Colors): string {
  const tw = 320;
  const th = Math.round(320 * (srcH / srcW));
  const c = document.createElement("canvas");
  c.width = tw; c.height = th;
  renderPixels(c.getContext("2d")!, pixels, pixelSize, srcW, srcH, tw, th, colors);
  return c.toDataURL("image/png");
}

const nextId = () => Date.now() + Math.random();

// ── Tiny color swatch input ──────────────────────────────────────────────────
function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
      <span style={{ fontSize: 11, color: "#aaa", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{
        width: 22, height: 22, borderRadius: 6,
        background: value,
        border: "1.5px solid rgba(0,0,0,0.1)",
        display: "inline-block",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: "absolute", inset: -4,
            width: "calc(100% + 8px)", height: "calc(100% + 8px)",
            opacity: 0, cursor: "pointer",
          }}
        />
      </span>
    </label>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ padding: "18px 12px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#8f8f8f", letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
      <span style={{ fontSize: 11, color: "#e0e0e0", minWidth: 68, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

export default function App() {
  const canvasAreaRef   = useRef<HTMLDivElement>(null);
  const pixelLayerRef   = useRef<HTMLDivElement>(null);
  const activeRef       = useRef<Map<string, ActivePixel>>(new Map());
  const domRef          = useRef<Map<string, HTMLDivElement>>(new Map());
  const rafRef          = useRef<number | null>(null);
  const sizeRef         = useRef({ cols: 0, rows: 0, w: 0, h: 0, offsetX: 0, offsetY: 0 });
  const pixelSizeRef    = useRef(0);
  const colorsRef       = useRef<Colors>({ bg1: "#5bbcf7", bg2: "#c8eafe", pixel: "#ffffff" });

  const [numCols, setNumCols] = useState(8);
  const [derivedPixelSize, setDerivedPixelSize] = useState(0);
  const [colors, setColors] = useState<Colors>({ bg1: "#5bbcf7", bg2: "#c8eafe", pixel: "#ffffff" });
  const [transparentBg, setTransparentBg] = useState(false);
  const [trailPreset, setTrailPreset] = useState<TrailConfig>(TRAIL_PRESETS[0]);
  const trailRef = useRef<TrailConfig>(TRAIL_PRESETS[0]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewSnap, setPreviewSnap] = useState<Snapshot | null>(null);

  useEffect(() => { trailRef.current = trailPreset; }, [trailPreset]);
  useEffect(() => {
    colorsRef.current = colors;
    // Update existing DOM pixels color live
    domRef.current.forEach((el) => { el.style.background = colors.pixel; });
  }, [colors]);

  const selectedSnapshot = snapshots.find((s) => s.id === selectedId) ?? null;


  const clearPixels = useCallback(() => {
    domRef.current.forEach((el) => el.remove());
    domRef.current.clear();
    activeRef.current.clear();
  }, []);

  const numColsRef = useRef(numCols);
  useEffect(() => { numColsRef.current = numCols; }, [numCols]);

  const resize = useCallback(() => {
    const el = canvasAreaRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const cols = numColsRef.current;
    const ps = w / cols;                    // 가로폭을 정확히 cols개로 채움 (자투리 없음)
    pixelSizeRef.current = ps;
    const rows = Math.round(h / ps);        // 세로는 가장 가까운 정수 행 수
    const offsetX = (w - cols * ps) / 2;    // 가로는 딱 맞아 사실상 0
    const offsetY = (h - rows * ps) / 2;    // 세로 중앙 정렬
    sizeRef.current = { cols, rows, w, h, offsetX, offsetY };
    setDerivedPixelSize(ps);
  }, []);

  useEffect(() => { clearPixels(); resize(); }, [numCols, resize, clearPixels]);
  useEffect(() => {
    resize();
    const obs = new ResizeObserver(() => { clearPixels(); resize(); });
    if (canvasAreaRef.current) obs.observe(canvasAreaRef.current);
    return () => obs.disconnect();
  }, [resize, clearPixels]);

  const tick = useCallback(() => {
    const now = performance.now();
    const toRemove: string[] = [];
    activeRef.current.forEach((px) => {
      const el = domRef.current.get(px.key);
      if (!el) return;
      const elapsed = now - px.fadingAt;
      if (elapsed < 0) return;
      const fd = trailRef.current.fadeDuration;
      const opacity = fd === 0 ? 1 : Math.max(0, 1 - elapsed / fd);
      el.style.opacity = String(opacity);
      if (opacity <= 0) toRemove.push(px.key);
    });
    toRemove.forEach((k) => { domRef.current.get(k)?.remove(); domRef.current.delete(k); activeRef.current.delete(k); });
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [tick]);


  const captureSnapshot = useCallback(() => {
    const { cols, rows } = sizeRef.current;
    const ps = pixelSizeRef.current;
    const srcW = cols * ps;
    const srcH = rows * ps;
    if (!srcW || !srcH || activeRef.current.size === 0) return;
    const pixels: SnapshotPixel[] = [];
    activeRef.current.forEach((px) => {
      const el = domRef.current.get(px.key);
      const opacity = el ? parseFloat(el.style.opacity || "1") : 1;
      if (opacity > 0) pixels.push({ col: px.col, row: px.row, opacity });
    });
    if (pixels.length === 0) return;
    const c = { ...colorsRef.current };
    const thumb = makeThumb(pixels, ps, srcW, srcH, c);
    const id = nextId();
    setSnapshots((prev) => {
      const next = [...prev, { id, pixels, srcW, srcH, pixelSize: ps, colors: c, thumb }];
      return next.length > MAX_SNAPSHOTS ? next.slice(-MAX_SNAPSHOTS) : next;
    });
    setSelectedId(id);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const area = canvasAreaRef.current;

    const layer = pixelLayerRef.current;
    if (!area || !layer) return;
    const ps = pixelSizeRef.current;
    const rect = area.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < 0 || my < 0 || mx > rect.width || my > rect.height) {
      setCursorCell(null);
      return;
    }
    const { cols, rows, offsetX, offsetY } = sizeRef.current;
    const centerCol = Math.floor((mx - offsetX) / ps);
    const centerRow = Math.floor((my - offsetY) / ps);
    setCursorCell({ x: offsetX + centerCol * ps, y: offsetY + centerRow * ps });
    const now = performance.now();
    const { radius, fadeDelay } = trailRef.current;
    const r = radius;

    for (let dc = -r; dc <= r; dc++) {
      for (let dr = -r; dr <= r; dr++) {
        const col = centerCol + dc;
        const row = centerRow + dr;
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        const key = `${col},${row}`;
        const existing = activeRef.current.get(key);
        if (existing) {
          existing.fadingAt = now + fadeDelay;
          const el = domRef.current.get(key);
          if (el) el.style.opacity = "1";
        } else {
          const el = document.createElement("div");
          const x  = Math.round(offsetX + col * ps);
          const y  = Math.round(offsetY + row * ps);
          const x2 = Math.round(offsetX + (col + 1) * ps);
          const y2 = Math.round(offsetY + (row + 1) * ps);
          el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${x2-x}px;height:${y2-y}px;background:${colorsRef.current.pixel};opacity:1;`;
          layer.appendChild(el);
          domRef.current.set(key, el);
          activeRef.current.set(key, { key, col, row, fadingAt: now + fadeDelay });
        }
      }
    }
  }, [captureSnapshot]);

  const deleteSnapshot = useCallback((id: number) => {
    setSnapshots((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setSelectedId((sel) => {
        if (sel !== id) return sel;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
  }, []);

  const [copied, setCopied] = useState(false);
  const [cursorCell, setCursorCell] = useState<{ x: number; y: number } | null>(null);

  const copySVG = useCallback(() => {
    if (!selectedSnapshot) return;
    const { srcW, srcH } = selectedSnapshot;
    const svg = exportSVG(selectedSnapshot.pixels, selectedSnapshot.pixelSize,
      srcW, srcH, srcW, srcH, selectedSnapshot.colors, transparentBg);

    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800); };

    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = svg;
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(svg).then(done).catch(fallback);
    } else {
      fallback();
    }
  }, [selectedSnapshot]);

  const bgGradient = `linear-gradient(120deg, ${colors.bg1} 0%, ${colors.bg2} 100%)`;

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: "#f5f6f8", fontFamily: "'Wanted Sans', sans-serif" }}
      onMouseMove={handleMouseMove}
    >
      {/* Header */}
      <header style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", background: "#383838", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>Pixel Trail</span>
          <span style={{ fontSize: 12, color: "#9aa0a6" }}>마우스로 그리고, 클릭해서 캡처하세요</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden" style={{ gap: 0 }}>

        {/* Drawing canvas */}
        <div className="flex flex-1 items-center justify-center overflow-hidden" style={{ padding: 24 }}>
          <div
            ref={canvasAreaRef}
            style={{ aspectRatio: "3 / 2", width: "100%", maxHeight: "100%", maxWidth: "calc((100vh - 112px) * 1.5)", position: "relative", borderRadius: 8, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05), 0 12px 40px rgba(0,0,0,0.10)", cursor: "none", background: bgGradient }}
            onMouseLeave={() => setCursorCell(null)}
            onClick={captureSnapshot}
          >
            <div ref={pixelLayerRef} className="absolute inset-0" />
            {cursorCell && (
              <div className="pointer-events-none absolute" style={{ left: cursorCell.x, top: cursorCell.y, width: derivedPixelSize, height: derivedPixelSize, border: "2px solid #000", borderRadius: "50%", boxSizing: "border-box", boxShadow: "0 0 0 1px rgba(255,255,255,0.45)" }} />
            )}
            <div className="absolute pointer-events-none select-none" style={{ left: "50%", bottom: 16, transform: "translateX(-50%)" }}>
              <span style={{ fontSize: 11, letterSpacing: "0.06em", color: "rgba(255,255,255,0.95)", background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)", padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>클릭해서 캡처</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 248, flexShrink: 0, background: "#383838", borderLeft: "1px solid rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", overflowY: "auto" }}>

          {/* Section: Trail */}
          <Section label="Trail">
            <Row label="Type">
              <div style={{ display: "flex", flex: 1, gap: 4 }}>
                {TRAIL_PRESETS.map((p) => {
                  const active = trailPreset.name === p.name;
                  return (
                    <button key={p.name} type="button"
                      onClick={() => { setTrailPreset(p); clearPixels(); }}
                      style={{ flex: 1, fontFamily: "'Wanted Sans', sans-serif", fontSize: 11, fontWeight: active ? 600 : 400, color: active ? "#fff" : "#bbb", background: active ? "#5b9cf6" : "#4d4d4d", border: `1px solid ${active ? "#5b9cf6" : "rgba(255,255,255,0.14)"}`, padding: "5px 0", borderRadius: 4, cursor: "pointer", transition: "all 0.12s" }}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </Row>
            <Row label="Pixel size">
              {/* 왼쪽=작은 픽셀(=열 많음), 오른쪽=큰 픽셀(=열 적음) → 슬라이더 방향 반전 */}
              <input type="range" min={3} max={20} step={1} value={23 - numCols}
                onChange={(e) => setNumCols(23 - Number(e.target.value))}
                style={{ flex: 1, minWidth: 0, accentColor: "#5b9cf6", cursor: "pointer", height: 2 }} />
            </Row>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 12px 10px", marginTop: -2, fontSize: 10, color: "#8a8f96", fontVariantNumeric: "tabular-nums" }}>
              <span>{Math.round(derivedPixelSize)}px · {numCols} columns</span>
            </div>
          </Section>

          {/* Section: Fill */}
          <Section label="Fill">
            {([["배경 시작", colors.bg1, (v: string) => setColors((c) => ({ ...c, bg1: v }))],
               ["배경 끝",   colors.bg2, (v: string) => setColors((c) => ({ ...c, bg2: v }))],
               ["픽셀",      colors.pixel, (v: string) => setColors((c) => ({ ...c, pixel: v }))]] as const).map(([label, val, onChange]) => (
              <Row key={label as string} label={label as string}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 4, background: val as string, border: "1px solid rgba(255,255,255,0.2)", flexShrink: 0, display: "block", position: "relative", overflow: "hidden" }}>
                    <input type="color" value={val as string} onChange={(e) => (onChange as (v: string) => void)(e.target.value)}
                      style={{ position: "absolute", inset: -4, width: "calc(100% + 8px)", height: "calc(100% + 8px)", opacity: 0, cursor: "pointer" }} />
                  </span>
                  <span style={{ fontSize: 11, color: "#ccc", fontFamily: "monospace", textTransform: "uppercase" }}>{(val as string).replace("#", "")}</span>
                </label>
              </Row>
            ))}
          </Section>

          {/* Section: Export */}
          <Section label="Export">
            <div style={{ padding: "0 12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={copySVG} disabled={!selectedSnapshot}
                style={{ width: "100%", fontFamily: "'Wanted Sans', sans-serif", fontSize: 11, fontWeight: 600, color: copied ? "#5dbd8a" : "#fff", border: `1px solid ${copied ? "rgba(93,189,138,0.35)" : "rgba(255,255,255,0.15)"}`, background: copied ? "rgba(93,189,138,0.12)" : "rgba(255,255,255,0.07)", padding: "6px 0", cursor: selectedSnapshot ? "pointer" : "default", borderRadius: 4, transition: "all 0.15s", opacity: selectedSnapshot ? 1 : 0.35 }}>
                {copied ? "✓ Copied" : "Copy SVG"}
              </button>
              <button onClick={clearPixels}
                style={{ width: "100%", fontFamily: "'Wanted Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)", background: "transparent", padding: "6px 0", cursor: "pointer", borderRadius: 4 }}>
                Clear canvas
              </button>
            </div>
          </Section>

          {/* Section: Captures */}
          <Section label="Captures">
            <div style={{ padding: "0 12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {snapshots.map((snap, i) => {
                const isSelected = snap.id === selectedId;
                return (
                  <div key={snap.id} onClick={() => { setSelectedId(snap.id); setPreviewSnap(snap); }}
                    style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", borderRadius: 4, overflow: "hidden", cursor: "pointer", outline: isSelected ? "1.5px solid #5b9cf6" : "1.5px solid rgba(255,255,255,0.1)" }}>
                    <img src={snap.thumb} alt={`${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <span style={{ position: "absolute", top: 4, left: 5, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{i + 1}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteSnapshot(snap.id); }}
                      style={{ position: "absolute", top: 3, right: 3, width: 16, height: 16, borderRadius: "50%", background: "rgba(0,0,0,0.5)", border: "none", cursor: "pointer", color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                );
              })}
              {Array.from({ length: MAX_SNAPSHOTS - snapshots.length }).map((_, i) => (
                <div key={`empty-${i}`} style={{ width: "100%", aspectRatio: "3 / 2", borderRadius: 4, border: "1px dashed rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {snapshots.length === 0 && i === 0 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>클릭해서 캡처</span>}
                </div>
              ))}
            </div>
          </Section>
        </div>

      </div>

      {/* 캡처 미리보기 오버레이 */}
      {previewSnap && (() => {
        // 팝업용 고해상도 렌더링
        const pw = 1200, ph = Math.round(1200 * previewSnap.srcH / previewSnap.srcW);
        const c = document.createElement("canvas");
        c.width = pw; c.height = ph;
        renderPixels(c.getContext("2d")!, previewSnap.pixels, previewSnap.pixelSize, previewSnap.srcW, previewSnap.srcH, pw, ph, previewSnap.colors, false);
        const hiResUrl = c.toDataURL("image/png");
        return (
        <div
          onClick={() => setPreviewSnap(null)}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 24, background: "#fff", borderRadius: 10, boxShadow: "0 24px 64px rgba(0,0,0,0.2)", maxWidth: "min(80vw, 800px)", width: "100%" }}>
            <img src={hiResUrl} alt="preview" style={{ width: "100%", borderRadius: 6, display: "block", imageRendering: "pixelated" }} />
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              <button
                onClick={() => { setSelectedId(previewSnap.id); copySVG(); }}
                style={{ flex: 1, fontFamily: "'Wanted Sans', sans-serif", fontSize: 13, fontWeight: 600, color: "#fff", background: "#111", border: "none", padding: "9px 0", borderRadius: 6, cursor: "pointer" }}
              >
                {copied ? "✓ Copied" : "Copy SVG"}
              </button>
              <button
                onClick={() => setPreviewSnap(null)}
                style={{ fontFamily: "'Wanted Sans', sans-serif", fontSize: 13, color: "#888", background: "#f5f5f5", border: "none", padding: "9px 20px", borderRadius: 6, cursor: "pointer" }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
