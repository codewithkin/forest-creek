import { z } from "zod";

import { toStayDate } from "./bookings";
import { prisma } from "./client";
import { groupPayslips, netPayCents, payMethods, payRunNumber, payslipState } from "./payroll-rules";

export * from "./payroll-rules";

/**
 * Payroll, owner only (packages/api guards every call with adminProcedure):
 * employees, a month's pay run with one payslip each, marking pay as paid,
 * and the employee's signature on receipt. A payslip's amounts are frozen
 * once paid; a signed one can't change at all.
 */

export class PayrollError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
  ) {
    super(message);
    this.name = "PayrollError";
  }
}

const cents = z.number().int().min(0).max(100_000_000);
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const employeeSchema = z.object({
  name: z.string().trim().min(1, "Give a name").max(120),
  position: optionalText(80),
  categoryId: z.string().min(1).nullable().optional(),
  idNumber: optionalText(40),
  phone: optionalText(40),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).optional(),
  propertyId: z.string().min(1).nullable().optional(),
  startDate: z.iso.date().optional(),
  baseSalaryCents: cents,
  paymentMethod: z.enum(payMethods).default("cash"),
  paymentDetails: optionalText(120),
  notes: optionalText(500),
  active: z.boolean().default(true),
});

export type EmployeeInput = z.input<typeof employeeSchema>;

function employeeData(data: z.output<typeof employeeSchema>) {
  return {
    ...data,
    position: data.position || null,
    categoryId: data.categoryId ?? null,
    idNumber: data.idNumber || null,
    phone: data.phone || null,
    email: data.email || null,
    propertyId: data.propertyId ?? null,
    startDate: data.startDate ? toStayDate(data.startDate) : null,
    paymentDetails: data.paymentDetails || null,
    notes: data.notes || null,
  };
}

export function createEmployee(input: EmployeeInput) {
  return prisma.employee.create({ data: employeeData(employeeSchema.parse(input)) });
}

export async function updateEmployee(id: string, input: EmployeeInput) {
  if (!(await prisma.employee.findUnique({ where: { id }, select: { id: true } }))) throw new PayrollError("No such employee", "NOT_FOUND");
  return prisma.employee.update({ where: { id }, data: employeeData(employeeSchema.parse(input)) });
}

/** Someone added by mistake. Anyone who has been paid stays: mark them inactive instead. */
export async function deleteEmployee(id: string): Promise<void> {
  const paid = await prisma.payslip.count({ where: { employeeId: id } });
  if (paid > 0) throw new PayrollError("They have payslips on file: mark them as no longer working here instead", "CONFLICT");
  await prisma.employee.deleteMany({ where: { id } });
}

export function listEmployees(input: { includeInactive?: boolean } = {}) {
  return prisma.employee.findMany({
    where: input.includeInactive ? {} : { active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { property: { select: { name: true } }, category: { select: { name: true } }, _count: { select: { payslips: true } } },
  });
}

export const payrollCategorySchema = z.object({ name: z.string().trim().min(1, "Give the category a name").max(60) });

/** The owner's categories, A to Z, with how many people are in each. */
export async function listPayrollCategories() {
  const categories = await prisma.payrollCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: true } } } });
  return categories.map((category) => ({ id: category.id, name: category.name, people: category._count.employees }));
}

async function uniqueName<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new PayrollError("There is already a category with that name", "CONFLICT");
    throw error;
  }
}

export function createPayrollCategory(input: z.input<typeof payrollCategorySchema>) {
  const { name } = payrollCategorySchema.parse(input);
  return uniqueName(() => prisma.payrollCategory.create({ data: { name } }));
}

/** Renaming changes the heading for future runs; payslips already made keep the name they had. */
export async function renamePayrollCategory(id: string, input: z.input<typeof payrollCategorySchema>) {
  const { name } = payrollCategorySchema.parse(input);
  const { count } = await uniqueName(() => prisma.payrollCategory.updateMany({ where: { id }, data: { name } }));
  if (count === 0) throw new PayrollError("No such category", "NOT_FOUND");
}

/** Its people move to no category; past payslips keep the name. */
export async function deletePayrollCategory(id: string) {
  await prisma.payrollCategory.deleteMany({ where: { id } });
}

export const payRunSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month"),
  propertyId: z.string().min(1).nullable().optional(),
  notes: optionalText(500),
  slips: z
    .array(
      z.object({
        employeeId: z.string().min(1),
        basicCents: cents,
        allowancesCents: cents.default(0),
        overtimeCents: cents.default(0),
        deductionsCents: cents.default(0),
        deductionNote: optionalText(200),
        method: z.enum(payMethods),
      }),
    )
    .min(1, "Choose who is paid")
    .max(500),
});

export type PayRunInput = z.input<typeof payRunSchema>;

/** A month's pay run: one payslip per person, names and positions frozen as they were. */
export async function createPayRun(input: PayRunInput, by: string) {
  const data = payRunSchema.parse(input);
  const employees = await prisma.employee.findMany({ where: { id: { in: data.slips.map((slip) => slip.employeeId) } }, include: { category: { select: { name: true } } } });
  if (employees.length !== new Set(data.slips.map((slip) => slip.employeeId)).size) throw new PayrollError("Someone on the run no longer exists", "NOT_FOUND");
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  return prisma.payRun.create({
    data: {
      period: data.period,
      propertyId: data.propertyId ?? null,
      notes: data.notes || null,
      createdBy: by,
      payslips: {
        create: data.slips.map((slip) => ({
          employeeId: slip.employeeId,
          employeeName: byId.get(slip.employeeId)!.name,
          position: byId.get(slip.employeeId)!.position,
          category: byId.get(slip.employeeId)!.category?.name ?? null,
          basicCents: slip.basicCents,
          allowancesCents: slip.allowancesCents,
          overtimeCents: slip.overtimeCents,
          deductionsCents: slip.deductionsCents,
          deductionNote: slip.deductionNote || null,
          netCents: netPayCents(slip),
          method: slip.method,
        })),
      },
    },
  });
}

