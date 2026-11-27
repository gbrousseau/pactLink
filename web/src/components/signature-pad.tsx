"use client";

import { useRef, type PointerEvent } from "react";
import { maxSignaturePoints, maxSignatureStrokes, signatureHeight, signatureWidth, type Signature } from "@/lib/consent-signature";
import { SignatureMarks } from "./signature-marks";

export function SignaturePad({ signature, onChange, error, onError, disabled }: {
  signature: Signature; onChange: (value: Signature) => void; error: string;
  onError: (value: string) => void; disabled: boolean;
}) {
  const strokes = useRef<Signature>(signature);
  const pointer = useRef<number | null>(null);

  function point(event: PointerEvent<SVGSVGElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.round(Math.max(0, Math.min(signatureWidth, (event.clientX - rect.left) * signatureWidth / rect.width))),
      Math.round(Math.max(0, Math.min(signatureHeight, (event.clientY - rect.top) * signatureHeight / rect.height))),
    ];
  }
  function update(value: Signature) {
    strokes.current = value;
    onChange(value);
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (disabled || error || !event.isPrimary || event.button !== 0 || pointer.current !== null) return;
    event.preventDefault();
    if (strokes.current.length >= maxSignatureStrokes) {
      onError("Signature limit reached. Clear it and sign again.");
      return;
    }
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    update([...strokes.current, [point(event)]]);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (pointer.current !== event.pointerId || error) return;
    event.preventDefault();
    const last = strokes.current.at(-1);
    if (!last) return;
    const next = point(event);
    const previous = last[last.length - 1];
    if (next[0] === previous[0] && next[1] === previous[1]) return;
    if (strokes.current.reduce((total, stroke) => total + stroke.length, 0) >= maxSignaturePoints) {
      pointer.current = null;
      onError("Signature limit reached. Clear it and sign again.");
      return;
    }
    update([...strokes.current.slice(0, -1), [...last, next]]);
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (pointer.current !== event.pointerId) return;
    move(event);
    pointer.current = null;
  }
  function clear() {
    pointer.current = null;
    update([]);
    onError("");
  }

  return <div className="space-y-2">
    <svg aria-label="Signature pad" role="img" viewBox={`0 0 ${signatureWidth} ${signatureHeight}`}
      className="block aspect-[2/1] w-full max-w-xl rounded-md border border-slate-400 bg-white"
      style={{ touchAction: "none" }} onPointerDown={start} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={() => { if (pointer.current !== null) { pointer.current = null; onError("Signature interrupted. Clear it and sign again."); } }}>
      <SignatureMarks signature={signature} />
    </svg>
    <p className="text-xs text-slate-600">Sign with a finger, stylus, or mouse. Alternatively, upload a PDF or use the staff attestation.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="button" className="btn-secondary" disabled={disabled} onClick={clear}>Clear signature</button>
  </div>;
}
