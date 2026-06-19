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
import { Command, CommandHandler, CommandRegistry } from '@theia/core/lib/common/command';
import { VSXExtension } from './vsx-extension';
import { VSXExtensionsCommands } from './vsx-extension-commands';
import { VSXExtensionsContribution } from './vsx-extensions-contribution';

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
