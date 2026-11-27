import { z } from "zod";

export const signatureStatement = "By signing below, I agree to be added.";
export const signatureWidth = 800;
export const signatureHeight = 400;
export const maxSignaturePoints = 4000;
export const maxSignatureStrokes = 100;
export const maxSignatureJsonLength = 100_000;

const pointSchema = z.tuple([
  z.number().int().min(0).max(signatureWidth),
  z.number().int().min(0).max(signatureHeight),
]);
export const signatureSchema = z.array(z.array(pointSchema).min(1)).min(1).max(maxSignatureStrokes)
  .refine((strokes) => strokes.reduce((total, stroke) => total + stroke.length, 0) <= maxSignaturePoints)
  .refine((strokes) => strokes.some((stroke) =>
    stroke.some(([x, y]) => x !== stroke[0][0] || y !== stroke[0][1])));
export type Signature = z.infer<typeof signatureSchema>;
