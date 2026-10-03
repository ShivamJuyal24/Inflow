/**
 * Measures classifier accuracy against the labeled fixtures.
 * Makes real calls to the Jev API (one per fixture), so it is NOT part of the
 * unit test run.
 *
 *   JEVMODEL_API_KEY=... npx tsx backend/scripts/evalClassification.ts
 *
 * Optional:
 *   EVAL_MIN_ACCURACY=0.8   exit with code 1 if accuracy falls below this
 *   EVAL_VERBOSE=1          print every wrong answer
 */
import { classifyWithJev, cleanEmailBody } from "../src/graph/jevClassifier";
import { CLASSIFICATION_FIXTURES } from "../src/graph/classificationFixtures";
import {
  formatReport,
  scoreClassifications,
  type Prediction,
} from "../src/graph/classificationEval";

const DELAY_MS = 1000; // same pacing as the production classify node

async function main() {
  if (!process.env.JEVMODEL_API_KEY) {
    console.error("JEVMODEL_API_KEY is not set");
    process.exit(2);
  }

  const predictions: Prediction[] = [];
  const wrong: string[] = [];

  for (const [index, fixture] of CLASSIFICATION_FIXTURES.entries()) {
    let predicted: Prediction["predicted"] = null;
    let failure = "";

    try {
      predicted = await classifyWithJev(fixture, cleanEmailBody(fixture.body));
    } catch (error: any) {
      failure = error?.message ?? String(error);
    }

    predictions.push({ expected: fixture.expected, predicted });

    if (predicted !== fixture.expected) {
      wrong.push(
        `${fixture.id}: expected ${fixture.expected}, got ${predicted ?? "ERROR"}` +
          (failure ? ` (${failure})` : "") +
          (fixture.note ? ` [${fixture.note}]` : "")
      );
    }

    if (index < CLASSIFICATION_FIXTURES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  const report = scoreClassifications(predictions);
  console.log(formatReport(report));

  if (process.env.EVAL_VERBOSE && wrong.length > 0) {
    console.log("\nWrong answers:");
    for (const line of wrong) console.log(`  ${line}`);
  }

  const minAccuracy = Number(process.env.EVAL_MIN_ACCURACY);
  if (Number.isFinite(minAccuracy) && report.accuracy < minAccuracy) {
    console.error(
      `\nAccuracy ${(report.accuracy * 100).toFixed(1)}% is below the required ${(minAccuracy * 100).toFixed(1)}%`
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
