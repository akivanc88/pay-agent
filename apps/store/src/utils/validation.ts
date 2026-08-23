/** Defines request-validation helpers and consistent client-facing validation failures. */

import { type Context, type Env } from "hono";
import * as z from "zod";

/**
 * Middleware to handle Zod validation results.
 * Logs the validation status and returns a 422 error with a pretty-printed message if validation fails.
 *
 * @param result - The result of the Zod validation.
 * @param c - The Hono context.
 * @returns A response object if validation fails, otherwise void (implied continuation).
 */
const formatPath = (path: (string | number)[]) => {
  return path.reduce((acc, val) => {
    if (typeof val === "number") {
      return `${acc}[${val}]`;
    }
    return acc ? `${acc}.${val}` : String(val);
  }, "");
};

export function prettyValidation<T>(
  result:
    | { success: true; data: T; target: string }
    | { success: false; error: z.ZodError },
  c: Context
) {
  if (result.success) {
    c.var.logger.info(
      `Request payload (${result.target}) passed validation:\n${JSON.stringify(result.data, null, 2)}`
    );
  } else {
    c.var.logger.warn("Request payload failed validation");
    c.var.logger.warn(
      `Request payload:\n${JSON.stringify(c.req.json(), null, 2)}`
    );
    const prettyError = result.error.issues
      .map((issue) => {
        const path = formatPath(issue.path);
        return `✖ ${issue.message}\n  → at ${path}`;
      })
      .join("\n");

    c.var.logger.warn(prettyError);
    return c.text(prettyError, 422);
  }
}

/**
 * Schema for validating route parameters containing an ID.
 */
export const IdParamSchema = z.object({
  id: z.string(),
});

export type IdParamContext = Context<
  Env,
  string,
  {
    in: { param: z.input<typeof IdParamSchema> };
    out: { param: z.output<typeof IdParamSchema> };
  }
>;

/**
 * Body for the testing-only "issue a gift card" endpoint. `dollars` matches the CLI script's
 * own unit (`issue-card.ts` takes a dollar string) rather than minor units, since this is the
 * one surface meant to be driven by a human-chosen amount rather than computed.
 */
export const IssueCardRequestSchema = z.object({
  code: z.string().min(1),
  pin: z.string().min(1),
  dollars: z.number().nonnegative(),
  userId: z.string().optional(),
});

export type IssueCardContext = Context<
  Env,
  string,
  {
    in: { json: z.input<typeof IssueCardRequestSchema> };
    out: { json: z.output<typeof IssueCardRequestSchema> };
  }
>;
