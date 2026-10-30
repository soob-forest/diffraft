export function selectedModel(args) {
  const positions = args.flatMap((value, index) =>
    value === "--model" ? [index] : [],
  );
  if (positions.length > 1) throw new Error("DUPLICATE_MODEL");
  if (!positions.length) return "cli_default";
  const value = args[positions[0] + 1];
  if (!["sonnet", "opus", "haiku"].includes(value))
    throw new Error("INVALID_MODEL");
  return value;
}
