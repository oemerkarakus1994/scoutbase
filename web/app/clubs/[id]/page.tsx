import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

/** Alias wie Figma-Prototyp `/clubs/1` → gleiche Seite wie `/vereine/:id`. */
export default async function ClubAliasPage({ params }: Props) {
  const { id } = await params;
  redirect(`/vereine/${encodeURIComponent(id)}`);
}
