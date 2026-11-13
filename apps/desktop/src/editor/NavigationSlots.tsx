import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

type Slots = {
  open: boolean;
  setOpen: (value: boolean) => void;
  outline: HTMLDivElement | null;
  setOutline: (element: HTMLDivElement | null) => void;
};
const NavigationContext = createContext<Slots | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [outline, setOutline] = useState<HTMLDivElement | null>(null);
  return (
    <NavigationContext value={{ outline, setOutline, open, setOpen }}>
      {children}
    </NavigationContext>
  );
}

export function useNavigationVisibility() {
  const slots = useContext(NavigationContext);
  return { open: slots?.open ?? false, setOpen: slots?.setOpen };
}

export function NavigationHost() {
  const slots = useContext(NavigationContext);
  return <div ref={slots?.setOutline} />;
}

export function NavigationSlot({ children }: { children: ReactNode }) {
  const slots = useContext(NavigationContext);
  return slots?.outline ? createPortal(children, slots.outline) : null;
}
