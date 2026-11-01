import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'apps', 'desktop', 'src-tauri', 'resources');
const apiStage = path.join(stage, 'brain-api');
const chatStage = path.join(stage, 'brain-chat', 'out');

const npm = 'npm';

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(npm, ['run', 'build', '-w', 'apps/brain-api'], root);
run(npm, ['run', 'build', '-w', 'apps/brain-chat'], root);

fs.rmSync(apiStage, { recursive: true, force: true });
fs.mkdirSync(apiStage, { recursive: true });
fs.cpSync(path.join(root, 'apps', 'brain-api', 'dist'), path.join(apiStage, 'dist'), { recursive: true });
fs.cpSync(
  path.join(root, 'apps', 'brain-api', 'src', 'db', 'migrations'),
  path.join(apiStage, 'dist', 'db', 'migrations'),
  { recursive: true },
);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'brain-api', 'package.json'), 'utf8'));
delete pkg.devDependencies;
fs.writeFileSync(path.join(apiStage, 'package.json'), JSON.stringify(pkg, null, 2));
fs.copyFileSync(path.join(root, 'CLAUDE-API.md'), path.join(apiStage, 'CLAUDE-API.md'));
run(npm, ['install', '--omit=dev'], apiStage);

fs.rmSync(path.join(stage, 'brain-chat'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'apps', 'brain-chat', 'out'), chatStage, { recursive: true });
console.log('staged desktop resources');
