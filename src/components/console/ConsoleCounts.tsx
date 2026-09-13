/** The shared header count line: schools, teams, players, last sweep. */
export function ConsoleCounts(counts?: {
  schools: number;
  programs: number;
  players: number;
  lastSweepAt: string | null;
}): string[] {
  if (!counts) return [];
  const fmt = (value: number) => value.toLocaleString("en-US");
  const line = [
    `${fmt(counts.schools)} schools`,
    `${fmt(counts.programs)} programs`,
    `${fmt(counts.players)} players`,
  ];
  if (counts.lastSweepAt) line.push(`last sweep ${ago(counts.lastSweepAt)}`);
  return line;
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
