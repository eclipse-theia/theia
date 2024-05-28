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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { ApplicationShell, WidgetOpenerOptions, codicon } from '@theia/core/lib/browser';
import { TerminalEditorLocationOptions } from '@theia/plugin';
import { TerminalLocation, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalProfileService } from '@theia/terminal/lib/browser/terminal-profile-service';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalServiceMain, TerminalServiceExt, MAIN_RPC_CONTEXT, TerminalOptions } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { SerializableEnvironmentVariableCollection, ShellTerminalServerProxy } from '@theia/terminal/lib/common/shell-terminal-protocol';
import { TerminalLink, TerminalLinkProvider } from '@theia/terminal/lib/browser/terminal-link-provider';
import { URI } from '@theia/core/lib/common/uri';
import { PluginTerminalRegistry } from './plugin-terminal-registry';
import { CancellationToken, isObject } from '@theia/core';
import { HostedPluginSupport } from '../../hosted/browser/hosted-plugin';
import { PluginSharedStyle } from './plugin-shared-style';
import { ThemeIcon } from '@theia/core/lib/common/theme';
import debounce = require('@theia/core/shared/lodash.debounce');

interface TerminalObserverData {
    nrOfLinesToMatch: number;
    outputMatcherRegex: RegExp
    disposables: DisposableCollection;
}

/**
 * Plugin api service allows working with terminal emulator.
 */
export class TerminalServiceMainImpl implements TerminalServiceMain, TerminalLinkProvider, Disposable {

    private readonly terminals: TerminalService;
    private readonly terminalProfileService: TerminalProfileService;
    private readonly pluginTerminalRegistry: PluginTerminalRegistry;
    private readonly hostedPluginSupport: HostedPluginSupport;
    private readonly shell: ApplicationShell;
    private readonly extProxy: TerminalServiceExt;
    private readonly sharedStyle: PluginSharedStyle;
    private readonly shellTerminalServer: ShellTerminalServerProxy;
    private readonly terminalLinkProviders: string[] = [];

    private readonly toDispose = new DisposableCollection();
    private readonly observers = new Map<string, TerminalObserverData>();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.terminals = container.get(TerminalService);
        this.terminalProfileService = container.get(TerminalProfileService);
        this.pluginTerminalRegistry = container.get(PluginTerminalRegistry);
        this.hostedPluginSupport = container.get(HostedPluginSupport);
        this.sharedStyle = container.get(PluginSharedStyle);
        this.shell = container.get(ApplicationShell);
        this.shellTerminalServer = container.get(ShellTerminalServerProxy);
        this.extProxy = rpc.getProxy(MAIN_RPC_CONTEXT.TERMINAL_EXT);
        this.toDispose.push(this.terminals.onDidCreateTerminal(terminal => this.trackTerminal(terminal)));
        for (const terminal of this.terminals.all) {
            this.trackTerminal(terminal);
        }
        this.toDispose.push(this.terminals.onDidChangeCurrentTerminal(() => this.updateCurrentTerminal()));
        this.updateCurrentTerminal();

        this.shellTerminalServer.getEnvVarCollections().then(collections => this.extProxy.$initEnvironmentVariableCollections(collections));

        this.pluginTerminalRegistry.startCallback = id => this.startProfile(id);

        container.bind(TerminalLinkProvider).toDynamicValue(() => this);

        this.toDispose.push(this.terminalProfileService.onDidChangeDefaultShell(shell => {
            this.extProxy.$setShell(shell);
        }));
    }

    async startProfile(id: string): Promise<string> {
        await this.hostedPluginSupport.activateByTerminalProfile(id);
        return this.extProxy.$startProfile(id, CancellationToken.None);
    }

    $setEnvironmentVariableCollection(persistent: boolean, extensionIdentifier: string, rootUri: string, collection: SerializableEnvironmentVariableCollection): void {
        if (collection) {
            this.shellTerminalServer.setCollection(extensionIdentifier, rootUri, persistent, collection, collection.description);
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

        this.observers.forEach((observer, id) => this.observeTerminal(id, terminal, observer));
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
            iconClass: this.toIconClass(options),
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

    $sendText(id: string, text: string, shouldExecute?: boolean): void {
        const terminal = this.terminals.getById(id);
        if (terminal) {
            text = text.replace(/\r?\n/g, '\r');
            if (shouldExecute && text.charAt(text.length - 1) !== '\r') {
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

    $registerTerminalObserver(id: string, nrOfLinesToMatch: number, outputMatcherRegex: string): void {
        const observerData = {
            nrOfLinesToMatch: nrOfLinesToMatch,
            outputMatcherRegex: new RegExp(outputMatcherRegex, 'm'),
            disposables: new DisposableCollection()
        };
        this.observers.set(id, observerData);
        this.terminals.all.forEach(terminal => {
            this.observeTerminal(id, terminal, observerData);
        });
    }

    protected observeTerminal(observerId: string, terminal: TerminalWidget, observerData: TerminalObserverData): void {
        const doMatch = debounce(() => {
            const lineCount = Math.min(observerData.nrOfLinesToMatch, terminal.buffer.length);
            const lines = terminal.buffer.getLines(terminal.buffer.length - lineCount, lineCount);
            const result = lines.join('\n').match(observerData.outputMatcherRegex);
            if (result) {
                this.extProxy.$reportOutputMatch(observerId, result.map(value => value));
            }
        });
        observerData.disposables.push(terminal.onOutput(output => {
            doMatch();
        }));
    }

    protected toIconClass(options: TerminalOptions): string | ThemeIcon | undefined {
        const iconColor = isObject<{ id: string }>(options.color) && typeof options.color.id === 'string' ? options.color.id : undefined;
        let iconClass: string;
        if (options.iconUrl) {
            if (typeof options.iconUrl === 'object' && 'id' in options.iconUrl) {
                iconClass = codicon(options.iconUrl.id);
            } else {
                const iconReference = this.sharedStyle.toIconClass(options.iconUrl);
                this.toDispose.push(iconReference);
                iconClass = iconReference.object.iconClass;
            }
        } else {
            iconClass = codicon('terminal');
        }
        return iconColor ? { id: iconClass, color: { id: iconColor } } : iconClass;
    }

    $unregisterTerminalObserver(id: string): void {
        const observer = this.observers.get(id);
        if (observer) {
            observer.disposables.dispose();
            this.observers.delete(id);
        } else {
            throw new Error(`Unregistering unknown terminal observer: ${id}`);
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
