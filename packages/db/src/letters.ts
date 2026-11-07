import { z } from "zod";

import { toStayDate } from "./bookings";
import { prisma } from "./client";
import { MAX_SIGNATURE_LENGTH } from "./registrations";

import type { Letter } from "../prisma/generated/client";

/**
 * Letters on the lodge's letterhead: staff type who it is to, the subject and
 * the words; the letterhead, date and sign-off are laid out for them
 * (apps/web/src/lib/letter). Kept so a letter can be printed again or reused.
 */

export class LetterError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "BAD_REQUEST",
  ) {
    super(message);
    this.name = "LetterError";
  }
}

/** LTR-2026-0004. */
export function letterNumber(number: number, createdAt: Date): string {
  return `LTR-${createdAt.getUTCFullYear()}-${String(number).padStart(4, "0")}`;
}

export const letterInputSchema = z.object({
  propertyId: z.string().min(1),
  recipient: z.string().trim().min(1, "Say who it is to").max(500),
  subject: z.string().trim().min(1, "Give it a subject").max(200),
  body: z.string().trim().min(1, "Write the letter").max(20_000),
  closing: z.string().trim().min(1).max(60).default("Yours faithfully"),
  signerName: z.string().trim().min(1).max(120),
  signerTitle: z.string().trim().max(120).optional(),
  /** The signer's signature, drawn on the screen: a PNG data URL. */
  signature: z
    .string()
    .max(MAX_SIGNATURE_LENGTH, "The signature is too large")
    .refine((value) => value.startsWith("data:image/png;base64,"), "The signature must be a drawn image")
    .nullable()
    .optional(),
  stamped: z.boolean().default(true),
  letterDate: z.iso.date(),
});

export type LetterInput = z.input<typeof letterInputSchema>;

function fields(data: z.output<typeof letterInputSchema>) {
  return { ...data, signerTitle: data.signerTitle || null, signature: data.signature ?? null, letterDate: toStayDate(data.letterDate) };
}

export function createLetter(input: LetterInput, by: string): Promise<Letter> {
  return prisma.letter.create({ data: { ...fields(letterInputSchema.parse(input)), createdBy: by } });
}

export async function updateLetter(id: string, input: LetterInput): Promise<Letter> {
  const existing = await prisma.letter.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new LetterError("No such letter", "NOT_FOUND");
  return prisma.letter.update({ where: { id }, data: fields(letterInputSchema.parse(input)) });
}

export async function getLetter(id: string) {
  const letter = await prisma.letter.findUnique({ where: { id }, include: { property: { select: { name: true, location: true, phone: true, email: true } } } });
  if (!letter) return null;
  return { ...letter, label: letterNumber(letter.number, letter.createdAt), letterDate: letter.letterDate.toISOString().slice(0, 10), createdAt: letter.createdAt.toISOString(), updatedAt: letter.updatedAt.toISOString() };
}

export type LetterView = NonNullable<Awaited<ReturnType<typeof getLetter>>>;

export async function listLetters(input: { search?: string }, propertyIds?: string[]) {
  const search = input.search?.trim();
  const letters = await prisma.letter.findMany({
    where: {
      ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: "insensitive" } },
              { recipient: { contains: search, mode: "insensitive" } },
              { body: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { number: "desc" },
    take: 500,
    select: { id: true, number: true, subject: true, recipient: true, letterDate: true, signerName: true, createdAt: true, property: { select: { name: true } } },
  });
  return letters.map((letter) => ({
    id: letter.id,
    label: letterNumber(letter.number, letter.createdAt),
    subject: letter.subject,
    // The first line of the address block: a name, or "To whom it may concern".
    to: letter.recipient.split("\n")[0]!.trim(),
    letterDate: letter.letterDate.toISOString().slice(0, 10),
    signerName: letter.signerName,
    propertyName: letter.property.name,
  }));
}

export async function letterProperties(ids: string[]): Promise<string[]> {
  const rows = await prisma.letter.findMany({ where: { id: { in: ids } }, select: { propertyId: true } });
  if (rows.length !== new Set(ids).size) throw new LetterError("Some of those letters no longer exist", "NOT_FOUND");
  return [...new Set(rows.map((row) => row.propertyId))];
}

export async function deleteLetters(ids: string[]): Promise<{ deleted: number }> {
  const { count } = await prisma.letter.deleteMany({ where: { id: { in: ids } } });
  return { deleted: count };
}
