#!/usr/bin/env node
/**
 * Syncs generated frontend static files into lib/frontend (Qaap login gate + index.html).
 * Run after `theia build` / esbuild watch — lib/ is not updated automatically otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import resolvePackagePath from 'resolve-package-path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const libFrontend = path.join(root, 'lib', 'frontend');
const srcFrontend = path.join(root, 'src-gen', 'frontend');
const srcIndex = path.join(srcFrontend, 'index.html');
const srcManifest = path.join(srcFrontend, 'manifest.webmanifest');
const srcServiceWorker = path.join(srcFrontend, 'service-worker.js');

function copyIfExists(from, to) {
    if (fs.existsSync(from)) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
        return true;
    }
    return false;
}

fs.mkdirSync(libFrontend, { recursive: true });

if (!copyIfExists(srcIndex, path.join(libFrontend, 'index.html'))) {
    console.warn('[qaap] src-gen/frontend/index.html missing — run: npx theia generate');
}
copyIfExists(srcManifest, path.join(libFrontend, 'manifest.webmanifest'));
// Service worker must sit at the same scope as index.html so it can control the whole app.
copyIfExists(srcServiceWorker, path.join(libFrontend, 'service-worker.js'));

try {
    const qaapRoot = path.dirname(resolvePackagePath('@theia/qaap-product', root));
    const gate = path.join(qaapRoot, 'resources', 'qaap-login-gate.js');
    copyIfExists(gate, path.join(libFrontend, 'qaap-login-gate.js'));
} catch {
    console.warn('[qaap] @theia/qaap-product not found — skipping qaap-login-gate.js');
}

const media = path.join(root, 'media');
if (fs.existsSync(media)) {
    fs.cpSync(media, path.join(libFrontend, 'media'), { recursive: true });
}

console.log('[qaap] synced frontend static files → lib/frontend/');
