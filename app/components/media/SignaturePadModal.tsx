"use client";

/**
 * components/media/SignaturePadModal.tsx
 * Eleeveon compact reusable signature/drawing pad.
 *
 * Purpose:
 * - draw signatures with finger, mouse, or stylus
 * - transparent PNG output
 * - reusable for teachers, parents, reports, receipts, approvals, etc.
 * - parent receives a File and can pass it into saveImageAsset(...)
 */

import React, { useEffect, useRef, useState } from "react";

type SignaturePadModalProps = {
  open: boolean;
  title?: string;
  description?: string;
  fileName?: string;
  defaultColor?: string;
  onClose: () => void;
  onSave: (file: File) => void | Promise<void>;
};

const COLORS = ["#111827", "#000000", "#1d4ed8", "#166534", "#991b1b"];

export default function SignaturePadModal({
  open,
  title = "Draw Signature",
  description = "Sign inside the pad. The saved image keeps a transparent background.",
  fileName = "signature.png",
  defaultColor = "#111827",
  onClose,
  onSave,
}: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [inkColor, setInkColor] = useState(defaultColor);
  const [strokeSize, setStrokeSize] = useState(3);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    const previous = document.createElement("canvas");
    previous.width = canvas.width;
    previous.height = canvas.height;
    previous.getContext("2d")?.drawImage(canvas, 0, 0);

    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (previous.width && previous.height && hasInk) {
      ctx.drawImage(previous, 0, 0, previous.width / ratio, previous.height / ratio);
    }
  };

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(resizeCanvas, 30);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resizeCanvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;

    event.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = lastPointRef.current;
    const point = getPoint(event);

    if (!canvas || !ctx || !last) return;

    ctx.strokeStyle = inkColor;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = point;
    setHasInk(true);
  };

  const stopDrawing = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event && canvasRef.current?.hasPointerCapture(event.pointerId)) {
      canvasRef.current.releasePointerCapture(event.pointerId);
    }

    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;

    try {
      setSaving(true);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/png", 1);
      });

      if (!blob) throw new Error("Could not create signature image.");

      const file = new File([blob], fileName.endsWith(".png") ? fileName : `${fileName}.png`, {
        type: "image/png",
        lastModified: Date.now(),
      });

      await onSave(file);
      clear();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ba-modal-backdrop signature-pad-backdrop" role="dialog" aria-modal="true">
      <section className="ba-signature-modal">
        <div className="ba-modal-head">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close signature pad">
            ✕
          </button>
        </div>

        <div className="ba-signature-toolbar">
          <div className="ba-signature-colors" aria-label="Signature colors">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={inkColor === color ? "active" : ""}
                style={{ "--ink": color } as React.CSSProperties}
                onClick={() => setInkColor(color)}
                aria-label={`Use ${color}`}
              />
            ))}
          </div>

          <label className="ba-signature-size">
            <span>Size</span>
            <input
              type="range"
              min="2"
              max="8"
              value={strokeSize}
              onChange={(e) => setStrokeSize(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="ba-signature-pad-wrap">
          <canvas
            ref={canvasRef}
            className="ba-signature-pad"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
            onPointerLeave={stopDrawing}
          />
          {!hasInk && <span className="ba-signature-placeholder">Sign here</span>}
        </div>

        <div className="ba-signature-actions">
          <button type="button" onClick={clear} disabled={!hasInk || saving}>
            Clear
          </button>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={save} disabled={!hasInk || saving}>
            {saving ? "Saving..." : "Use Signature"}
          </button>
        </div>
      </section>

      <style>{css}</style>
    </div>
  );
}

const css = `
.signature-pad-backdrop {
  z-index: 80;
}

.ba-signature-modal {
  width: min(520px, calc(100vw - 18px));
  max-height: min(92dvh, 680px);
  overflow: auto;
  background: var(--card-bg, var(--surface, #fff));
  color: var(--text, #111827);
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 26px;
  box-shadow: 0 24px 70px rgba(15,23,42,.22);
  padding: 12px;
}

.ba-signature-modal .ba-modal-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  padding: 4px 2px 10px;
}

.ba-signature-modal .ba-modal-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 1000;
  letter-spacing: -.03em;
}

.ba-signature-modal .ba-modal-head p {
  margin: 3px 0 0;
  color: var(--muted, #64748b);
  font-size: 12px;
  line-height: 1.45;
}

.ba-signature-modal .ba-modal-head button {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  background: var(--surface, #fff);
  color: var(--text, #111827);
  font-weight: 1000;
  cursor: pointer;
}

.ba-signature-toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}

.ba-signature-colors {
  display: flex;
  gap: 6px;
  align-items: center;
}

.ba-signature-colors button {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 2px solid transparent;
  background: var(--ink);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.35), 0 6px 14px rgba(15,23,42,.10);
}

.ba-signature-colors button.active {
  border-color: var(--ba-primary, var(--primary-color, #2563eb));
  outline: 2px solid color-mix(in srgb, var(--ba-primary, #2563eb) 18%, transparent);
}

.ba-signature-size {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #64748b) 7%, transparent);
}

.ba-signature-size span {
  font-size: 11px;
  font-weight: 900;
  color: var(--muted, #64748b);
}

.ba-signature-size input {
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  accent-color: var(--ba-primary, var(--primary-color, #2563eb));
}

.ba-signature-pad-wrap {
  position: relative;
  height: 185px;
  border: 1.5px dashed color-mix(in srgb, var(--ba-primary, #2563eb) 36%, var(--border, rgba(0,0,0,.16)));
  border-radius: 20px;
  overflow: hidden;
  background:
    linear-gradient(45deg, color-mix(in srgb, var(--muted, #64748b) 7%, transparent) 25%, transparent 25%),
    linear-gradient(-45deg, color-mix(in srgb, var(--muted, #64748b) 7%, transparent) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--muted, #64748b) 7%, transparent) 75%),
    linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--muted, #64748b) 7%, transparent) 75%);
  background-size: 18px 18px;
  background-position: 0 0, 0 9px, 9px -9px, -9px 0;
  touch-action: none;
}

.ba-signature-pad {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}

.ba-signature-placeholder {
  pointer-events: none;
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--muted, #64748b);
  font-size: 13px;
  font-weight: 900;
  opacity: .62;
}

.ba-signature-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 10px;
}

.ba-signature-actions button {
  min-height: 38px;
  border: 1px solid var(--border, rgba(0,0,0,.10));
  border-radius: 999px;
  padding: 0 13px;
  background: var(--surface, #fff);
  color: var(--text, #111827);
  font-size: 12px;
  font-weight: 950;
  cursor: pointer;
}

.ba-signature-actions button.primary {
  border-color: var(--ba-primary, var(--primary-color, #2563eb));
  background: var(--ba-primary, var(--primary-color, #2563eb));
  color: #fff;
  box-shadow: 0 12px 24px color-mix(in srgb, var(--ba-primary, #2563eb) 22%, transparent);
}

.ba-signature-actions button:disabled {
  opacity: .55;
  cursor: not-allowed;
}

@media (max-width: 520px) {
  .ba-signature-modal {
    border-radius: 24px;
    padding: 10px;
  }

  .ba-signature-toolbar {
    grid-template-columns: 1fr;
  }

  .ba-signature-pad-wrap {
    height: 165px;
  }

  .ba-signature-actions {
    display: grid;
    grid-template-columns: 1fr 1fr 1.2fr;
  }

  .ba-signature-actions button {
    padding: 0 9px;
  }
}
`;