export async function listPayRuns() {
  const runs = await prisma.payRun.findMany({
    orderBy: [{ period: "desc" }, { number: "desc" }],
    take: 200,
    include: { property: { select: { name: true } }, payslips: { select: { netCents: true, paidAt: true, signedAt: true } } },
  });
  return runs.map((run) => ({
    id: run.id,
    label: payRunNumber(run.number, run.period),
    period: run.period,
    propertyName: run.property?.name ?? null,
    people: run.payslips.length,
    totalCents: run.payslips.reduce((sum, slip) => sum + slip.netCents, 0),
    paid: run.payslips.filter((slip) => slip.paidAt).length,
    signed: run.payslips.filter((slip) => slip.signedAt).length,
    createdAt: run.createdAt.toISOString(),
  }));
}

export async function getPayRun(id: string) {
  const run = await prisma.payRun.findUnique({
    where: { id },
    include: { property: { select: { name: true, location: true, phone: true, email: true } }, payslips: { orderBy: { employeeName: "asc" } } },
  });
  if (!run) return null;
  return {
    ...run,
    label: payRunNumber(run.number, run.period),
    payslips: run.payslips.map((slip) => ({ ...slip, state: payslipState(slip), hasSignature: Boolean(slip.signature), signature: undefined })),
    // By category, with totals, for the summary and its download.
    groups: groupPayslips(run.payslips).map(({ slips, ...totals }) => ({ ...totals, ids: slips.map((slip) => slip.id) })),
  };
}

/** One payslip, whole, for its PDF and the signing screen. */
export async function getPayslip(id: string) {
  const slip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      payRun: { select: { number: true, period: true, property: { select: { name: true, location: true, phone: true, email: true } } } },
      employee: { select: { idNumber: true, paymentDetails: true, property: { select: { name: true, location: true, phone: true, email: true } } } },
    },
  });
  if (!slip) return null;
  return { ...slip, state: payslipState(slip), runLabel: payRunNumber(slip.payRun.number, slip.payRun.period) };
}

/** Pay handed over: the amounts freeze. Already-paid slips are left as they are. */
export async function markPayslipsPaid(ids: string[], by: string, options: { reference?: string; paidOn?: string } = {}) {
  const { count } = await prisma.payslip.updateMany({
    where: { id: { in: ids }, paidAt: null },
    data: { paidAt: options.paidOn ? toStayDate(options.paidOn) : new Date(), paidBy: by, reference: options.reference || null },
  });
  return { changed: count };
}

/** A mistake before signing: the slip goes back to due. A signed slip stays as signed. */
export async function unmarkPayslipPaid(id: string) {
  const { count } = await prisma.payslip.updateMany({ where: { id, signedAt: null }, data: { paidAt: null, paidBy: null, reference: null } });
  if (count === 0) throw new PayrollError("A signed payslip can't be changed", "CONFLICT");
}

const MAX_SIGNATURE = 400_000;
export const signPayslipSchema = z.object({
  id: z.string().min(1),
  signature: z
    .string()
    .max(MAX_SIGNATURE, "The signature is too large")
    .refine((value) => value.startsWith("data:image/png;base64,"), "The signature must be drawn"),
});

/** The employee signs for their pay: only once it is marked paid, and only once. */
export async function signPayslip(input: z.input<typeof signPayslipSchema>) {
  const data = signPayslipSchema.parse(input);
  const slip = await prisma.payslip.findUnique({ where: { id: data.id }, select: { paidAt: true, signedAt: true } });
  if (!slip) throw new PayrollError("No such payslip", "NOT_FOUND");
  if (!slip.paidAt) throw new PayrollError("Mark it paid first: they sign for pay they have received", "CONFLICT");
  if (slip.signedAt) throw new PayrollError("Already signed", "CONFLICT");
  await prisma.payslip.update({ where: { id: data.id }, data: { signature: data.signature, signedAt: new Date() } });
}

/** Changes a payslip's amounts while it is still due. */
export const updatePayslipSchema = z.object({
  id: z.string().min(1),
  basicCents: cents,
  allowancesCents: cents,
  overtimeCents: cents,
  deductionsCents: cents,
  deductionNote: optionalText(200),
  method: z.enum(payMethods),
});

export async function updatePayslip(input: z.input<typeof updatePayslipSchema>) {
  const { id, ...data } = updatePayslipSchema.parse(input);
  const { count } = await prisma.payslip.updateMany({
    where: { id, paidAt: null },
    data: { ...data, deductionNote: data.deductionNote || null, netCents: netPayCents(data) },
  });
  if (count === 0) throw new PayrollError("Only a payslip not yet paid can be changed", "CONFLICT");
}

/** A run made by mistake, while nobody on it has been paid. */
export async function deletePayRun(id: string): Promise<void> {
  const paid = await prisma.payslip.count({ where: { payRunId: id, paidAt: { not: null } } });
  if (paid > 0) throw new PayrollError("Someone on this run has been paid, so it stays on file", "CONFLICT");
  await prisma.payRun.deleteMany({ where: { id } });
}
