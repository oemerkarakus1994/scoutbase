"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { useProfilePreview } from "@/components/profile-preview-context";

export function parseProfilePreviewTarget(
  href: string,
): { kind: "person"; id: string } | { kind: "verein"; id: string } | null {
  try {
    const u = new URL(href, "http://local");
    const path = u.pathname;
    const mSpieler = path.match(/^\/spieler\/([^/]+)/);
    if (mSpieler) {
      return { kind: "person", id: decodeURIComponent(mSpieler[1]!) };
    }
    const mVerein = path.match(/^\/vereine\/([^/]+)/);
    if (mVerein) {
      return { kind: "verein", id: decodeURIComponent(mVerein[1]!) };
    }
    const mClub = path.match(/^\/clubs\/([^/]+)/);
    if (mClub) {
      return { kind: "verein", id: decodeURIComponent(mClub[1]!) };
    }
  } catch {
    return null;
  }
  return null;
}

type LinkProps = ComponentProps<typeof Link>;

/**
 * Öffnet Spieler- und Vereinsprofile im großen Vorschau-Modal (Primärklick).
 * Mittelklick / Strg·Klick / Cmd·Klick behalten die normale Navigation.
 */
export function ProfilePreviewLink({
  href,
  onClick,
  ...rest
}: LinkProps) {
  const preview = useProfilePreview();

  if (typeof href !== "string") {
    return <Link href={href} onClick={onClick} {...rest} />;
  }

  const target = parseProfilePreviewTarget(href);

  if (!target || !preview) {
    return <Link href={href} onClick={onClick} {...rest} />;
  }

  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        if (
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          onClick?.(e);
          return;
        }
        e.preventDefault();
        if (target.kind === "person") {
          preview.openPerson(target.id);
        } else {
          preview.openVerein(target.id);
        }
        onClick?.(e);
      }}
    />
  );
}
