import { EmailCategorySchema, type EmailCategory } from "../types/classification";

export const ALL_CATEGORIES: readonly EmailCategory[] = EmailCategorySchema.options;

/** `predicted: null` means the classifier errored for that email. */
export type Prediction = {
  expected: EmailCategory;
  predicted: EmailCategory | null;
};

export type CategoryStats = {
  support: number;
  truePositives: number;
  predictedCount: number;
  precision: number | null;
  recall: number | null;
};

export type Confusion = {
  expected: EmailCategory;
  predicted: EmailCategory | "ERROR";
  count: number;
};

export type EvalReport = {
  total: number;
  correct: number;
  errors: number;
  accuracy: number;
  perCategory: Record<EmailCategory, CategoryStats>;
  /** Wrong answers only, most frequent first. */
  confusions: Confusion[];
};

const ratio = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;

export function scoreClassifications(predictions: Prediction[]): EvalReport {
  const perCategory = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [
      category,
      { support: 0, truePositives: 0, predictedCount: 0 },
    ])
  ) as Record<EmailCategory, { support: number; truePositives: number; predictedCount: number }>;

  const confusionCounts = new Map<string, Confusion>();
  let correct = 0;
  let errors = 0;

  for (const { expected, predicted } of predictions) {
    perCategory[expected].support += 1;

    if (predicted === null) {
      errors += 1;
    } else {
      perCategory[predicted].predictedCount += 1;
    }

    if (predicted === expected) {
      correct += 1;
      perCategory[expected].truePositives += 1;
      continue;
    }

    const shown = predicted ?? "ERROR";
    const key = `${expected}->${shown}`;
    const existing = confusionCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      confusionCounts.set(key, { expected, predicted: shown, count: 1 });
    }
  }

  const stats = Object.fromEntries(
    ALL_CATEGORIES.map((category) => {
      const c = perCategory[category];
      return [
        category,
        {
          ...c,
          precision: ratio(c.truePositives, c.predictedCount),
          recall: ratio(c.truePositives, c.support),
        },
      ];
    })
  ) as Record<EmailCategory, CategoryStats>;

  return {
    total: predictions.length,
    correct,
    errors,
    accuracy: predictions.length === 0 ? 0 : correct / predictions.length,
    perCategory: stats,
    confusions: [...confusionCounts.values()].sort(
      (a, b) => b.count - a.count || a.expected.localeCompare(b.expected)
    ),
  };
}

const pct = (value: number | null) =>
  value === null ? "  n/a" : `${(value * 100).toFixed(0).padStart(4)}%`;

export function formatReport(report: EvalReport): string {
  const lines: string[] = [
    `Accuracy: ${report.correct}/${report.total} (${(report.accuracy * 100).toFixed(1)}%)` +
      (report.errors > 0 ? `, ${report.errors} classifier errors` : ""),
    "",
    "Category         support  precision  recall",
  ];

  for (const category of ALL_CATEGORIES) {
    const c = report.perCategory[category];
    lines.push(
      `${category.padEnd(16)} ${String(c.support).padStart(7)}  ${pct(c.precision)}      ${pct(c.recall)}`
    );
  }

  if (report.confusions.length > 0) {
    lines.push("", "Most common mistakes (expected -> predicted):");
    for (const c of report.confusions) {
      lines.push(`  ${c.count}x  ${c.expected} -> ${c.predicted}`);
    }
  }

  return lines.join("\n");
}
