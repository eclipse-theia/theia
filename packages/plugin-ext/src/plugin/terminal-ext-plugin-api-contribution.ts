// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import type * as theia from '@theia/plugin';
import { inject, injectable, interfaces } from '@theia/core/shared/inversify';
import { Event } from '@theia/core/lib/common/event';
import { RPCProtocol } from '../common/rpc-protocol';
import { InternalPluginApiContribution } from '../common/plugin-ext-api-contribution';
import { MAIN_RPC_CONTEXT, Plugin } from '../common/plugin-api-rpc';
import { TerminalServiceExtImpl } from './terminal-ext';
import { createAPIObject } from './plugin-context';
import {
    Disposable,
    TerminalLink,
    TerminalLocation,
    TerminalExitReason,
    TerminalProfile,
    TerminalEditorTabInput,
    TerminalOutputAnchor,
    TerminalQuickFixTerminalCommand,
    TerminalQuickFixOpener,
    TerminalShellExecutionCommandLineConfidence,
    TerminalCompletionItem,
    TerminalCompletionItemKind,
    TerminalCompletionList,
} from './types-impl';

/**
 * The shape of the terminal contribution to the plugin API namespace.
 *
 * This type defines exactly what properties `TerminalExtPluginApiContribution`
 * adds to the `typeof theia` object. The assembler uses `DeepMerge` to combine
 * this with other contributions' types and verify the result against `typeof theia`.
 */
export interface TerminalPluginApiNamespace {
    window: {
        readonly activeTerminal: theia.Terminal | undefined;
        readonly terminals: readonly theia.Terminal[];
        onDidChangeActiveTerminal: typeof theia.window.onDidChangeActiveTerminal;
        onDidChangeTerminalState: typeof theia.window.onDidChangeTerminalState;
        onDidCloseTerminal: typeof theia.window.onDidCloseTerminal;
        onDidOpenTerminal: typeof theia.window.onDidOpenTerminal;
        createTerminal: typeof theia.window.createTerminal;
        registerTerminalLinkProvider: typeof theia.window.registerTerminalLinkProvider;
        registerTerminalProfileProvider: typeof theia.window.registerTerminalProfileProvider;
        registerTerminalCompletionProvider: typeof theia.window.registerTerminalCompletionProvider;
        registerTerminalQuickFixProvider: typeof theia.window.registerTerminalQuickFixProvider;
        registerTerminalObserver: typeof theia.window.registerTerminalObserver;
        onDidChangeTerminalShellIntegration: typeof theia.window.onDidChangeTerminalShellIntegration;
        onDidEndTerminalShellExecution: typeof theia.window.onDidEndTerminalShellExecution;
        onDidStartTerminalShellExecution: typeof theia.window.onDidStartTerminalShellExecution;
    };
    TerminalLink: typeof TerminalLink;
    TerminalProfile: typeof TerminalProfile;
    TabInputTerminal: typeof TerminalEditorTabInput;
    TerminalLocation: typeof TerminalLocation;
    TerminalOutputAnchor: typeof TerminalOutputAnchor;
    TerminalExitReason: typeof TerminalExitReason;
    TerminalQuickFixTerminalCommand: typeof TerminalQuickFixTerminalCommand;
    TerminalQuickFixOpener: typeof TerminalQuickFixOpener;
    TerminalShellExecutionCommandLineConfidence: typeof TerminalShellExecutionCommandLineConfidence;
    TerminalCompletionItem: typeof TerminalCompletionItem;
    TerminalCompletionItemKind: typeof TerminalCompletionItemKind;
    TerminalCompletionList: typeof TerminalCompletionList;
}

/**
 * Terminal contribution to the ext-side plugin API.
 *
 * This is the first feature extracted from the monolithic `createAPIFactory`.
 * It handles:
 * - Registering `TerminalServiceExtImpl` on the RPC protocol
 * - Providing terminal-related `window.*` properties
 * - Providing terminal-related type exports for the `typeof theia` namespace
 */
@injectable()
export class TerminalExtPluginApiContribution implements InternalPluginApiContribution {

    @inject(TerminalServiceExtImpl)
    protected readonly terminalExt: TerminalServiceExtImpl;

    registerMainImplementations(_rpc: RPCProtocol, _container: interfaces.Container): void {
        // Main-side terminal registration is handled separately by LegacyMainPluginApiContribution.
    }

    registerExtImplementations(rpc: RPCProtocol): void {
        rpc.set(MAIN_RPC_CONTEXT.TERMINAL_EXT, this.terminalExt);
    }

    createApiNamespace(plugin: Plugin): TerminalPluginApiNamespace {
        const terminalExt = this.terminalExt;
        const { onDidChangeActiveTerminal, onDidChangeTerminalState, onDidCloseTerminal, onDidOpenTerminal } = terminalExt;

        return {
            // Terminal window.* properties — deep-merged into the `window` namespace
            // by the assembler via deepMergeApiNamespaces
            window: {
                get activeTerminal(): theia.Terminal | undefined {
                    return terminalExt.activeTerminal;
                },
                get terminals(): theia.Terminal[] {
                    return terminalExt.terminals;
                },
                onDidChangeActiveTerminal,
                onDidChangeTerminalState,
                onDidCloseTerminal,
                onDidOpenTerminal,
                createTerminal(nameOrOptions: theia.TerminalOptions | theia.ExtensionTerminalOptions | (string | undefined),
                    shellPath?: string,
                    shellArgs?: string[] | string): theia.Terminal {
                    return terminalExt.createTerminal(plugin, nameOrOptions, shellPath, shellArgs, createAPIObject);
                },
                registerTerminalLinkProvider(provider: theia.TerminalLinkProvider): theia.Disposable {
                    return terminalExt.registerTerminalLinkProvider(provider);
                },
                registerTerminalProfileProvider(id: string, provider: theia.TerminalProfileProvider): theia.Disposable {
                    return terminalExt.registerTerminalProfileProvider(id, provider);
                },
                /** @stubbed TerminalCompletionProvider */
                registerTerminalCompletionProvider<T extends theia.TerminalCompletionItem>(
                    _provider: theia.TerminalCompletionProvider<T>, ..._triggerCharacters: string[]): theia.Disposable {
                    return Disposable.NULL;
                },
                /** @stubbed TerminalQuickFixProvider */
                registerTerminalQuickFixProvider(id: string, provider: theia.TerminalQuickFixProvider): theia.Disposable {
                    return terminalExt.registerTerminalQuickFixProvider(id, provider);
                },
                /** Theia-specific TerminalObserver */
                registerTerminalObserver(observer: theia.TerminalObserver): theia.Disposable {
                    return terminalExt.registerTerminalObserver(observer);
                },
                /** @stubbed Terminal Shell Integration */
                onDidChangeTerminalShellIntegration: Event.None,
                /** @stubbed Terminal Shell Integration */
                onDidEndTerminalShellExecution: Event.None,
                /** @stubbed Terminal Shell Integration */
                onDidStartTerminalShellExecution: Event.None,
            },

            // Terminal type exports
            TerminalLink,
            TerminalProfile,
            TabInputTerminal: TerminalEditorTabInput,
            TerminalLocation,
            TerminalOutputAnchor,
            TerminalExitReason,
            TerminalQuickFixTerminalCommand,
            TerminalQuickFixOpener,
            TerminalShellExecutionCommandLineConfidence,
            TerminalCompletionItem,
            TerminalCompletionItemKind,
            TerminalCompletionList,
        };
    }
}
