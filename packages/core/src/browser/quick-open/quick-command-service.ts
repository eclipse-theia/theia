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

import { inject, injectable } from 'inversify';
import { Command, CommandRegistry } from '../../common';
import { Keybinding, KeybindingRegistry } from '../keybinding';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode, QuickOpenGroupItem, QuickOpenGroupItemOptions } from './quick-open-model';
import { QuickOpenOptions } from './quick-open-service';
import { QuickOpenContribution, QuickOpenHandlerRegistry, QuickOpenHandler } from './prefix-quick-open-service';
import { ContextKeyService } from '../context-key-service';
import { CLEAR_COMMAND_HISTORY } from './quick-command-contribution';
import { CorePreferences } from '../core-preferences';

@injectable()
export class QuickCommandService implements QuickOpenModel, QuickOpenHandler {

    private items: QuickOpenItem[];

    readonly prefix: string = '>';

    readonly description: string = 'Quick Command';

    // The list of exempted commands not to be displayed in the recently used list.
    readonly exemptedCommands: Command[] = [
        CLEAR_COMMAND_HISTORY,
    ];

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    protected readonly contexts = new Map<string, string[]>();
    pushCommandContext(commandId: string, when: string) {
        const contexts = this.contexts.get(commandId) || [];
        contexts.push(when);
        this.contexts.set(commandId, contexts);
    }

    /** Initialize this quick open model with the commands. */
    init(): void {
        // let's compute the items here to do it in the context of the currently activeElement
        this.items = [];
        const { recent, other } = this.getCommands();
        this.items.push(
            ...recent.map((command, index) =>
                new CommandQuickOpenItem(
                    command,
                    this.commands,
                    this.keybindings,
                    {
                        groupLabel: index === 0 ? 'recently used' : '',
                        showBorder: false,
                    }
                )
            ),
            ...other.map((command, index) =>
                new CommandQuickOpenItem(
                    command,
                    this.commands,
                    this.keybindings,
                    {
                        groupLabel: recent.length <= 0 ? '' : index === 0 ? 'other commands' : '',
                        showBorder: recent.length <= 0 ? false : index === 0 ? true : false,
                    }
                )
            ),
        );
    }

    public onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return { fuzzyMatchLabel: true };
    }

    /**
     * Get the list of recently used and other commands.
     *
     * @returns the list of recently used commands and other commands.
     */
    private getCommands(): { recent: Command[], other: Command[] } {

        // Get the list of recent commands.
        const recentCommands: Command[] = this.commands.recent;

        // Get the list of all valid commands.
        const allCommands: Command[] = this.getValidCommands(this.commands.commands);

        // Get the max history limit.
        const limit: number = this.corePreferences['workbench.commandPalette.history'];

        // Build the list of recent commands.
        const rCommands: Command[] = [];
        recentCommands.forEach((r: Command) => {
            // Opt out of displaying the recently used list.
            if (limit === 0) {
                return;
            }
            // Determine if the command is exempted from display.
            const exempted: boolean = this.exemptedCommands.some((c: Command) => Command.equals(r, c));
            // Determine if the command currently exists in the list of all available commands.
            const exists: boolean = allCommands.some((c: Command) => Command.equals(r, c));
            // Add the recently used item to the list.
            if (exists && !exempted && rCommands.length < limit) {
                rCommands.push(r);
            }
        });

        // Build the list of other commands.
        const oCommands: Command[] = [];
        allCommands.forEach((a: Command) => {
            const exists = rCommands.some((c: Command) => Command.equals(a, c));
            // If the command does not exist in the recently used list, add it to the other list.
            if (!exists) { oCommands.push(a); }
        });

        // Normalize the list of recent commands.
        const recent: Command[] = this.normalize(rCommands);

        // Normalize, and sort the list of other commands.
        const other: Command[] = this.sort(
            this.normalize(oCommands)
        );

        return { recent, other };
    }

    /**
     * Normalizes a list of commands.
     * Normalization includes obtaining commands that have labels and are visible.
     *
     * @param commands the list of commands.
     * @returns the list of normalized commands.
     */
    private normalize(commands: Command[]): Command[] {
        return commands.filter((a: Command) => a.label && this.commands.isVisible(a.id));
    }

    /**
     * Sorts a list of commands alphabetically.
     *
     * @param commands the list of commands.
     * @returns the list of sorted commands.
     */
    private sort(commands: Command[]): Command[] {
        return commands.sort((a: Command, b: Command) => Command.compareCommands(a, b));
    }

    /**
     * Get the list of valid commands.
     *
     * @param commands the list of raw commands.
     * @returns the list of valid commands.
     */
    private getValidCommands(raw: Command[]): Command[] {
        const valid: Command[] = [];
        raw.forEach((command: Command) => {
            if (command.label) {
                const contexts = this.contexts.get(command.id);
                if (!contexts || contexts.some(when => this.contextKeyService.match(when))) {
                    valid.push(command);
                }
            }
        });
        return valid;
    }

}

export class CommandQuickOpenItem extends QuickOpenGroupItem {

    private activeElement: HTMLElement;
    private hidden: boolean;

    constructor(
        protected readonly command: Command,
        protected readonly commands: CommandRegistry,
        protected readonly keybindings: KeybindingRegistry,
        protected readonly commandOptions?: QuickOpenGroupItemOptions,
    ) {
        super(commandOptions);
        this.activeElement = window.document.activeElement as HTMLElement;
        this.hidden = !this.commands.getActiveHandler(this.command.id);
    }

    getLabel(): string {
        return (this.command.category)
            ? `${this.command.category}: ` + this.command.label!
            : this.command.label!;
    }

    isHidden(): boolean {
        return this.hidden;
    }

    getIconClass() {
        const toggleHandler = this.commands.getToggledHandler(this.command.id);
        if (toggleHandler && toggleHandler.isToggled && toggleHandler.isToggled()) {
            return 'fa fa-check';
        }
        return super.getIconClass();
    }

    getKeybinding(): Keybinding | undefined {
        const bindings = this.keybindings.getKeybindingsForCommand(this.command.id);
        return bindings ? bindings[0] : undefined;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        // allow the quick open widget to close itself
        setTimeout(() => {
            // reset focus on the previously active element.
            this.activeElement.focus();
            this.commands.executeCommand(this.command.id);
        }, 50);
        return true;
    }
}

@injectable()
export class CommandQuickOpenContribution implements QuickOpenContribution {

    @inject(QuickCommandService)
    protected readonly commandQuickOpenHandler: QuickCommandService;

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this.commandQuickOpenHandler);
    }
}
