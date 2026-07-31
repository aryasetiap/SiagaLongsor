export function appendQuery(
  path: string,
  parameters: Readonly<Record<string, string | number | boolean | undefined>>,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const serialized = query.toString();
  return serialized.length === 0 ? path : `${path}?${serialized}`;
}
