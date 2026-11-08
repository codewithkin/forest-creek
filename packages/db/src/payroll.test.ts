import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  createEmployee,
  createPayRun,
  deleteEmployee,
  deletePayRun,
  getPayRun,
  getPayslip,
  groupPayslips,
  markPayslipsPaid,
  netPayCents,
  NO_CATEGORY,
  payPeriodLabel,
  payRunNumber,
  prisma,
  signPayslip,
  unmarkPayslipPaid,
  updatePayslip,
} from "./index";

describe("payroll arithmetic", () => {
  test("net pay, and never below zero", () => {
    expect(netPayCents({ basicCents: 30000, allowancesCents: 5000, overtimeCents: 2500, deductionsCents: 4000 })).toBe(33500);
    expect(netPayCents({ basicCents: 1000, deductionsCents: 5000 })).toBe(0);
  });

  test("periods and run numbers", () => {
    expect(payPeriodLabel("2026-11")).toBe("November 2026");
    expect(payRunNumber(4, "2026-11")).toBe("PR-2026-11-0004");
  });
});

/** Against the dev database. Employees are named for this test and removed after. */
const NAME = "Payroll Test";
const BY = "owner@example.com";
const signature = "data:image/png;base64,iVBORw0KGgo=";
let ids: string[] = [];

async function cleanup() {
  await prisma.payRun.deleteMany({ where: { createdBy: BY, notes: NAME } });
  await prisma.employee.deleteMany({ where: { name: { startsWith: NAME } } });
}

beforeAll(async () => {
  await cleanup();
  ids = [
    (await createEmployee({ name: `${NAME} Chipo`, position: "Housekeeper", baseSalaryCents: 30000 })).id,
    (await createEmployee({ name: `${NAME} Tendai`, position: "Chef", baseSalaryCents: 45000, paymentMethod: "ecocash", paymentDetails: "0771234567" })).id,
  ];
});
afterAll(cleanup);

describe("a month's pay", () => {
  test("a run freezes each person's pay; pay is marked paid, then signed for, then can't change", async () => {
    const run = await createPayRun(
      {
        period: "2026-11",
        notes: NAME,
        slips: [
          { employeeId: ids[0]!, basicCents: 30000, allowancesCents: 2000, method: "cash" },
          { employeeId: ids[1]!, basicCents: 45000, deductionsCents: 5000, deductionNote: "Advance", method: "ecocash" },
        ],
      },
      BY,
    );
    const view = (await getPayRun(run.id))!;
    expect(view.payslips.map((slip) => [slip.employeeName, slip.netCents, slip.state])).toEqual([
      [`${NAME} Chipo`, 32000, "due"],
      [`${NAME} Tendai`, 40000, "due"],
    ]);
    // Signing before being paid is refused.
    const chipo = view.payslips[0]!.id;
    expect(await signPayslip({ id: chipo, signature }).then(() => "signed", (error: Error) => error.message)).toContain("Mark it paid first");

    await updatePayslip({ id: chipo, basicCents: 30000, allowancesCents: 3000, overtimeCents: 0, deductionsCents: 0, method: "cash" });
    expect(await markPayslipsPaid(view.payslips.map((slip) => slip.id), BY)).toEqual({ changed: 2 });
    expect((await getPayslip(chipo))?.netCents).toBe(33000);

    // Paid: the amounts are frozen.
    expect(await updatePayslip({ id: chipo, basicCents: 1, allowancesCents: 0, overtimeCents: 0, deductionsCents: 0, method: "cash" }).then(() => "changed", (error: Error) => error.message)).toContain("not yet paid");

    await signPayslip({ id: chipo, signature });
    expect((await getPayslip(chipo))?.state).toBe("signed");
    expect(await signPayslip({ id: chipo, signature }).then(() => "signed", (error: Error) => error.message)).toContain("Already signed");
    expect(await unmarkPayslipPaid(chipo).then(() => "undone", (error: Error) => error.message)).toContain("signed payslip");

    // Someone paid keeps their record: the run and the employee stay.
    expect(await deletePayRun(run.id).then(() => "deleted", (error: Error) => error.message)).toContain("stays on file");
    expect(await deleteEmployee(ids[0]!).then(() => "deleted", (error: Error) => error.message)).toContain("payslips on file");
  });

  test("a run nobody was paid from can be deleted, and so can an employee never paid", async () => {
    const extra = await createEmployee({ name: `${NAME} Extra`, baseSalaryCents: 1000 });
    const run = await createPayRun({ period: "2026-12", notes: NAME, slips: [{ employeeId: extra.id, basicCents: 1000, method: "cash" }] }, BY);
    await deletePayRun(run.id);
    expect(await getPayRun(run.id)).toBeNull();
    await deleteEmployee(extra.id);
    expect(await prisma.employee.count({ where: { id: extra.id } })).toBe(0);
  });
});

describe("groupPayslips", () => {
  test("categories A to Z with their totals, people in none last", () => {
    const slip = (category: string | null, net: number) => ({ category, basicCents: net, allowancesCents: 0, overtimeCents: 0, deductionsCents: 0, netCents: net });
    const groups = groupPayslips([slip("Guards", 100), slip(null, 50), slip("Housekeeping", 70), slip("Guards", 30), slip(" ", 5)]);
    expect(groups.map((group) => [group.category, group.slips.length, group.netCents])).toEqual([
      ["Guards", 2, 130],
      ["Housekeeping", 1, 70],
      [NO_CATEGORY, 2, 55],
    ]);
  });
});
