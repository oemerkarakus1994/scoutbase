/** Stabiles DOM-`id` für Anker von `/ligen` (Edition-IDs enthalten oft `:`). */
export function bewerbEditionElementId(editionId: string): string {
  return `bewerb-edition-${editionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
