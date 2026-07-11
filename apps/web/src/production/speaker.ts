const palette = [
  ["#2563a5", "rgba(37,99,165,.2)", "#16456f"],
  ["#b25d28", "rgba(178,93,40,.2)", "#7a3514"],
  ["#327a58", "rgba(50,122,88,.2)", "#20543d"],
  ["#8b5b98", "rgba(139,91,152,.22)", "#603d6a"],
  ["#a98222", "rgba(169,130,34,.2)", "#6b510f"],
  ["#a64455", "rgba(166,68,85,.2)", "#702b38"],
  ["#3c7d8b", "rgba(60,125,139,.2)", "#285761"],
] as const;
export function speakerColor(speaker: string | null) {
  if (!speaker)
    return { solid: "#71717a", soft: "rgba(113,113,122,.16)", text: "#3f3f46" };
  let hash = 0;
  for (const char of speaker) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [solid, soft, text] = palette[hash % palette.length];
  return { solid, soft, text };
}
export function speakerInitials(value: string | null) {
  if (!value) return "—";
  if (value.startsWith("[")) return value.slice(1, 3);
  return value
    .split(/[\s_-]+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
export const stableUserColor = (id: string) => speakerColor(id).solid;
