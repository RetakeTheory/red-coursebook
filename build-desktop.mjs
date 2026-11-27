import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(root, 'build');
const config = JSON.parse(await readFile(path.join(root, 'neutralino.config.json'), 'utf8'));
const cli = createRequire(import.meta.url).resolve('@neutralinojs/neu');
const product = config.cli.binaryName;
const distribution = config.cli.distributionPath.replace(/^\/|\/$/g, '');
await mkdir(build, {recursive: true});
const stage = await mkdtemp(path.join(build, 'desktop-'));

try {
  const products = [];
  for (const platform of ['win_x64.exe', 'mac_universal']) {
    const dir = path.join(stage, platform);
    const settings = structuredClone(config);
    const binary = 'neutralino-' + platform;
    let runtime = path.join(root, 'bin', binary);
    if (platform === 'mac_universal') {
      runtime = path.join(build, 'mac-runtime', binary);
      if (!existsSync(runtime)) {
        if (process.platform !== 'darwin') {
          console.log('To also build for macOS, provide the universal runtime from prepare_mac_runtime.py.');
          continue;
        }
        execFileSync('python3', [path.join(root, 'prepare_mac_runtime.py')], {stdio: 'inherit'});
      }
      // AppKit already expresses NSWindow frames in points on every display.
      Object.assign(settings.modes.window, {borderless: false, useLogicalPixels: false});
      settings.nativeAllowList = ['app.exit', 'storage.getKeys', 'storage.getData', 'storage.setData',
        'window.getPosition', 'window.getSize', 'window.move', 'window.setSize'];
    }
    await mkdir(path.join(dir, 'bin'), {recursive: true});
    await cp(path.join(root, 'site'), path.join(dir, 'site'), {recursive: true});
    await cp(runtime, path.join(dir, 'bin', binary));
    await writeFile(path.join(dir, 'neutralino.config.json'), platform === 'mac_universal'
      ? JSON.stringify(settings, null, 2) : await readFile(path.join(root, 'neutralino.config.json')));
    execFileSync(process.execPath, [cli, 'build', '--embed-resources'], {cwd: dir, stdio: 'inherit'});
    const filename = product + '-' + platform;
    products.push([path.join(dir, distribution, product, filename), filename]);
  }
  const destination = path.join(root, distribution, product);
  await mkdir(destination, {recursive: true});
  for (const [source, filename] of products) await cp(source, path.join(destination, filename));
} finally {
  await rm(stage, {recursive: true, force: true});
}
