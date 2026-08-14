import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import * as https from 'node:https';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function ensureFlutterSdk(): Promise<string> {
  // 1. Check if flutter is in PATH
  try {
    const cmd = os.platform() === 'win32' ? 'where flutter' : 'which flutter';
    const { stdout } = await execAsync(cmd);
    const flutterPath = stdout?.toString().split('\n')[0]?.trim();
    if (flutterPath) {
      return flutterPath;
    }
  } catch (e) {
    // Not in PATH, continue
  }

  // 2. Check local `.caide/flutter` installation
  const caideDir = path.join(os.homedir(), '.caide');
  const flutterDir = path.join(caideDir, 'flutter');
  const flutterBin = path.join(flutterDir, 'bin', os.platform() === 'win32' ? 'flutter.bat' : 'flutter');

  try {
    await fs.access(flutterBin, fs.constants.X_OK);
    return flutterBin;
  } catch (e) {
    // Not found or not executable, need to download
  }

  // 3. Download and extract
  console.log('Flutter SDK not found. Downloading latest stable release...');
  await fs.mkdir(caideDir, { recursive: true });

  const platform = os.platform();
  const arch = os.arch();

  let osString = '';
  let archString = '';

  if (platform === 'darwin') {
    osString = 'macos';
    archString = arch === 'arm64' ? '_arm64' : '';
  } else if (platform === 'win32') {
    osString = 'windows';
  } else {
    osString = 'linux';
  }

  const releasesUrl = `https://storage.googleapis.com/flutter_infra_release/releases/releases_${osString}.json`;

  const releasesData = await fetchJson(releasesUrl);
  const stableHash = releasesData.current_release.stable;
  const stableRelease = releasesData.releases.find(
    (r: any) =>
      r.hash === stableHash &&
      (osString !== 'macos' || archString === '' || r.archive.includes(archString))
  );

  if (!stableRelease) {
    throw new Error('Could not find latest stable release');
  }

  const downloadUrl = `https://storage.googleapis.com/flutter_infra_release/releases/${stableRelease.archive}`;
  const archivePath = path.join(caideDir, path.basename(stableRelease.archive));

  console.log(`Downloading ${downloadUrl}...`);
  await downloadFile(downloadUrl, archivePath);

  console.log('Extracting Flutter SDK...');
  if (archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
      await execAsync(`powershell -command "Expand-Archive -Force -Path '${archivePath}' -DestinationPath '${caideDir}'"`);
    } else {
      await execAsync(`unzip -o -q "${archivePath}" -d "${caideDir}"`);
    }
  } else if (archivePath.endsWith('.tar.xz')) {
    await execAsync(`tar -xf "${archivePath}" -C "${caideDir}"`);
  } else {
    throw new Error(`Unsupported archive type: ${archivePath}`);
  }

  // Clean up archive
  await fs.unlink(archivePath);

  // Make sure flutter bin is executable
  if (platform !== 'win32') {
    await execAsync(`chmod +x "${flutterBin}"`);
  }

  // Run flutter --version to initialize (and dismiss welcome prompts)
  console.log('Initializing Flutter...');
  await execAsync(`"${flutterBin}" --version --suppress-analytics`);

  console.log('Flutter SDK downloaded and extracted successfully.');
  return flutterBin;
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 302 && res.headers.location) {
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: ${res.statusCode} ${res.statusMessage}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(dest).catch(() => {});
        reject(err);
      });
  });
}
