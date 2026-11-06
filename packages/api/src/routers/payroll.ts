import {
  createEmployee,
  createPayRun,
  deleteEmployee,
  deletePayRun,
  employeeSchema,
  getPayRun,
  getPayslip,
  listEmployees,
  listPayRuns,
  markPayslipsPaid,
  PayrollError,
  payRunSchema,
  signPayslip,
  signPayslipSchema,
  unmarkPayslipPaid,
  updateEmployee,
  updatePayslip,
  updatePayslipSchema,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PayrollError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    throw error;
  }
}

const id = z.string().min(1);

/** Payroll: employees, pay runs, payslips and signatures. Owner only: pay and bank details are private. */
export const payrollRouter = router({
  employees: adminProcedure.input(z.object({ includeInactive: z.boolean().default(false) })).query(({ input }) => listEmployees(input)),
  addEmployee: adminProcedure.input(employeeSchema).mutation(({ input }) => createEmployee(input)),
  updateEmployee: adminProcedure.input(z.object({ id, employee: employeeSchema })).mutation(({ input }) => guarded(() => updateEmployee(input.id, input.employee))),
  deleteEmployee: adminProcedure.input(id).mutation(({ input }) => guarded(() => deleteEmployee(input))),

  runs: adminProcedure.query(() => listPayRuns()),
  run: adminProcedure.input(id).query(async ({ input }) => {
    const run = await getPayRun(input);
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "No such pay run" });
    return run;
  }),
  createRun: adminProcedure.input(payRunSchema).mutation(({ ctx, input }) => guarded(() => createPayRun(input, ctx.session.user.email))),
  deleteRun: adminProcedure.input(id).mutation(({ input }) => guarded(() => deletePayRun(input))),

  payslip: adminProcedure.input(id).query(async ({ input }) => {
    const slip = await getPayslip(input);
    if (!slip) throw new TRPCError({ code: "NOT_FOUND", message: "No such payslip" });
    return slip;
  }),
  updatePayslip: adminProcedure.input(updatePayslipSchema).mutation(({ input }) => guarded(() => updatePayslip(input))),
  markPaid: adminProcedure
    .input(z.object({ ids: z.array(id).min(1).max(500), reference: z.string().trim().max(80).optional(), paidOn: z.iso.date().optional() }))
    .mutation(({ ctx, input }) => markPayslipsPaid(input.ids, ctx.session.user.email, input)),
  unmarkPaid: adminProcedure.input(id).mutation(({ input }) => guarded(() => unmarkPayslipPaid(input))),
  sign: adminProcedure.input(signPayslipSchema).mutation(({ input }) => guarded(() => signPayslip(input))),
});
