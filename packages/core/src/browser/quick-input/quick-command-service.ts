/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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
import { Disposable, Command, CommandRegistry } from '../../common';
import { ContextKeyService } from '../context-key-service';
import { CorePreferences } from '../core-preferences';
import { QuickAccessContribution } from './quick-access-contribution';
import { QuickInputService } from './quick-input-service';

export const quickCommand: Command = {
    id: 'workbench.action.showCommands'
};

export const CLEAR_COMMAND_HISTORY: Command = {
    id: 'clear.command.history',
    label: 'Clear Command History'
};

@injectable()
export class QuickCommandService extends QuickInputService implements QuickAccessContribution {

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    // The list of exempted commands not to be displayed in the recently used list.
    readonly exemptedCommands: Command[] = [
        CLEAR_COMMAND_HISTORY,
    ];

    registerQuickAccessProvider(): void { }

    protected readonly contexts = new Map<string, string[]>();
    pushCommandContext(commandId: string, when: string): Disposable {
        const contexts = this.contexts.get(commandId) || [];
        contexts.push(when);
        this.contexts.set(commandId, contexts);
        return Disposable.create(() => {
            const index = contexts.indexOf(when);
            if (index !== -1) {
                contexts.splice(index, 1);
            }
        });
    }

    /**
     * Get the list of valid commands.
     *
     * @param commands the list of raw commands.
     * @returns the list of valid commands.
     */
    protected getValidCommands(raw: Command[]): Command[] {
        const valid: Command[] = [];
        raw.forEach(command => {
            if (command.label) {
                const contexts = this.contexts.get(command.id);
                if (!contexts || contexts.some(when => this.contextKeyService.match(when))) {
                    valid.push(command);
                }
            }
        });
        return valid;
    }

    /**
     * Get the list of recently used and other commands.
     *
     * @returns the list of recently used commands and other commands.
     */
    protected getCommands(): { recent: Command[], other: Command[] } {

        // Get the list of recent commands.
        const recentCommands = this.commandRegistry.recent;

        // Get the list of all valid commands.
        const allCommands = this.getValidCommands(this.commandRegistry.commands);

        // Get the max history limit.
        const limit = this.corePreferences['workbench.commandPalette.history'];

        // Build the list of recent commands.
        let rCommands: Command[] = [];
        if (limit > 0) {
            rCommands.push(...recentCommands.filter(r =>
                !this.exemptedCommands.some(c => Command.equals(r, c)) &&
                allCommands.some(c => Command.equals(r, c)))
            );
            if (rCommands.length > limit) {
                rCommands = rCommands.slice(0, limit);
            }
        }

        // Build the list of other commands.
        const oCommands = allCommands.filter(c => !rCommands.some(r => Command.equals(r, c)));

        // Normalize the list of recent commands.
        const recent = this.normalize(rCommands);

        // Normalize, and sort the list of other commands.
        const other = this.sort(
            this.normalize(oCommands)
        );

        return { recent, other };
    }

    /**
     * Normalizes a list of commands.
     * Normalization includes obtaining commands that have labels, are visible, and are enabled.
     *
     * @param commands the list of commands.
     * @returns the list of normalized commands.
     */
    private normalize(commands: Command[]): Command[] {
        return commands.filter((a: Command) => a.label && (this.commandRegistry.isVisible(a.id) && this.commandRegistry.isEnabled(a.id)));
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
}
