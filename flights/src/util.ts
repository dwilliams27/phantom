export function extractJson(raw: string): any {
  const cleaned = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON object found in output: " + raw.substring(0, 500));
  }
  return JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
}
