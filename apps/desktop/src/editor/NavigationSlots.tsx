import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

type Slots = {
  tasks: HTMLDivElement | null;
  outline: HTMLDivElement | null;
  setTasks: (element: HTMLDivElement | null) => void;
  setOutline: (element: HTMLDivElement | null) => void;
};
const NavigationContext = createContext<Slots | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<HTMLDivElement | null>(null);
  const [outline, setOutline] = useState<HTMLDivElement | null>(null);
  return (
    <NavigationContext value={{ tasks, outline, setTasks, setOutline }}>
      {children}
    </NavigationContext>
  );
}

export function NavigationHosts() {
  const slots = useContext(NavigationContext);
  return (
    <>
      <div ref={slots?.setTasks} />
      <div ref={slots?.setOutline} />
    </>
  );
}

export function NavigationSlot({
  name,
  children,
}: {
  name: "tasks" | "outline";
  children: ReactNode;
}) {
  const slots = useContext(NavigationContext);
  return slots?.[name] ? createPortal(children, slots[name]) : null;
}
