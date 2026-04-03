import Image from "next/image";

import {
  buildOefbPlayerPhotoUrl,
  buildVereinePersonPhotoUrl,
} from "@/lib/oefb-assets";
import { cn } from "@/lib/cn";

type Props = {
  name: string;
  fotoPublicUid: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (
      parts[0]![0] + parts[parts.length - 1]![0]
    ).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "—";
}

export function PlayerAvatar({
  name,
  fotoPublicUid,
  size = "md",
  className,
}: Props) {
  const isLarge = size === "lg";
  const px = isLarge ? 160 : size === "sm" ? 32 : 40;
  const url = isLarge
    ? buildOefbPlayerPhotoUrl(fotoPublicUid, "320x320")
    : buildVereinePersonPhotoUrl(fotoPublicUid, "100x100");

  const box = isLarge
    ? "h-40 w-40 text-4xl font-semibold"
    : size === "sm"
      ? "h-8 w-8 text-[10px]"
      : "h-10 w-10 text-[11px]";

  if (url) {
    return (
      <Image
        src={url}
        width={px}
        height={px}
        alt=""
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-slate-200/80",
          box,
          className,
        )}
        sizes={isLarge ? "160px" : `${px}px`}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-600 ring-1 ring-slate-200/60",
        box,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
