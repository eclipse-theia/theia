// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MenuPath } from '@theia/core/lib/common';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ExtensionsSourceContribution } from './extensions-source-contribution';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';

/** Menu path of the anchored "Filter by Type" popup opened from the Extensions search bar. */
export const EXTENSIONS_FILTER_BY_TYPE_MENU: MenuPath = ['vsx-extensions-filter-by-type-context-menu'];

/** Command id prefix for the per-contribution-type toggle commands. */
const FILTER_COMMAND_PREFIX = 'vsxExtensions.filterByType:';

/**
 * Registers one toggle command + menu item per {@link ExtensionsSourceContribution} type so the
 * search bar can offer an anchored "Filter by Type" popup (rendered through the
 * {@link ContextMenuRenderer}) with a checkmark per kind of result (Extensions, MCP Servers,
 * Skills, ...). Toggling updates {@link VSXExtensionsSearchModel.enabledTypes}.
 */
@injectable()
export class VSXExtensionsFilterContribution implements CommandContribution, MenuContribution {

    @inject(ContributionProvider) @named(ExtensionsSourceContribution)
    protected readonly contributions: ContributionProvider<ExtensionsSourceContribution>;

    @inject(VSXExtensionsSearchModel)
    protected readonly searchModel: VSXExtensionsSearchModel;

    registerCommands(commands: CommandRegistry): void {
        for (const contribution of this.orderedContributions()) {
            const type = contribution.type;
            // No `label`: these commands exist only for the filter popup, and a labelless command
            // is excluded from the command palette. The menu action below carries the visible label.
            commands.registerCommand({ id: FILTER_COMMAND_PREFIX + type }, {
                execute: () => this.toggle(type),
                isToggled: () => this.searchModel.isTypeEnabled(type)
            });
        }
    }

    registerMenus(menus: MenuModelRegistry): void {
        this.orderedContributions().forEach((contribution, index) => {
            menus.registerMenuAction(EXTENSIONS_FILTER_BY_TYPE_MENU, {
                commandId: FILTER_COMMAND_PREFIX + contribution.type,
                label: contribution.displayName,
                order: String(index)
            });
        });
    }

    protected orderedContributions(): ExtensionsSourceContribution[] {
        return [...this.contributions.getContributions()].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    }

    /**
     * Toggles whether the given type is shown. A full selection is normalized to "no filter"
     * (`enabledTypes === undefined`) so the search bar's funnel icon only lights up for a real subset.
     */
    protected toggle(type: string): void {
        const allTypes = this.orderedContributions().map(c => c.type);
        const enabled = new Set(allTypes.filter(t => this.searchModel.isTypeEnabled(t)));
        if (enabled.has(type)) {
            enabled.delete(type);
        } else {
            enabled.add(type);
        }
        this.searchModel.enabledTypes = enabled.size === allTypes.length ? undefined : enabled;
    }
}
