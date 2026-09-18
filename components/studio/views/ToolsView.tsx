"use client";

import Link from "next/link";
import { STUDIO_TOOLS } from "@/lib/studio-nav";
import { IconLock, NavIcon } from "../icons";
import { useStudio } from "../StudioContext";
import "../tools.css";

export function ToolsView() {
  const { english } = useStudio();
  return (
    <ul className="ss-tools">
      {STUDIO_TOOLS.map((tool) => (
        <li key={tool.href}>
          <Link href={tool.href} className={`ss-tools__card${tool.locked ? " is-locked" : ""}`}>
            <span className="ss-tools__icon">
              <NavIcon name={tool.icon} size={22} />
            </span>
            <strong>{english ? tool.en : tool.fr}</strong>
            <em>{english ? tool.enHint : tool.frHint}</em>
            {tool.locked ? <IconLock size={14} className="ss-tools__lock" /> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
