#!/usr/bin/env node
// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/**
 * Qaap fork — mechanical FASE-1 style report: paths that differ from a git base
 * (default origin/master) plus untracked files. Classifies merge-risk for upstream sync.
 *
 * Usage:
 *   node scripts/qaap-upstream-drift-report.js
 *   QAAP_DIFF_BASE=eclipse-theia/main node scripts/qaap-upstream-drift-report.js
 */
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

function sh(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
        return '';
    }
}

function gitOk(ref) {
    const v = sh(`git rev-parse --verify ${ref}`);
    return Boolean(v);
}

const base = process.env.QAAP_DIFF_BASE || 'origin/master';

/** @type {Set<string>} */
const files = new Set();

if (gitOk(base)) {
    sh(`git diff --name-only ${base} --`).split('\n').filter(Boolean).forEach(f => files.add(f));
} else {
    console.error(`[qaap-upstream-drift-report] Base ref "${base}" not found. Using HEAD (committed+staged+unstaged vs index).`);
    sh('git diff --name-only HEAD').split('\n').filter(Boolean).forEach(f => files.add(f));
    sh('git diff --name-only --cached').split('\n').filter(Boolean).forEach(f => files.add(f));
}

sh('git ls-files -o --exclude-standard').split('\n').filter(Boolean).forEach(f => files.add(f));

/**
 * @param {string} p
 * @returns {string}
 */
function riesgo(p) {
    if (p.startsWith('packages/core/')) {
        return 'critico';
    }
    if (/^packages\/(monaco|mini-browser|plugin-ext|plugin-ext-vscode|plugin-ext-headless)\//.test(p)) {
        return 'alto';
    }
    if (p.startsWith('packages/qaap-')) {
        return 'producto';
    }
    if (p.startsWith('packages/')) {
        return 'medio';
    }
    return 'bajo';
}

/**
 * @param {string} p
 * @returns {string}
 */
function paquete(p) {
    const m = p.match(/^packages\/([^/]+)\//);
    if (m) {
        return m[1];
    }
    const top = p.split('/')[0];
    return top || '(root)';
}

const list = [...files].sort();
const byPkg = new Map();

for (const f of list) {
    const pkg = paquete(f);
    if (!byPkg.has(pkg)) {
        byPkg.set(pkg, []);
    }
    byPkg.get(pkg).push(f);
}

console.log(`Base: ${gitOk(base) ? base : 'HEAD (fallback)'}`);
console.log(`Archivos distintos / sin seguimiento: ${list.length}\n`);

console.log(`${pad('paquete', 28)} ${pad('riesgo(max)', 12)} ${pad('n', 4)}`);
console.log(`${'-'.repeat(28)} ${'-'.repeat(12)} ${'-'.repeat(4)}`);

const pkgKeys = [...byPkg.keys()].sort();
for (const pkg of pkgKeys) {
    const paths = byPkg.get(pkg);
    const maxRisk = paths.reduce((acc, p) => {
        const r = riesgo(p);
        const order = { critico: 4, alto: 3, medio: 2, producto: 1, bajo: 0 };
        return order[r] > order[acc] ? r : acc;
    }, /** @type {string} */ ('bajo'));
    console.log(`${pad(pkg, 28)} ${pad(maxRisk, 12)} ${pad(String(paths.length), 4)}`);
}

console.log('\n--- Detalle (riesgo, ruta) ---\n');
for (const f of list) {
    console.log(`${pad(riesgo(f), 10)} ${f}`);
}

/**
 * @param {string} s
 * @param {number} w
 */
function pad(s, w) {
    return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);
}
