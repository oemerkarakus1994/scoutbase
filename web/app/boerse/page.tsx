import type { Metadata } from "next";

import { BoerseMarketplace } from "@/components/boerse-marketplace";

export const metadata: Metadata = {
  title: "Börse",
  description: "Spieler- und Trainerbörse — Suche & Biete",
};

export default function BoersePage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <BoerseMarketplace />
    </main>
  );
}
