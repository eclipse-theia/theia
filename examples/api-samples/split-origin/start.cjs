#!/usr/bin/env node
// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const { spawn } = require('node:child_process');
const { createReadStream, existsSync } = require('node:fs');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { extname, join, normalize, sep } = require('node:path');

const here = __dirname;
const browserDir = join(here, '../../browser');
const frontendDir = join(browserDir, 'lib/frontend');
const port = Number(process.env.THEIA_FRONTEND_PORT ?? 8080);
const backend = process.env.THEIA_BACKEND_URL ?? 'http://localhost:3000';
const token = process.env.THEIA_SPLIT_ORIGIN_TOKEN ?? 'S3Cr3t';
const frontendOrigin = `http://localhost:${port}`;
// Host app at `/`; Theia static files under this prefix (trailing slash in URLs).
const theiaStaticPrefix = '/theia';

const MIME = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.map': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function resolveUnder(dir, pathname) {
    const decoded = decodeURIComponent(pathname.split('?')[0]);
    const resolved = normalize(join(dir, decoded));
    const root = normalize(dir) + sep;
    if (resolved !== normalize(dir) && !resolved.startsWith(root)) {
        return undefined;
    }
    return resolved;
}

if (!existsSync(join(frontendDir, 'index.html'))) {
    console.error('Missing examples/browser/lib/frontend. Build first: npm run build:browser');
    process.exit(1);
}

const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', frontendOrigin);
    const isHost = url.pathname === '/' || url.pathname === '/index.html';
    if (isHost && url.searchParams.has('backend')) {
        res.writeHead(302, { Location: `${theiaStaticPrefix}/${url.search}` });
        res.end();
        return;
    }
    if (isHost) {
        readFile(join(here, 'index.html'), 'utf8').then(html => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html
                .replaceAll('__FRONTEND__', frontendOrigin)
                .replaceAll('__SPA__', `${frontendOrigin}${theiaStaticPrefix}/`)
                .replaceAll('__BACKEND__', backend)
                .replaceAll('__TOKEN__', token));
        }).catch(() => {
            res.writeHead(500);
            res.end();
        });
        return;
    }
    if (url.pathname === theiaStaticPrefix) {
        res.writeHead(302, { Location: `${theiaStaticPrefix}/${url.search}` });
        res.end();
        return;
    }
    if (!url.pathname.startsWith(`${theiaStaticPrefix}/`)) {
        res.writeHead(404);
        res.end();
        return;
    }
    const rest = url.pathname.slice(theiaStaticPrefix.length);
    const pathname = rest === '/' ? '/index.html' : rest;
    const filePath = resolveUnder(frontendDir, pathname);
    const tryPath = filePath && existsSync(filePath) ? filePath : join(frontendDir, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[extname(tryPath)] ?? 'application/octet-stream' });
    const stream = createReadStream(tryPath);
    stream.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(500);
        }
        res.end();
    });
    stream.pipe(res);
});

server.listen(port, () => {
    console.log(`Host page: ${frontendOrigin}/`);
    console.log(`Theia SPA: ${frontendOrigin}${theiaStaticPrefix}/?backend=${backend}&token=${token}`);
    const backendProc = spawn('npm', ['run', '-s', 'start'], {
        cwd: browserDir,
        env: {
            ...process.env,
            THEIA_SPLIT_ORIGIN: '1',
            THEIA_SPLIT_ORIGIN_TOKEN: token,
            THEIA_HOSTS: `localhost:${port}`,
            THEIA_WEBVIEW_EXTERNAL_ENDPOINT: '{{hostname}}',
            THEIA_MINI_BROWSER_HOST_PATTERN: '{{hostname}}'
        },
        stdio: 'inherit'
    });
    let shuttingDown = false;
    const shutdown = () => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        backendProc.kill('SIGTERM');
        server.close();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    backendProc.on('exit', code => {
        server.close();
        process.exit(code ?? 0);
    });
});
