/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    QuickOpenModel, QuickOpenGroupItem, QuickOpenHandler,
    QuickOpenOptions, QuickOpenItemOptions, QuickOpenMode,
    PrefixQuickOpenService,
    QuickOpenContribution, QuickOpenHandlerRegistry, QuickOpenGroupItemOptions
} from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry, CommandService } from '@theia/core/lib/common';
import { TerminalWidget } from './base/terminal-widget';
import { TerminalService } from './base/terminal-service';
import { TerminalCommands } from './terminal-frontend-contribution';

@injectable()
export class TerminalQuickOpenService implements QuickOpenModel, QuickOpenHandler {

    @inject(PrefixQuickOpenService)
    protected readonly prefixQuickOpenService: PrefixQuickOpenService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    readonly prefix: string = 'term ';

    get description(): string {
        return 'Show All Opened Terminals';
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return {
            fuzzyMatchLabel: {
                enableSeparateSubstringMatching: true
            },
            fuzzyMatchDescription: {
                enableSeparateSubstringMatching: true
            }
        };
    }

    open(): void {
        this.prefixQuickOpenService.open(this.prefix);
    }

    async onType(lookFor: string, acceptor: (items: QuickOpenGroupItem[]) => void): Promise<void> {
        const terminalItems: QuickOpenGroupItem[] = [];

        // Get the sorted list of currently opened terminal widgets
        const widgets: TerminalWidget[] = this.terminalService.all
            .sort((a: TerminalWidget, b: TerminalWidget) => this.compareItems(a, b));

        for (const widget of widgets) {
            const item = await this.toItem(widget);
            terminalItems.push(item);
        }
        // Append a quick open item to create a new terminal.
        const createNewTerminalItem = new QuickOpenGroupItem<QuickOpenGroupItemOptions>({
            label: 'Open New Terminal',
            iconClass: 'fa fa-plus',
            run: this.doCreateNewTerminal(),
            groupLabel: undefined,
            showBorder: !!terminalItems.length
        });
        terminalItems.push(createNewTerminalItem);

        acceptor(terminalItems);
        return;
    }

    /**
     * Compare two terminal widgets by label. If labels are identical, compare by the widget id.
     * @param a `TerminalWidget` for comparison
     * @param b `TerminalWidget` for comparison
     */
    protected compareItems(a: TerminalWidget, b: TerminalWidget): number {
        const normalize = (str: string) => str.trim().toLowerCase();

        if (normalize(a.title.label) !== normalize(b.title.label)) {
            return normalize(a.title.label).localeCompare(normalize(b.title.label));
        } else {
            return normalize(a.id).localeCompare(normalize(b.id));
        }
    }

    /**
     * Get the function that can create a new terminal.
     * @param {TerminalWidget} widget - the terminal widget to be opened.
     * @returns Function that would create a new terminal if mode === QuickOpenMode.OPEN.
     */
    protected doCreateNewTerminal(): (mode: QuickOpenMode) => boolean {
        return (mode: QuickOpenMode) => {
            if (mode !== QuickOpenMode.OPEN) {
                return false;
            }
            this.commandService.executeCommand(TerminalCommands.NEW.id);
            return true;
        };
    }

    /**
     * Convert the terminal widget to the quick open item.
     * @param {TerminalWidget} widget - the terminal widget.
     * @returns The quick open group item.
     */
    protected async toItem(widget: TerminalWidget): Promise<QuickOpenGroupItem<QuickOpenItemOptions>> {
        const options: QuickOpenGroupItemOptions = {
            label: widget.title.label,
            description: widget.id,
            tooltip: widget.title.label,
            hidden: false,
            run: this.getRunFunction(widget),
            groupLabel: undefined,
            showBorder: false
        };
        return new QuickOpenGroupItem<QuickOpenGroupItemOptions>(options);
    }

    /**
     * Get the function that can open the editor file.
     * @param {TerminalWidget} widget - the terminal widget to be opened.
     * @returns Function that would open the terminal if mode === QuickOpenMode.OPEN.
     */
    protected getRunFunction(widget: TerminalWidget): (mode: QuickOpenMode) => boolean {
        return (mode: QuickOpenMode) => {
            if (mode !== QuickOpenMode.OPEN) {
                return false;
            }
            this.terminalService.open(widget);
            return true;
        };
    }
}

/**
 * TODO: merge it to TerminalFrontendContribution.
 */
@injectable()
export class TerminalQuickOpenContribution implements CommandContribution, QuickOpenContribution {

    @inject(TerminalQuickOpenService)
    protected readonly terminalQuickOpenService: TerminalQuickOpenService;

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this.terminalQuickOpenService);
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(TerminalCommands.SHOW_ALL_OPENED_TERMINALS, {
            execute: () => this.terminalQuickOpenService.open()
        });
    }
}
