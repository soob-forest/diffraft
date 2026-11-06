import type { TaskSnapshot } from "../generated/TaskSnapshot";
export function taskChoiceLabels(tasks: TaskSnapshot[]) {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const name = task.name ?? task.goal;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return tasks.map((task) => {
    const name = task.name ?? task.goal;
    const index = (seen.get(name) ?? 0) + 1;
    seen.set(name, index);
    return {
      id: task.id,
      label: counts.get(name) === 1 ? name : `${name} · 같은 이름 ${index}`,
    };
  });
}
