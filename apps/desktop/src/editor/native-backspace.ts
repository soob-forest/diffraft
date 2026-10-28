import type { Command, KeyBinding } from "@codemirror/view";

function preserveMultipleSelection(
  command: Command | undefined,
  preventDefault = false,
): Command {
  return (view) => {
    if (!view.state.readOnly && view.state.selection.ranges.length === 1)
      return false;
    return Boolean(command?.(view) || preventDefault);
  };
}

export function nativeBackspaceKeymap(
  bindings: readonly KeyBinding[],
): KeyBinding[] {
  return bindings.map((binding) =>
    binding.key !== "Backspace"
      ? binding
      : {
          ...binding,
          preventDefault: false,
          run: preserveMultipleSelection(binding.run, binding.preventDefault),
          shift: binding.shift
            ? preserveMultipleSelection(binding.shift, binding.preventDefault)
            : undefined,
        },
  );
}
