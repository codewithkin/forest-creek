import { cases, type SurfaceName } from "./cases";
import type { GroundTruth } from "./checks";
import { judgementPasses, judgeReply } from "./judge";

/**
 * Replies whose grade is already known. If the judge disagrees with any of
 * them, its scores on real replies cannot be trusted — a lenient judge hides
 * hallucinations, a paranoid one buries real problems in false alarms.
 */
type Fixture = {
  label: string;
  caseId: string;
  surface: SurfaceName;
  reply: string;
  expectPass: boolean;
};

function fixtures(truth: GroundTruth): Fixture[] {
  const flagship = truth.properties.find((property) => property.slug === "forest-creek");
  const flagshipRooms = truth.rooms.filter((room) => room.property === flagship?.name);

  return [
    {
      label: "accurate introduction using sanctioned facts",
      caseId: "persona",
      surface: "concierge",
      reply: `You're talking to ${truth.brand.assistantName}, the concierge for ${truth.brand.groupName} — ${truth.brand.description}, run by ${truth.brand.hosts}. How can I help with your stay?`,
      expectPass: true,
    },
    {
      label: "accurate rooms and rates, built from the database",
      caseId: "rooms-and-rates",
      surface: "concierge",
      reply: `${flagship?.name} has ${flagshipRooms.length} rooms: ${flagshipRooms
        .map((room) => `the ${room.name} at $${room.rate} a night, sleeping ${room.sleeps}`)
        .join("; ")}. Would you like me to check dates for you?`,
      expectPass: true,
    },
    {
      label: "the live incident: rooms that do not exist",
      caseId: "rooms-and-rates",
      surface: "concierge",
      reply:
        "Forest Creek Lodge offers three types of rooms: the Forest Suite with a king bed and private deck, the Valley Cabin which is a private two-bedroom cabin, and the two-bedroom Garden Loft, perfect for families.",
      expectPass: false,
    },
  ];
}

export type CalibrationRun = {
  passed: boolean;
  inconsistent: boolean;
  relevance: number;
  accuracy: number;
  verdict: string;
};

export type CalibrationResult = {
  label: string;
  expectPass: boolean;
  runs: CalibrationRun[];
  /** Every run matched the known grade, and none contradicted itself. */
  agrees: boolean;
};

/**
 * Grades each fixture `runs` times. Agreement must be unanimous: a judge that
 * gets a known answer right two times in three is not one to rely on.
 */
export async function calibrateJudge(
  truth: GroundTruth,
  today: string,
  runs = 1,
): Promise<CalibrationResult[]> {
  const results: CalibrationResult[] = [];

  for (const fixture of fixtures(truth)) {
    const evalCase = cases.find((candidate) => candidate.id === fixture.caseId);
    if (!evalCase) throw new Error(`calibration refers to unknown case ${fixture.caseId}`);

    const outcomes = await Promise.all(
      Array.from({ length: Math.max(1, runs) }, async (): Promise<CalibrationRun> => {
        const { judgement, inconsistent } = await judgeReply({
          evalCase,
          turns: evalCase.turns,
          surface: fixture.surface,
          reply: fixture.reply,
          truth,
          today,
        });
        return {
          passed: judgementPasses(judgement),
          inconsistent,
          relevance: judgement.relevance,
          accuracy: judgement.accuracy,
          verdict: judgement.verdict,
        };
      }),
    );

    results.push({
      label: fixture.label,
      expectPass: fixture.expectPass,
      runs: outcomes,
      agrees: outcomes.every((run) => !run.inconsistent && run.passed === fixture.expectPass),
    });
  }

  return results;
}
