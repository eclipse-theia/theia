#!/usr/bin/env node
/**
 * Syncs generated frontend static files into lib/frontend (Qaap login gate + index.html)
 * and creates .gz companion files for large JS/CSS assets so the Express server can serve
 * pre-compressed content (37 MB bundle.js → ~9 MB gzipped).
 * Run after `theia build` — lib/ is not updated automatically otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
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

const libIndex = path.join(libFrontend, 'index.html');
if (!copyIfExists(srcIndex, libIndex)) {
    console.warn('[qaap] src-gen/frontend/index.html missing — run: npx theia generate');
}

const BUNDLE_SCRIPT = '<script type="text/javascript" src="./bundle.js" charset="utf-8"></script>';
const GATE_SCRIPT = '<script type="text/javascript" src="./qaap-login-gate.js" charset="utf-8"></script>';

function patchIndexForLoginGate(indexPath) {
    if (!fs.existsSync(indexPath) || !fs.existsSync(path.join(libFrontend, 'qaap-login-gate.js'))) {
        return;
    }
    let html = fs.readFileSync(indexPath, 'utf8');
    if (html.includes('qaap-login-gate.js')) {
        return;
    }
    if (html.includes(BUNDLE_SCRIPT)) {
        html = html.replace(BUNDLE_SCRIPT, GATE_SCRIPT);
    } else {
        html = html.replace('</body>', `    ${GATE_SCRIPT}\n</body>`);
    }
    fs.writeFileSync(indexPath, html, 'utf8');
}

patchIndexForLoginGate(libIndex);
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

// Pre-compress large assets so the Express server (serveGzipped) can serve .gz directly.
// This converts the 37 MB bundle.js into ~9 MB — a critical mobile performance win.
const GZIP_EXTS = /\.(js|css|wasm|svg|html|json)$/i;
const GZIP_MIN_BYTES = 1024; // skip tiny files where gzip overhead isn't worth it

async function gzipFile(filePath) {
    const stat = fs.statSync(filePath);
    if (stat.size < GZIP_MIN_BYTES) { return; }
    const gzPath = filePath + '.gz';
    const srcMtime = stat.mtimeMs;
    if (fs.existsSync(gzPath)) {
        const gzMtime = fs.statSync(gzPath).mtimeMs;
        if (gzMtime >= srcMtime) { return; } // already up-to-date
    }
    await pipeline(
        fs.createReadStream(filePath),
        createGzip({ level: 9 }),
        fs.createWriteStream(gzPath)
    );
}

const gzipTargets = fs.readdirSync(libFrontend)
    .filter(f => GZIP_EXTS.test(f) && !f.endsWith('.gz'))
    .map(f => path.join(libFrontend, f));

const gzipResults = await Promise.allSettled(gzipTargets.map(gzipFile));
const failed = gzipResults.filter(r => r.status === 'rejected');
if (failed.length) {
    console.warn('[qaap] gzip failed for some files:', failed.map(r => r.reason).join(', '));
}

const compressed = gzipTargets.filter((_, i) => gzipResults[i].status === 'fulfilled');
if (compressed.length) {
    const sizes = compressed.map(f => {
        const orig = fs.statSync(f).size;
        const gz = fs.existsSync(f + '.gz') ? fs.statSync(f + '.gz').size : orig;
        return `${path.basename(f)}: ${(orig / 1e6).toFixed(1)} MB → ${(gz / 1e6).toFixed(1)} MB`;
    });
    console.log('[qaap] gzipped:', sizes.join(', '));
}

console.log('[qaap] synced frontend static files → lib/frontend/');
