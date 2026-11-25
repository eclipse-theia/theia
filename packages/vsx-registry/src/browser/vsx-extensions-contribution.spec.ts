// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
// xterm.js (pulled in transitively via plugin-ext from VSXExtensionsModel) calls
// HTMLCanvasElement.prototype.getContext at module-load time. JSDOM's default impl
// throws 'Not implemented' without the optional `canvas` package; replace it with a
// no-op so the module graph evaluates.
const canvasProto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext?: unknown } } }).HTMLCanvasElement?.prototype;
if (canvasProto) {
    canvasProto.getContext = () => undefined;
}
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { QuickPickItem } from '@theia/core/lib/browser';
import { Command, CommandHandler, CommandRegistry } from '@theia/core/lib/common/command';
import URI from '@theia/core/lib/common/uri';
import { VSXExtension } from './vsx-extension.js';
import { VSXExtensionsCommands } from './vsx-extension-commands.js';
import { VSXExtensionsContribution, VsixReplacement } from './vsx-extensions-contribution.js';

after(() => disableJSDOM());

/** Records the handler registered for each command id so registered predicates can be asserted. */
class RecordingCommandRegistry {
    readonly handlers = new Map<string, CommandHandler>();
    registerCommand(command: Command, handler?: CommandHandler): void {
        if (handler) {
            this.handlers.set(command.id, handler);
        }
    }
}

function registerHandler(): CommandHandler {
    const contribution = new VSXExtensionsContribution();
    const registry = new RecordingCommandRegistry();
    contribution.registerCommands(registry as unknown as CommandRegistry);
    const handler = registry.handlers.get(VSXExtensionsCommands.INSTALL_ANOTHER_VERSION.id);
    expect(handler, 'INSTALL_ANOTHER_VERSION should be registered').to.not.equal(undefined);
    return handler!;
}

describe('VSXExtensionsContribution: "Install Specific Version" enablement', () => {

    it('is enabled for an installed extension even without downloadUrl (regression for #17607)', () => {
        const handler = registerHandler();
        // An already installed extension after a restart has no registry data, so downloadUrl is undefined.
        const extension = { builtin: false, downloadUrl: undefined } as unknown as VSXExtension;
        expect(handler.isEnabled!(extension)).to.equal(true);
    });

    it('is disabled for built-in extensions', () => {
        const handler = registerHandler();
        const extension = { builtin: true, downloadUrl: 'http://example.com/ext.vsix' } as unknown as VSXExtension;
        expect(handler.isEnabled!(extension)).to.equal(false);
    });
});

describe('VSXExtensionsContribution: "Install Specific Version" with no available versions', () => {

    it('shows a "No other versions are available." item instead of an empty quick pick', async () => {
        const contribution = new VSXExtensionsContribution();
        let shownItems: QuickPickItem[] | undefined;
        Object.assign(contribution, {
            // The extension is not on the registry (e.g. VSIX or private install), so no versions are returned.
            vsxRegistryService: {
                query: async () => ({ extensions: [] }),
                findLatestCompatibleExtension: async () => undefined
            },
            applicationServer: { getApplicationPlatform: async () => 'linux-x64' },
            quickInput: {
                showQuickPick: async (items: QuickPickItem[]) => {
                    shownItems = items;
                    return undefined;
                }
            }
        });
        const extension = { id: 'foo.bar', version: '1.0.0', builtin: false } as unknown as VSXExtension;
        await (contribution as unknown as { installAnotherVersion(e: VSXExtension): Promise<void> }).installAnotherVersion(extension);
        expect(shownItems, 'a quick pick should be shown').to.not.equal(undefined);
        expect(shownItems!).to.have.lengthOf(1);
        expect(shownItems![0].label).to.equal('No other versions are available.');
    });
});

