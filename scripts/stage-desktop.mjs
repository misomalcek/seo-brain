import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
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
// Ship the Node runtime inside the app. Until 0.1.0 the shell looked for a
// system node and exited without a window when there was none, which is the
// usual case on Windows. The bundled runtime is the build machine's exact
// version, so the native modules npm just installed match its ABI.
async function stageNode() {
  const version = process.version;
  const plat = process.platform === 'win32' ? 'win' : process.platform;
  const arch = process.arch;
  const base = `node-${version}-${plat}-${arch}`;
  const file = plat === 'win' ? `${base}.zip` : `${base}.tar.gz`;
  const url = `https://nodejs.org/dist/${version}/${file}`;
  const cache = path.join(root, 'apps', 'desktop', '.node-cache');
  fs.mkdirSync(cache, { recursive: true });
  const archive = path.join(cache, file);
  if (!fs.existsSync(archive)) {
    console.log(`downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`node download ${res.status} ${url}`);
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  }
  const sums = await (await fetch(`https://nodejs.org/dist/${version}/SHASUMS256.txt`)).text();
  const want = sums.split('\n').find((l) => l.endsWith(`  ${file}`))?.split(' ')[0];
  const got = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  if (!want || want !== got) {
    fs.rmSync(archive, { force: true });
    throw new Error(`node checksum mismatch for ${file}: want ${want} got ${got}`);
  }
  const unpack = path.join(cache, base);
  if (!fs.existsSync(unpack)) run('tar', ['-xf', archive, '-C', cache], cache);
  const nodeStage = path.join(stage, 'node');
  fs.rmSync(nodeStage, { recursive: true, force: true });
  fs.mkdirSync(nodeStage, { recursive: true });
  const bin = plat === 'win' ? path.join(unpack, 'node.exe') : path.join(unpack, 'bin', 'node');
  const dest = path.join(nodeStage, plat === 'win' ? 'node.exe' : 'node');
  fs.copyFileSync(bin, dest);
  if (plat !== 'win') fs.chmodSync(dest, 0o755);
  console.log(`staged node ${version} ${plat}-${arch}`);
}
await stageNode();

console.log('staged desktop resources');
