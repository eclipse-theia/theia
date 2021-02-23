/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from '@theia/core/shared/inversify';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import {
    PrefixQuickOpenService, QuickOpenModel, QuickOpenItem, OpenerService,
    QuickOpenMode, KeybindingContribution, KeybindingRegistry, QuickOpenHandler, QuickOpenOptions, QuickOpenContribution, QuickOpenHandlerRegistry
} from '@theia/core/lib/browser';
import { CancellationTokenSource, CommandRegistry, CommandHandler, Command, SelectionService, CancellationToken } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { CommandContribution } from '@theia/core/lib/common';
import { Range, Position, SymbolInformation } from '@theia/core/shared/vscode-languageserver-types';
import { WorkspaceSymbolParams } from '@theia/core/shared/vscode-languageserver-protocol';
import { MonacoLanguages, WorkspaceSymbolProvider } from './monaco-languages';

@injectable()
export class WorkspaceSymbolCommand implements QuickOpenModel, CommandContribution, KeybindingContribution, CommandHandler, QuickOpenHandler, QuickOpenContribution {

    readonly prefix = '#';
    readonly description = 'Go to Symbol in Workspace';

    private command: Command = {
        id: 'languages.workspace.symbol',
        label: 'Go to Symbol in Workspace...'
    };

    @inject(MonacoLanguages) protected readonly languages: MonacoLanguages;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(PrefixQuickOpenService) protected quickOpenService: PrefixQuickOpenService;
    @inject(SelectionService) protected selectionService: SelectionService;

    isEnabled(): boolean {
        return this.languages.workspaceSymbolProviders !== undefined;
    }

    execute(): void {
        this.quickOpenService.open(this.prefix);
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return {
            fuzzyMatchLabel: true,
            showItemsWithoutHighlight: true,
            onClose: () => {
                this.cancellationSource.cancel();
            }
        };
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(this.command, this);
    }

    private isElectron(): boolean {
        return environment.electron.is();
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: this.command.id,
            keybinding: this.isElectron() ? 'ctrlcmd+t' : 'ctrlcmd+o',
        });
    }

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this);
    }

    private cancellationSource = new CancellationTokenSource();

    async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        if (this.languages.workspaceSymbolProviders) {
            this.cancellationSource.cancel();
            const newCancellationSource = new CancellationTokenSource();
            this.cancellationSource = newCancellationSource;

            const param: WorkspaceSymbolParams = {
                query: lookFor
            };

            const items: QuickOpenItem[] = [];

            const workspaceProviderPromises = [];
            for (const provider of this.languages.workspaceSymbolProviders) {
                workspaceProviderPromises.push((async () => {
                    const symbols = await provider.provideWorkspaceSymbols(param, newCancellationSource.token);
                    if (symbols && !newCancellationSource.token.isCancellationRequested) {
                        for (const symbol of symbols) {
                            items.push(this.createItem(symbol, provider, newCancellationSource.token));
                        }
                        acceptor(items);
                    }
                    return symbols;
                })());
            }
            Promise.all(workspaceProviderPromises.map(p => p.then(sym => sym, _ => undefined))).then(symbols => {
                const filteredSymbols = symbols.filter(el => el && el.length !== 0);
                if (filteredSymbols.length === 0) {
                    items.push(new QuickOpenItem({
                        label: lookFor.length === 0 ? 'Type to search for symbols' : 'No symbols matching',
                        run: () => false
                    }));
                    acceptor(items);
                }
            }).catch();
        }
    }

    protected createItem(sym: SymbolInformation, provider: WorkspaceSymbolProvider, token: CancellationToken): QuickOpenItem {
        const uri = new URI(sym.location.uri);
        const icon = this.toCssClassName(sym.kind) || 'unknown';
        let parent = sym.containerName;
        if (parent) {
            parent += ' - ';
        }
        parent = (parent || '') + uri.displayName;
        return new SimpleOpenItem(sym.name, icon, parent, uri.toString(), () => {

            if (provider.resolveWorkspaceSymbol) {
                provider.resolveWorkspaceSymbol(sym, token).then(resolvedSymbol => {
                    if (resolvedSymbol) {
                        this.openURL(uri, resolvedSymbol.location.range.start, resolvedSymbol.location.range.end);
                    } else {
                        // the symbol didn't resolve -> use given symbol
                        this.openURL(uri, sym.location.range.start, sym.location.range.end);
                    }
                });
            } else {
                // resolveWorkspaceSymbol wasn't specified
                this.openURL(uri, sym.location.range.start, sym.location.range.end);
            }
        });
    }

    protected toCssClassName(symbolKind: SymbolKind, inline?: boolean): string | undefined {
        const kind = SymbolKind[symbolKind];
        if (!kind) {
            return undefined;
        }
        return `codicon ${inline ? 'inline' : 'block'} codicon-symbol-${kind.toLowerCase() || 'property'}`;
    }

    private openURL(uri: URI, start: Position, end: Position): void {
        this.openerService.getOpener(uri).then(opener => opener.open(uri, {
            selection: Range.create(start, end)
        }));
    }
}

class SimpleOpenItem extends QuickOpenItem {

    constructor(
        protected readonly label: string,
        protected readonly icon: string,
        protected readonly parent: string,
        protected readonly toolTip: string,
        protected readonly onOpen: () => void,
        protected readonly onSelect?: () => void
    ) {
        super();
    }

    getLabel(): string {
        return this.label;
    }

    isHidden(): boolean {
        return false;
    }

    getTooltip(): string {
        return this.toolTip;
    }

    getDescription(): string {
        return this.parent;
    }

    getIconClass(): string {
        return this.icon;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            if (!this.onSelect) {
                return false;
            }
            this.onSelect();
            return true;
        }
        this.onOpen();
        return true;
    }
}

enum SymbolKind {
    File = 1,
    Module = 2,
    Namespace = 3,
    Package = 4,
    Class = 5,
    Method = 6,
    Property = 7,
    Field = 8,
    Constructor = 9,
    Enum = 10,
    Interface = 11,
    Function = 12,
    Variable = 13,
    Constant = 14,
    String = 15,
    Number = 16,
    Boolean = 17,
    Array = 18,
    Object = 19,
    Key = 20,
    Null = 21,
    EnumMember = 22,
    Struct = 23,
    Event = 24,
    Operator = 25,
    TypeParameter = 26
}
