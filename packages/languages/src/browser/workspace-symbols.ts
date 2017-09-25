/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Languages } from '../common';
import { QuickOpenService, QuickOpenModel, QuickOpenItem, OpenerService, QuickOpenMode } from '@theia/core/lib/browser';
import { WorkspaceSymbolParams, SymbolInformation } from 'vscode-base-languageclient/lib/base';
import { CancellationTokenSource, CommandRegistry, CommandHandler, Command, SelectionService } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { CommandContribution, KeybindingContribution, KeybindingRegistry, TheiaKeyCodeUtils, Key, Modifier } from '@theia/core/lib/common';
import { Range } from 'vscode-languageserver-types';

@injectable()
export class WorkspaceSymbolCommand implements QuickOpenModel, CommandContribution, KeybindingContribution, CommandHandler {

    private command: Command = {
        id: 'languages.workspace.symbol',
        label: 'Open Workspace Symbol ...'
    };

    constructor( @inject(Languages) protected languages: Languages,
        @inject(OpenerService) protected readonly openerService: OpenerService,
        @inject(QuickOpenService) protected quickOpenService: QuickOpenService,
        @inject(SelectionService) protected selectionService: SelectionService) { }

    isEnabled() {
        return this.languages.workspaceSymbolProviders !== undefined;
    }

    execute() {
        this.quickOpenService.open(this, {
            placeholder: 'Type to search for symbols.',
            fuzzyMatchLabel: true
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(this.command, this);
    }

    registerDefaultKeyBindings(keybindings: KeybindingRegistry): void {
        keybindings.registerDefaultKeyBinding({
            commandId: this.command.id,
            keyCode: TheiaKeyCodeUtils.createKeyCode({ first: Key.KEY_O, modifiers: [Modifier.M1] }),
            accelerator: ['Accel O']
        });
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

            for (const provider of this.languages.workspaceSymbolProviders) {
                provider.provideWorkspaceSymbols(param, newCancellationSource.token).then(symbols => {
                    if (symbols && !newCancellationSource.token.isCancellationRequested) {
                        for (const symbol of symbols) {
                            items.push(this.createItem(symbol));
                        }
                        acceptor(items);
                    }
                });
            }
        }
    }

    protected createItem(sym: SymbolInformation): QuickOpenItem {
        const uri = new URI(sym.location.uri);
        const icon = SymbolKind[sym.kind].toLowerCase();
        let parent = sym.containerName;
        if (parent) {
            parent += ' - ';
        }
        parent = (parent || '') + uri.displayName;
        return new SimpleOpenItem(sym.name, icon, parent, uri.toString(), () => {
            this.openerService.getOpener(uri).then(opener => opener.open(uri, {
                revealIfVisible: true,
                selection: Range.create(sym.location.range.start, sym.location.range.start)
            }));
        });
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
    Array = 18
}
