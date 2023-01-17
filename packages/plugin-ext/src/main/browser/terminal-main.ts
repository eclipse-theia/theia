// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { ApplicationShell, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { TerminalEditorLocationOptions, TerminalOptions } from '@theia/plugin';
import { TerminalLocation, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalServiceMain, TerminalServiceExt, MAIN_RPC_CONTEXT } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { SerializableEnvironmentVariableCollection } from '@theia/terminal/lib/common/base-terminal-protocol';
import { ShellTerminalServerProxy } from '@theia/terminal/lib/common/shell-terminal-protocol';
import { TerminalLink, TerminalLinkProvider } from '@theia/terminal/lib/browser/terminal-link-provider';
import { URI } from '@theia/core/lib/common/uri';
import { getIconClass } from '../../plugin/terminal-ext';
import { PluginTerminalRegistry } from './plugin-terminal-registry';
import { CancellationToken } from '@theia/core';
import { HostedPluginSupport } from '../../hosted/browser/hosted-plugin';

/**
 * Plugin api service allows working with terminal emulator.
 */
export class TerminalServiceMainImpl implements TerminalServiceMain, TerminalLinkProvider, Disposable {

    private readonly terminals: TerminalService;
    private readonly pluginTerminalRegistry: PluginTerminalRegistry;
    private readonly hostedPluginSupport: HostedPluginSupport;
    private readonly shell: ApplicationShell;
    private readonly extProxy: TerminalServiceExt;
    private readonly shellTerminalServer: ShellTerminalServerProxy;
    private readonly terminalLinkProviders: string[] = [];

    private readonly toDispose = new DisposableCollection();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.terminals = container.get(TerminalService);
        this.pluginTerminalRegistry = container.get(PluginTerminalRegistry);
        this.hostedPluginSupport = container.get(HostedPluginSupport);
        this.shell = container.get(ApplicationShell);
        this.shellTerminalServer = container.get(ShellTerminalServerProxy);
        this.extProxy = rpc.getProxy(MAIN_RPC_CONTEXT.TERMINAL_EXT);
        this.toDispose.push(this.terminals.onDidCreateTerminal(terminal => this.trackTerminal(terminal)));
        for (const terminal of this.terminals.all) {
            this.trackTerminal(terminal);
        }
        this.toDispose.push(this.terminals.onDidChangeCurrentTerminal(() => this.updateCurrentTerminal()));
        this.updateCurrentTerminal();
        if (this.shellTerminalServer.collections.size > 0) {
            const collectionAsArray = [...this.shellTerminalServer.collections.entries()];
            const serializedCollections: [string, SerializableEnvironmentVariableCollection][] = collectionAsArray.map(e => [e[0], [...e[1].map.entries()]]);
            this.extProxy.$initEnvironmentVariableCollections(serializedCollections);
        }

        this.pluginTerminalRegistry.startCallback = id => this.startProfile(id);

