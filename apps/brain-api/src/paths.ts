import path from 'path';

/** Data root. Desktop sets TEAM_BRAIN_ROOT before Node starts. The server keeps /opt/team-brain. */
export function brainRoot(): string {
  return process.env.TEAM_BRAIN_ROOT || '/opt/team-brain';
}

/** Published files. Desktop uses a folder inside the data root. The server keeps /var/www/brain. */
export function wwwRoot(): string {
  if (process.env.SEO_BRAIN_WWW) return process.env.SEO_BRAIN_WWW;
  if (process.env.SEO_BRAIN_DESKTOP === '1') return path.join(brainRoot(), 'www');
  return '/var/www/brain';
}

export function brainPath(...parts: string[]): string {
  return path.join(brainRoot(), ...parts);
}

export function wwwPath(...parts: string[]): string {
  return path.join(wwwRoot(), ...parts);
}