describe('VSXExtensionsContribution: installing a VSIX file', () => {

    const uri = new URI('file:///tmp/ext.vsix');
    const replacement: VsixReplacement = { id: 'foo.bar', installedVersion: '1.0.0', version: '2.0.0' };

    interface Scenario {
        installed?: string[];
        uninstalled?: string[];
        builtIns?: string[];
        identity?: { publisher: string, name: string, version: string };
        /** `false` for a VSIX file without a valid `package.json`. */
        readable?: boolean;
        install?: () => Promise<void>;
        confirm?: boolean;
        reloadChoice?: string;
    }

    const vsixIdentity = { publisher: 'foo', name: 'bar', version: '2.0.0' };

    async function run({ installed = [], uninstalled = [], builtIns = [], identity = vsixIdentity, readable = true, install, confirm, reloadChoice }: Scenario): Promise<{
        installs: unknown[][],
        confirmed: VsixReplacement[],
        infos: string[],
        errors: string[],
        reloads: number
    }> {
        const contribution = new VSXExtensionsContribution();
        const result = {
            installs: [] as unknown[][],
            confirmed: [] as VsixReplacement[],
            infos: [] as string[],
            errors: [] as string[],
            reloads: 0
        };
        Object.assign(contribution, {
            labelProvider: { getName: () => 'ext.vsix' },
            model: { isBuiltIn: (id: string) => builtIns.includes(id) },
            vsxRegistryService: { readVsixIdentity: async () => readable ? identity : undefined },
            pluginServer: {
                getInstalledPlugins: async () => installed,
                getUninstalledPlugins: async () => uninstalled
            },
            commandRegistry: {
                executeCommand: async (...args: unknown[]) => {
                    result.installs.push(args);
                    await install?.();
                }
            },
            messageService: {
                info: async (message: string) => {
                    result.infos.push(message);
                    return reloadChoice;
                },
                error: async (message: string) => {
                    result.errors.push(message);
                }
            },
            windowService: { reload: () => result.reloads++ },
            logger: { warn: () => { } },
            confirmReplaceExtension: async (r: VsixReplacement) => {
                result.confirmed.push(r);
                return confirm;
            }
        });
        await contribution['installVsixFile'](uri);
        return result;
    }

    it('installs with workbench.extensions.installExtension and no dialog if the extension is not installed', async () => {
        const result = await run({ installed: ['other.ext@1.0.0'] });
        expect(result.installs).to.deep.equal([['workbench.extensions.installExtension', uri]]);
        expect(result.confirmed).to.be.empty;
        expect(result.errors).to.be.empty;
        expect(result.infos).to.have.lengthOf(1);
        expect(result.reloads).to.equal(0);
    });

    for (const [title, installedVersion, version] of [['the same', '2.0.0', '2.0.0'], ['an older', '1.0.0', '2.0.0'], ['a newer', '3.0.0', '2.0.0']]) {
        it(`asks before it replaces ${title} version`, async () => {
            const result = await run({ installed: [`foo.bar@${installedVersion}`], identity: { publisher: 'foo', name: 'bar', version } });
            expect(result.confirmed).to.deep.equal([{ id: 'foo.bar', installedVersion, version }]);
        });
    }

    it('does not install or report a replacement for the same version as a built-in extension', async () => {
        const result = await run({ installed: ['foo.bar@2.0.0'], builtIns: ['foo.bar'], confirm: true });
        expect(result.confirmed).to.be.empty;
        expect(result.installs).to.be.empty;
        expect(result.errors).to.be.empty;
        expect(result.infos).to.have.lengthOf(1);
        expect(result.infos[0]).to.contain('foo.bar').and.to.contain('built in');
        expect(result.reloads).to.equal(0);
    });

    for (const [title, builtInVersion] of [['an older', '1.0.0'], ['a newer', '3.0.0']]) {
        it(`asks before it replaces ${title} built-in version`, async () => {
            const result = await run({ installed: [`foo.bar@${builtInVersion}`], builtIns: ['foo.bar'], confirm: true });
            expect(result.confirmed).to.deep.equal([{ id: 'foo.bar', installedVersion: builtInVersion, version: '2.0.0' }]);
            expect(result.installs).to.have.lengthOf(1);
        });
    }

    it('ignores a version that is uninstalled and waits for a restart', async () => {
        const result = await run({ installed: ['foo.bar@1.0.0'], uninstalled: ['foo.bar@1.0.0'] });
        expect(result.confirmed).to.be.empty;
        expect(result.installs).to.have.lengthOf(1);
    });

    it('installs without a dialog if it cannot read the identity of the VSIX file', async () => {
        const result = await run({ installed: ['foo.bar@1.0.0'], readable: false });
        expect(result.confirmed).to.be.empty;
        expect(result.installs).to.have.lengthOf(1);
    });

    it('does not install if the user cancels the dialog', async () => {
        const result = await run({ installed: ['foo.bar@1.0.0'], confirm: false });
        expect(result.confirmed).to.deep.equal([replacement]);
        expect(result.installs).to.be.empty;
        expect(result.infos).to.be.empty;
        expect(result.errors).to.be.empty;
    });

    it('does not install if the user closes the dialog', async () => {
        const result = await run({ installed: ['foo.bar@1.0.0'], confirm: undefined });
        expect(result.installs).to.be.empty;
        expect(result.errors).to.be.empty;
    });

    it('replaces the extension and offers a reload if the user confirms the dialog', async () => {
        const result = await run({ installed: ['foo.bar@1.0.0'], confirm: true, reloadChoice: 'Reload Window' });
        expect(result.installs).to.have.lengthOf(1);
        expect(result.infos).to.have.lengthOf(1);
        expect(result.infos[0]).to.contain('foo.bar').and.to.contain('2.0.0');
        expect(result.reloads).to.equal(1);
        expect(result.errors).to.be.empty;
    });

    it('does not reload if the user dismisses the reload message', async () => {
        const result = await run({ installed: ['foo.bar@1.0.0'], confirm: true });
        expect(result.reloads).to.equal(0);
    });

    it('shows an error if the replacement fails', async () => {
        const result = await run({ installed: ['foo.bar@1.0.0'], confirm: true, install: async () => { throw new Error('Deployment failed.'); } });
        expect(result.infos).to.be.empty;
        expect(result.errors).to.have.lengthOf(1);
    });

    it('shows an error if the install fails', async () => {
        const result = await run({ install: async () => { throw new Error('Deployment failed.'); } });
        expect(result.confirmed).to.be.empty;
        expect(result.errors).to.have.lengthOf(1);
    });
});