        container.bind(TerminalLinkProvider).toDynamicValue(() => this);
    }

    async startProfile(id: string): Promise<string> {
        await this.hostedPluginSupport.activateByTerminalProfile(id);
        return this.extProxy.$startProfile(id, CancellationToken.None);
    }

    $setEnvironmentVariableCollection(extensionIdentifier: string, persistent: boolean, collection: SerializableEnvironmentVariableCollection | undefined): void {
        if (collection) {
            this.shellTerminalServer.setCollection(extensionIdentifier, persistent, collection);
        } else {
            this.shellTerminalServer.deleteCollection(extensionIdentifier);
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected updateCurrentTerminal(): void {
        const { currentTerminal } = this.terminals;
        this.extProxy.$currentTerminalChanged(currentTerminal && currentTerminal.id);
    }

    protected async trackTerminal(terminal: TerminalWidget): Promise<void> {
        let name = terminal.title.label;
        this.extProxy.$terminalCreated(terminal.id, name);
        const updateTitle = () => {
            if (name !== terminal.title.label) {
                name = terminal.title.label;
                this.extProxy.$terminalNameChanged(terminal.id, name);
            }
        };
        terminal.title.changed.connect(updateTitle);
        this.toDispose.push(Disposable.create(() => terminal.title.changed.disconnect(updateTitle)));

        const updateProcessId = () => terminal.processId.then(
            processId => this.extProxy.$terminalOpened(terminal.id, processId, terminal.terminalId, terminal.dimensions.cols, terminal.dimensions.rows),
            () => {/* no-op */ }
        );
        updateProcessId();
        this.toDispose.push(terminal.onDidOpen(() => updateProcessId()));
        this.toDispose.push(terminal.onTerminalDidClose(term => this.extProxy.$terminalClosed(term.id, term.exitStatus)));
        this.toDispose.push(terminal.onSizeChanged(({ cols, rows }) => {
            this.extProxy.$terminalSizeChanged(terminal.id, cols, rows);
        }));
        this.toDispose.push(terminal.onData(data => {
            this.extProxy.$terminalOnInput(terminal.id, data);
            this.extProxy.$terminalStateChanged(terminal.id);
        }));
    }

    $write(id: string, data: string): void {
        const terminal = this.terminals.getById(id);
        if (!terminal) {
            return;
        }
        terminal.write(data);
    }

    $resize(id: string, cols: number, rows: number): void {
        const terminal = this.terminals.getById(id);
        if (!terminal) {
            return;
        }
        terminal.resize(cols, rows);
    }

    async $createTerminal(id: string, options: TerminalOptions, parentId?: string, isPseudoTerminal?: boolean): Promise<string> {
        const terminal = await this.terminals.newTerminal({
            id,
            title: options.name,
            iconClass: getIconClass(options),
            shellPath: options.shellPath,
            shellArgs: options.shellArgs,
            cwd: options.cwd ? new URI(options.cwd) : undefined,
            env: options.env,
            strictEnv: options.strictEnv,
            destroyTermOnClose: true,
            useServerTitle: false,
            attributes: options.attributes,
            hideFromUser: options.hideFromUser,
            location: this.getTerminalLocation(options, parentId),
            isPseudoTerminal,
            isTransient: options.isTransient
        });
        if (options.message) {
            terminal.writeLine(options.message);
        }
        terminal.start();
        return terminal.id;
    }

    protected getTerminalLocation(options: TerminalOptions, parentId?: string): TerminalLocation | TerminalEditorLocationOptions | { parentTerminal: string; } | undefined {
        if (typeof options.location === 'number' && Object.values(TerminalLocation).includes(options.location)) {
            return options.location;
        } else if (options.location && typeof options.location === 'object') {
            if ('parentTerminal' in options.location) {
                if (!parentId) {
                    throw new Error('parentTerminal is set but no parentId is provided');
                }
                return { 'parentTerminal': parentId };
            } else {
                return options.location;
            }
        }

        return undefined;
    }

    $sendText(id: string, text: string, addNewLine?: boolean): void {
        const terminal = this.terminals.getById(id);
        if (terminal) {
            text = text.replace(/\r?\n/g, '\r');
            if (addNewLine && text.charAt(text.length - 1) !== '\r') {
                text += '\r';
            }
            terminal.sendText(text);
        }
    }

    $show(id: string, preserveFocus?: boolean): void {
        const terminal = this.terminals.getById(id);
        if (terminal) {
            const options: WidgetOpenerOptions = {};
            if (preserveFocus) {
                options.mode = 'reveal';
            }
            this.terminals.open(terminal, options);
        }
    }

    $hide(id: string): void {
        const terminal = this.terminals.getById(id);
        if (terminal && terminal.isVisible) {
            const area = this.shell.getAreaFor(terminal);
            if (area) {
                this.shell.collapsePanel(area);
            }
        }
    }

    $dispose(id: string): void {
        const terminal = this.terminals.getById(id);
        if (terminal) {
            terminal.dispose();
        }
    }

    $setName(id: string, name: string): void {
        this.terminals.getById(id)?.setTitle(name);
    }

    $sendTextByTerminalId(id: number, text: string, addNewLine?: boolean): void {
        const terminal = this.terminals.getByTerminalId(id);
        if (terminal) {
            text = text.replace(/\r?\n/g, '\r');
            if (addNewLine && text.charAt(text.length - 1) !== '\r') {
                text += '\r';
            }
            terminal.sendText(text);
        }
    }
    $writeByTerminalId(id: number, data: string): void {
        const terminal = this.terminals.getByTerminalId(id);
        if (!terminal) {
            return;
        }
        terminal.write(data);
    }
    $resizeByTerminalId(id: number, cols: number, rows: number): void {
        const terminal = this.terminals.getByTerminalId(id);
        if (!terminal) {
            return;
        }
        terminal.resize(cols, rows);
    }
    $showByTerminalId(id: number, preserveFocus?: boolean): void {
        const terminal = this.terminals.getByTerminalId(id);
        if (terminal) {
            const options: WidgetOpenerOptions = {};
            if (preserveFocus) {
                options.mode = 'reveal';
            }
            this.terminals.open(terminal, options);
        }
    }
    $hideByTerminalId(id: number): void {
        const terminal = this.terminals.getByTerminalId(id);
        if (terminal && terminal.isVisible) {
            const area = this.shell.getAreaFor(terminal);
            if (area) {
                this.shell.collapsePanel(area);
            }
        }
    }
    $disposeByTerminalId(id: number, waitOnExit?: boolean | string): void {
        const terminal = this.terminals.getByTerminalId(id);
        if (terminal) {
            if (waitOnExit) {
                terminal.waitOnExit(waitOnExit);
                return;
            }
            terminal.dispose();
        }
    }

    $setNameByTerminalId(id: number, name: string): void {
        this.terminals.getByTerminalId(id)?.setTitle(name);
    }

    async $registerTerminalLinkProvider(providerId: string): Promise<void> {
        this.terminalLinkProviders.push(providerId);
    }

    async $unregisterTerminalLinkProvider(providerId: string): Promise<void> {
        const index = this.terminalLinkProviders.indexOf(providerId);
        if (index > -1) {
            this.terminalLinkProviders.splice(index, 1);
        }
    }

    async provideLinks(line: string, terminal: TerminalWidget, cancellationToken?: CancellationToken | undefined): Promise<TerminalLink[]> {
        if (this.terminalLinkProviders.length < 1) {
            return [];
        }
        const links = await this.extProxy.$provideTerminalLinks(line, terminal.id, cancellationToken ?? CancellationToken.None);
        return links.map(link => ({ ...link, handle: () => this.extProxy.$handleTerminalLink(link) }));
    }

}
