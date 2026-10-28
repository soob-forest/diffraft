import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

if (process.argv[2] === "pipe-parent") {
  const child = spawn(process.execPath, [import.meta.filename, "pipe-child"], {
    detached: true,
    stdio: "inherit",
    env: {},
  });
  child.unref();
  process.stdout.write("parent");
} else if (process.argv[2] === "pipe-child") {
  setTimeout(() => process.stdout.write("late"), 1500);
} else if (process.argv[2] === "environment") {
  process.stdout.write(JSON.stringify(Object.keys(process.env)));
} else if (process.argv[2] === "guard-tree") {
  const child = spawn(process.execPath, [import.meta.filename, "guard-wait"], {
    stdio: "ignore",
    env: {},
  });
  await writeFile(
    join(process.argv[3], "tree-ready.json"),
    JSON.stringify({ parent: process.pid, child: child.pid }),
  );
  setTimeout(() => {}, 60_000);
} else if (process.argv[2] === "guard-wait") {
  setTimeout(() => {}, 60_000);
}
