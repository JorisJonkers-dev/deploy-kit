/**
 * A GitHub-style heading anchor: lower case, everything but word characters,
 * hyphens and spaces dropped, then each space turned into a hyphen. The ADR
 * lint and the link lint resolve anchors with this one function, so they
 * cannot disagree about what a heading is called.
 */
export function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .trim()
    .replace(/ /g, "-");
}
