import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import schema from "../src/generated/ai-response.schema.json";

const validator = new Ajv({ strict: true });
validator.addFormat("uint32", {
  type: "number",
  validate: (value: number) =>
    Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
});
const validate = validator.compile(schema);
const fixture = fileURLToPath(
  new URL("./fixtures/fake-claude.mjs", import.meta.url),
);
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

async function fakeCli(mode: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "docreview-contract-"));
  try {
    return await new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [fixture, mode],
        {
          cwd: directory,
          env: { TZ: "UTC" },
          timeout: 5000,
          maxBuffer: MAX_RESPONSE_BYTES,
        },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        },
      );
      child.stdin?.end(JSON.stringify({ schemaVersion: 1 }));
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("Rust-generated AI contract", () => {
  it.each(["PATCH", "REWRITE", "EXPLAIN"])(
    "accepts isolated %s CLI fixtures",
    async (mode) => {
      const result = JSON.parse(await fakeCli(mode));
      expect(result.is_error).toBe(false);
      expect(
        validate(result.structured_output),
        JSON.stringify(validate.errors),
      ).toBe(true);
    },
  );
  it("rejects malformed CLI output", async () => {
    const output = await fakeCli("malformed");
    expect(() => JSON.parse(output)).toThrow(SyntaxError);
  });
  it("rejects missing fields, unknown fields, mixed modes, versions and sizes", () => {
    for (const invalid of [
      { schema_version: 1, mode: "EXPLAIN" },
      { schema_version: 1, mode: "EXPLAIN", answer: "a", extra: true },
      { schema_version: 1, mode: "EXPLAIN", answer: "a", changes: [] },
      { schema_version: 2, mode: "EXPLAIN", answer: "a" },
      { schema_version: 1, mode: "EXPLAIN", answer: "a".repeat(65537) },
    ])
      expect(validate(invalid)).toBe(false);
  });
});
