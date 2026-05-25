#!/usr/bin/env node
// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/**
 * CI guard: fail if tracked paths drift from upstream outside an allowlist.
 * Product code must live under `packages/qaap-*` (or documented seams in core).
 *
 * Usage:
 *   node scripts/qaap-drift-check.js
 *   QAAP_DIFF_BASE=upstream/master node scripts/qaap-drift-check.js
 *
 * Report only (always exit 0):
 *   QAAP_DRIFT_CHECK_REPORT=1 node scripts/qaap-drift-check.js
 *
 * Known historical drift (outside allowlist) is listed in qaap-drift-baseline.txt.
 * The check fails only when NEW paths drift outside the allowlist. Shrink the baseline
 * as paths are migrated into packages/qaap-*.
 */
'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const baselinePath = path.join(__dirname, 'qaap-drift-baseline.txt');

function sh(cmd) {
    try {
        return execSync(cmd, { encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
        return '';
    }
}

const base = process.env.QAAP_DIFF_BASE || 'upstream/master';
const reportOnly = process.env.QAAP_DRIFT_CHECK_REPORT === '1';

/** @type {RegExp[]} Paths allowed to differ from upstream (seams + examples + tooling). */
const ALLOWED = [
    /^packages\/qaap-/,
    /^scripts\/qaap-/,
    // Documented core seams for product rebind / mobile helpers
    /^packages\/core\/src\/browser\/menu\/workbench-top-bar-factory\.ts$/,
    /^packages\/core\/src\/browser\/shell\/mobile-layout-state\.ts$/,
    /^packages\/core\/src\/browser\/shell\/index\.ts$/,
    /^packages\/core\/src\/browser\/menu\/browser-menu-module\.ts$/,
    /^packages\/core\/src\/browser\/menu\/browser-menu-plugin\.ts$/,
    /^packages\/core\/src\/browser\/window\/window-title-service\.ts$/,
    /^packages\/mini-browser\/src\/browser\/mini-browser-open-hook\.ts$/,
    /^packages\/mini-browser\/src\/browser\/mini-browser-opener-options\.ts$/,
    /^packages\/mini-browser\/src\/browser\/mini-browser-url-utils\.ts$/,
    /^packages\/mini-browser\/src\/browser\/mini-browser-open-handler\.ts$/,
    /^packages\/monaco\/src\/browser\/monaco-quick-input-layout\.ts$/,
    /^packages\/ai-core\/src\/browser\/window-blink-service\.ts$/,
    /^packages\/core\/src\/electron-main\/electron-main-application\.ts$/,
    /^packages\/mini-browser\/src\/browser\/mini-browser-content\.ts$/,
    /^packages\/monaco\/src\/browser\/monaco-frontend-module\.ts$/,
    /^packages\/monaco\/src\/browser\/monaco-quick-input-service\.ts$/,
    /^packages\/workspace\/src\/browser\/workspace-trust-dialog\.tsx$/,
    /^packages\/workspace\/src\/browser\/workspace-trust-dialog-factory\.ts$/,
    /^packages\/workspace\/src\/browser\/workspace-trust-service\.ts$/,
    /^packages\/workspace\/src\/browser\/workspace-frontend-module\.ts$/,
    /^\.nvmrc$/,
    // Examples / branding / deploy (not upstream Theia)
    /^examples\//,
    // Upstream sample plugins removed in this fork — we ship our own plugin set.
    /^sample-plugins\//,
    // Fork-specific build tooling and dev scripts (not user-facing product code).
    /^dev-packages\/bundle-plugin\//,
    /^dev-packages\/localization-manager\//,
    /^dev-packages\/private-re-exports\//,
    /^scripts\/debug-.*\.mjs$/,
    /^scripts\/translation-update\.js$/,
    /^\.github\/workflows\/set-milestone-on-pr\.yml$/,
    // ---- Product seams in upstream Theia AI packages -----------------------
    // Small tweaks in upstream Theia AI packages to match product behaviour
    // (model lists, branding strings, dropped-Theia-only test fixtures, minor
    // renderer/contribution adjustments). These are intentional fork edits and
    // not full-featured forks of the package; deeper feature changes are
    // tracked in qaap-drift-baseline.txt pending extraction.
    /^packages\/ai-anthropic\/src\/common\/anthropic-preferences\.ts$/,
    /^packages\/ai-google\/src\/common\/google-preferences\.ts$/,
    /^packages\/ai-chat-ui\/src\/browser\/chat-response-renderer\/toolcall-part-renderer\.tsx$/,
    /^packages\/ai-chat-ui\/src\/browser\/generic-capabilities-tree\.tsx$/,
    /^packages\/ai-chat\/src\/common\/chat-content-deserializer\.ts$/,
    /^packages\/ai-chat\/src\/common\/chat-content-deserializer\.spec\.ts$/,
    /^packages\/ai-code-completion\/src\/browser\/code-completion-agent\.ts$/,
    /^packages\/ai-code-completion\/src\/browser\/code-completion-variable-contribution\.spec\.ts$/,
    /^packages\/ai-copilot\/src\/browser\/copilot-auth-dialog-messages\.ts$/,
    /^packages\/ai-core\/src\/browser\/theia-variable-contribution\.ts$/,
    /^packages\/ai-terminal\/src\/browser\/shell-execution-tool-renderer\.tsx$/,
    /^packages\/ai-terminal\/src\/node\/shell-execution-server-impl\.ts$/,
    // ai-ide: workspace launch / model alias UI / prompt template tweaks for product
    /^packages\/ai-ide\/package\.json$/,
    /^packages\/ai-ide\/tsconfig\.json$/,
    /^packages\/ai-ide\/src\/browser\/ai-configuration\/language-model-renderer\.tsx$/,
    /^packages\/ai-ide\/src\/browser\/ai-configuration\/model-aliases-configuration-widget\.tsx$/,
    /^packages\/ai-ide\/src\/browser\/context-file-validation-service-impl\.spec\.ts$/,
    /^packages\/ai-ide\/src\/browser\/ide-chat-welcome-message-provider\.tsx$/,
    /^packages\/ai-ide\/src\/browser\/review\/pr-review-prompt-template\.ts$/,
    /^packages\/ai-ide\/src\/browser\/style\/widgets\/model-aliases-configuration\.css$/,
    /^packages\/ai-ide\/src\/browser\/workspace-launch-provider\.ts$/,
    /^packages\/ai-ide\/src\/common\/command-chat-agents\.ts$/,
    /^packages\/ai-ide\/src\/common\/command-prompt-template\.ts$/,
    /^packages\/ai-ide\/src\/common\/workspace-preferences\.ts$/,
    // ---- Misc product seams in upstream Theia packages ---------------------
    /^packages\/core\/README\.md$/,
    /^packages\/core\/package\.json$/,
    /^packages\/core\/src\/browser\/decorations-service\.ts$/,
    /^packages\/core\/src\/browser\/shell\/application-shell\.ts$/,
    /^packages\/core\/src\/browser\/style\/select-component\.css$/,
    /^packages\/core\/src\/browser\/widgets\/select-component\.tsx$/,
    /^packages\/core\/src\/node\/logger-cli-contribution\.spec\.ts$/,
    /^packages\/debug\/src\/browser\/style\/index\.css$/,
    /^packages\/filesystem\/src\/browser\/file-tree\/file-tree-decorator-adapter\.ts$/,
    /^packages\/getting-started\/src\/browser\/getting-started-widget\.tsx$/,
    /^packages\/mini-browser\/src\/browser\/location-mapper-service\.ts$/,
    /^packages\/mini-browser\/src\/browser\/mini-browser-url-utils\.spec\.ts$/,
    /^packages\/scm\/src\/browser\/scm-tree-widget\.tsx$/,
    /^packages\/terminal\/src\/browser\/style\/terminal\.css$/,
    // ---- Plugin host customizations (small upstream patches) ---------------
    /^packages\/plugin-ext\/src\/common\/plugin-protocol\.ts$/,
    /^packages\/plugin-ext\/src\/hosted\/node\/plugin-reader\.ts$/,
    /^packages\/plugin-ext\/src\/plugin\/plugin-manager\.ts$/,
    /^packages\/plugin-ext\/src\/main\/browser\/tabs\/tabs-main\.ts$/,
    /^packages\/plugin-ext\/src\/main\/browser\/view\/plugin-view-registry\.ts$/,
    /^packages\/plugin-ext\/src\/main\/browser\/webview\/webview-resource-cache\.ts$/,
    /^package\.json$/,
    /^package-lock\.json$/,
    /^CLAUDE\.md$/,
    /^doc\/qaap-.*\.md$/,
    /^\.github\/workflows\/qaap-.*\.yml$/,
    /^\.prompts\//,
    /^\.theia\//,
    /^\.dockerignore$/,
    /^Dockerfile$/,
    /^docker-compose\.yml$/,
    /^vercel\.json$/,
    /^\.env\.docker\.example$/,
    /^\.gitignore$/,
    /^\.vscode\//,
    /^CHANGELOG\.md$/,
    /^doc\/Migration\.md$/,
    /^doc\/Publishing\.md$/,
    /^dev-packages\/application-manager\//,
    /^dev-packages\/application-package\//,
    /^dev-packages\/cli\//,
];

/**
 * @param {string} p
 */
function isAllowed(p) {
    return ALLOWED.some(re => re.test(p));
}

/** @returns {Set<string>} */
function loadBaseline() {
    if (!fs.existsSync(baselinePath)) {
        return new Set();
    }
    const lines = fs.readFileSync(baselinePath, 'utf8').split('\n');
    /** @type {Set<string>} */
    const set = new Set();
    for (const line of lines) {
        const t = line.replace(/#.*$/, '').trim();
        if (t) {
            set.add(t);
        }
    }
    return set;
}

if (!sh(`git rev-parse --verify ${base}`)) {
    console.error(`[qaap-drift-check] Base ref "${base}" not found. Fetch upstream or set QAAP_DIFF_BASE.`);
    process.exit(2);
}

/** @type {string[]} */
const files = sh(`git diff --name-only ${base} --`).split('\n').filter(Boolean);

/** @type {string[]} */
const violations = files.filter(f => !isAllowed(f));
const baseline = loadBaseline();
/** @type {string[]} */
const newDrift = violations.filter(f => !baseline.has(f));
/** @type {string[]} */
const resolvedBaseline = [...baseline].filter(f => !violations.includes(f));

console.log(`[qaap-drift-check] Base: ${base}`);
console.log(`[qaap-drift-check] Changed paths: ${files.length}`);
console.log(`[qaap-drift-check] Outside allowlist: ${violations.length}`);
console.log(`[qaap-drift-check] Baseline entries: ${baseline.size}`);
console.log(`[qaap-drift-check] New drift (not in baseline): ${newDrift.length}`);

if (violations.length && reportOnly) {
    console.error('\nDrift outside allowlist (baseline + new):\n');
    for (const f of violations.sort()) {
        console.error(`  ${f}`);
    }
}

if (newDrift.length) {
    console.error('\nNew unexpected drift (move to packages/qaap-* or add a documented seam):\n');
    for (const f of newDrift.sort()) {
        console.error(`  ${f}`);
    }
    console.error('\nAllowlist: scripts/qaap-drift-check.js ALLOWED');
    console.error('Baseline: scripts/qaap-drift-baseline.txt (remove paths after migration)');
    if (!reportOnly) {
        process.exit(1);
    }
} else if (!reportOnly) {
    console.log('[qaap-drift-check] OK — no new upstream drift outside allowlist.');
    if (resolvedBaseline.length) {
        console.log(`[qaap-drift-check] ${resolvedBaseline.length} baseline path(s) no longer differ — consider trimming qaap-drift-baseline.txt`);
    }
}
