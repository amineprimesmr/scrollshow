"use client";

import { useCallback, useState } from "react";
import { AccountPanel } from "../AccountPanel";
import { AccountsFan, type FanItem } from "../AccountsFan";
import { SetupWidget } from "../SetupWidget";

/** Overview = the accounts fan, full page, with an expandable account panel. */
export function HomeView() {
  const [current, setCurrent] = useState<FanItem | null>(null);
  const [open, setOpen] = useState(true);

  const onSelect = useCallback((item: FanItem | null, viaClick: boolean) => {
    setCurrent(item);
    if (item) setOpen(true);
    if (!item) setOpen(false);
  }, []);

  return (
    <div className={`ss-overview ${open ? "is-open" : ""}`}>
      <AccountsFan onSelect={onSelect} />
      <AccountPanel item={current} expanded={open} onToggle={setOpen} />
      <SetupWidget />
    </div>
  );
}
