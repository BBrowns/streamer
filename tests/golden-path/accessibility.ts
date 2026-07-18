import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Expo web deliberately uses layout-oriented native primitives rather than
// browser landmarks for much of its shell. Keep the automated gate focused on
// the WCAG A/AA rules that apply to the rendered controls, names, states, and
// contrast; structural best-practice checks stay covered by the explicit
// semantic assertions in the golden-path suite.
const WCAG_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22a",
  "wcag22aa",
];

type AxeViolations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

function formatViolations(violations: AxeViolations) {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => {
          const target = node.target.join(" ");
          return `  ${target}${node.failureSummary ? `\n    ${node.failureSummary}` : ""}`;
        })
        .join("\n");

      return `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}\n${violation.helpUrl}\n${nodes}`;
    })
    .join("\n\n");
}

/**
 * Runs Axe only inside a rendered app surface. Keeping the selector explicit
 * prevents player video/canvas implementations and hidden route siblings from
 * making deterministic UI checks flaky.
 */
export async function expectAccessibleSurface(
  page: Page,
  surfaceSelector: string,
  surfaceName: string,
) {
  const results = await new AxeBuilder({ page })
    .include(surfaceSelector)
    .withTags(WCAG_AA_TAGS)
    .analyze();

  expect(
    results.violations,
    `${surfaceName} has WCAG A/AA accessibility violations:\n${formatViolations(results.violations)}`,
  ).toEqual([]);
}
