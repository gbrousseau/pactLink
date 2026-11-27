import type { Signature } from "@/lib/consent-signature";

export function SignatureMarks({ signature }: { signature: Signature }) {
  return <g fill="none" stroke="#111827" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    {signature.map((stroke, index) => stroke.length === 1
      ? <circle key={index} cx={stroke[0][0]} cy={stroke[0][1]} r="1.5" fill="#111827" stroke="none" />
      : <polyline key={index} points={stroke.map(([x, y]) => `${x},${y}`).join(" ")} />)}
  </g>;
}
