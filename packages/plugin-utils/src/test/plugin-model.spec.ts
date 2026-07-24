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

import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    UNPUBLISHED,
    VSCODE_EXTENSION_ACTIVATE,
    VSCODE_EXTENSION_DEACTIVATE,
    VSCODE_FRONTEND_INIT,
    THEIA_PLUGIN_START_METHOD,
    THEIA_PLUGIN_STOP_METHOD
} from '../constants';
import {
    applyTrustExtraction,
    buildEntryPointForTheia,
    buildEntryPointForVsCode,
    buildLifecycle,
    buildModel,
    buildModelForTheia,
    buildModelForVsCode,
    getPluginId,
    pickEngineType,
    toPluginUrl
} from '../plugin-model';
import { getPluginRootFileUrl } from '../node/plugin-model';
import { manifest } from './test-helpers';

describe('plugin-model', () => {

    describe('getPluginId', () => {
        it('sanitizes publisher and name', () => {
            expect(getPluginId({ publisher: 'dbaeumer', name: 'vscode-eslint' })).to.equal('dbaeumer_vscode_eslint');
        });

        it('uses unpublished publisher when publisher is missing', () => {
            expect(getPluginId({ name: 'my-ext' })).to.equal(getPluginId({ publisher: UNPUBLISHED, name: 'my-ext' }));
        });
    });

    describe('toPluginUrl', () => {
        it('encodes each path segment and keeps separators for static hosting', () => {
            const url = toPluginUrl({ publisher: 'vscode', name: 'theme-monokai' }, './themes/monokai-color-theme.json');
            expect(url).to.equal('hostedPlugin/vscode_theme_monokai/themes/monokai-color-theme.json');
        });

        it('encodes special characters inside a segment', () => {
            expect(toPluginUrl({ publisher: 'acme', name: 'ext' }, 'media/my icon.png'))
                .to.equal('hostedPlugin/acme_ext/media/my%20icon.png');
            expect(toPluginUrl({ publisher: 'acme', name: 'ext' }, '$(folder)'))
                .to.equal('hostedPlugin/acme_ext/%24(folder)');
        });

        it('resolves .. within the plugin root and ignores leading ..', () => {
            expect(toPluginUrl({ publisher: 'acme', name: 'ext' }, 'themes/../icons/a.png'))
                .to.equal('hostedPlugin/acme_ext/icons/a.png');
            expect(toPluginUrl({ publisher: 'acme', name: 'ext' }, '../secret.json'))
                .to.equal('hostedPlugin/acme_ext/secret.json');
        });
    });

    describe('pickEngineType', () => {
        it('prefers theiaPlugin over vscode when both are declared', () => {
            expect(pickEngineType(manifest({
                name: 'both-engines',
                engines: { vscode: '^1.0.0', theiaPlugin: '*' }
            }))).to.equal('theiaPlugin');
        });

        it('returns vscode when only vscode engine is declared', () => {
            expect(pickEngineType(manifest({
                name: 'vscode-only',
                engines: { vscode: '^1.0.0' }
            }))).to.equal('vscode');
        });

        it('throws when no supported engine is declared', () => {
            expect(() => pickEngineType(manifest({ name: 'no-engine' }))).to.throw(/No vscode or theiaPlugin engine/);
        });
    });

    describe('applyTrustExtraction', () => {
        it('copies untrusted workspace support when declared', () => {
            const result: { untrustedWorkspacesSupport?: boolean | 'limited' } = {};
            applyTrustExtraction(manifest({
                name: 'trusted',
                capabilities: { untrustedWorkspaces: { supported: 'limited' } }
            }), result);
            expect(result.untrustedWorkspacesSupport).to.equal('limited');
        });

        it('leaves result unchanged when capabilities are absent', () => {
            const result: { untrustedWorkspacesSupport?: boolean | 'limited' } = {};
            applyTrustExtraction(manifest({ name: 'plain' }), result);
            expect(result.untrustedWorkspacesSupport).to.equal(undefined);
        });
    });

    describe('getPluginRootFileUrl', () => {
        let tmpDir: string;

        before(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-utils-root-'));
            fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Readme');
        });

        after(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('finds readme files case-insensitively', () => {
            const url = getPluginRootFileUrl(manifest({ name: 'docs', packagePath: tmpDir }), ['readme.md']);
            expect(url).to.equal('hostedPlugin/acme_docs/README.md');
        });

        it('returns undefined when directory is missing', () => {
            expect(getPluginRootFileUrl(manifest({ name: 'missing', packagePath: '/no/such/path' }), ['readme.md'])).to.equal(undefined);
        });
    });

    describe('buildEntryPointForTheia', () => {
        it('maps theiaPlugin entry points and headless script', () => {
            const entryPoint = buildEntryPointForTheia(manifest({
                name: 'theia-ext',
                theiaPlugin: {
                    frontend: './lib/browser/main.js',
                    backend: './lib/node/main.js',
                    headless: './lib/headless.js'
                }
            }));
            expect(entryPoint).to.deep.equal({
                frontend: './lib/browser/main.js',
                backend: './lib/node/main.js',
                headless: './lib/headless.js'
            });
        });
    });

    describe('buildEntryPointForVsCode', () => {
        it('prefers browser entry for ui-only extensions in web mode', () => {
            const entryPoint = buildEntryPointForVsCode(manifest({
                name: 'ui-extension',
                browser: './dist/browser/extension.js',
                main: './dist/node/extension.js',
                extensionKind: ['ui']
            }), { uiKind: 'web' });
            expect(entryPoint.frontend).to.equal('./dist/browser/extension.js');
            expect(entryPoint.backend).to.equal(undefined);
        });

        it('uses main as backend when browser is absent', () => {
            const entryPoint = buildEntryPointForVsCode(manifest({
                name: 'workspace-extension',
                main: './dist/node/extension.js'
            }), { uiKind: 'web' });
            expect(entryPoint.backend).to.equal('./dist/node/extension.js');
            expect(entryPoint.frontend).to.equal(undefined);
        });

        it('prefers backend when both main and browser exist without ui-only web hint', () => {
            const entryPoint = buildEntryPointForVsCode(manifest({
                name: 'hybrid',
                browser: './dist/browser/extension.js',
                main: './dist/node/extension.js',
                extensionKind: ['workspace', 'ui']
            }), { uiKind: 'web' });
            expect(entryPoint.backend).to.equal('./dist/node/extension.js');
            expect(entryPoint.frontend).to.equal(undefined);
        });

        it('forwards headless script from theiaPlugin section', () => {
            const entryPoint = buildEntryPointForVsCode(manifest({
                name: 'headless',
                main: './main.js',
                theiaPlugin: { headless: './headless.js' }
            }));
            expect(entryPoint.headless).to.equal('./headless.js');
        });
    });

    describe('buildModel', () => {
        it('builds theia plugin model with defaults', () => {
            const model = buildModelForTheia(manifest({
                name: 'Sample',
                publisher: 'Acme',
                packageUri: 'hostedPlugin/acme_Sample/'
            }));
            expect(model.id).to.equal('acme.sample');
            expect(model.engine).to.deep.equal({ type: 'theiaPlugin', version: '*' });
            expect(model.displayName).to.equal('Test Extension');
            expect(model.packageUri).to.equal('hostedPlugin/acme_Sample/');
        });

        it('builds vscode model with icon url and web entry point', () => {
            const model = buildModelForVsCode(manifest({
                name: 'icon-ext',
                icon: './media/icon.png',
                browser: './browser.js',
                extensionKind: ['ui'],
                engines: { vscode: '^1.90.0' }
            }), { uiKind: 'web' });
            expect(model.engine).to.deep.equal({ type: 'vscode', version: '^1.90.0' });
            expect(model.iconUrl).to.equal('hostedPlugin/acme_icon_ext/media/icon.png');
            expect(model.entryPoint.frontend).to.equal('./browser.js');
        });

        it('uses UNPUBLISHED publisher and displayName fallback', () => {
            const model = buildModel(manifest({ name: 'anon', publisher: undefined, displayName: undefined }), 'vscode');
            expect(model.publisher).to.equal(UNPUBLISHED);
            expect(model.displayName).to.equal('anon');
        });
    });

    describe('buildLifecycle', () => {
        it('uses theia start/stop for theiaPlugin engine', () => {
            const lifecycle = buildLifecycle(manifest({ name: 'theia', publisher: 'acme' }), 'theiaPlugin');
            expect(lifecycle.startMethod).to.equal(THEIA_PLUGIN_START_METHOD);
            expect(lifecycle.stopMethod).to.equal(THEIA_PLUGIN_STOP_METHOD);
            expect(lifecycle.frontendModuleName).to.equal('acme_theia');
            expect(lifecycle.frontendInitPath).to.equal(undefined);
        });

        it('uses vscode activate/deactivate lifecycle', () => {
            const lifecycle = buildLifecycle(manifest({ name: 'sample', publisher: 'acme' }), 'vscode');
            expect(lifecycle.startMethod).to.equal(VSCODE_EXTENSION_ACTIVATE);
            expect(lifecycle.stopMethod).to.equal(VSCODE_EXTENSION_DEACTIVATE);
            expect(lifecycle.frontendInitPath).to.equal(VSCODE_FRONTEND_INIT);
            expect(lifecycle.frontendModuleName).to.equal('acme_sample');
        });
    });
});
