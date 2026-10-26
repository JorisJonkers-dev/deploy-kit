// What a dashboard file says of itself (spec/v1/10-project-intent.md#dashboards).

/** The `uid` a dashboard's JSON names, where it names one as a string. */
export function dashboardUidOf(content: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  // A primitive has no own `uid`, and reading one off it is undefined.
  const uid = parsed === null ? undefined : (parsed as { uid?: unknown }).uid;
  return typeof uid === "string" && uid.length > 0 ? uid : undefined;
}
