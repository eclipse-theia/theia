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
import { CommandContribution, CommandRegistry, MenuContribution, MenuModelRegistry, MenuPath, nls } from '@theia/core/lib/common';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ExtensionsSourceContribution } from './extensions-source-contribution';
import { BUILTIN_QUERY, INSTALLED_QUERY, MODE_QUERIES, RECOMMENDED_QUERY, VSXExtensionsSearchModel } from './vsx-extensions-search-model';

/** Menu path of the anchored "Filter" popup opened from the Extensions search bar. */
export const EXTENSIONS_FILTER_BY_TYPE_MENU: MenuPath = ['vsx-extensions-filter-by-type-context-menu'];

/** Menu group for the per-contribution-type toggles (Extensions, MCP Servers, Skills, ...). */
const FILTER_BY_TYPE_GROUP: MenuPath = [...EXTENSIONS_FILTER_BY_TYPE_MENU, '1_types'];
/** Menu group for the existing search-mode queries (`@installed`, `@builtin`, `@recommended`). */
const FILTER_BY_MODE_GROUP: MenuPath = [...EXTENSIONS_FILTER_BY_TYPE_MENU, '2_modes'];

/** Command id prefix for the per-contribution-type toggle commands. */
const FILTER_COMMAND_PREFIX = 'vsxExtensions.filterByType:';
/** Command id prefix for the search-mode shortcut commands shown in the same popup. */
const FILTER_MODE_COMMAND_PREFIX = 'vsxExtensions.filterByMode:';

interface ModeFilterEntry {
    readonly id: string;
    readonly query: string;
    readonly label: string;
}

/**
 * Registers commands + menu items for the anchored "Filter" popup opened from the Extensions
 * search bar. Both kinds of filter go through the search query:
 *
 * - Per-contribution-type toggles insert/remove the contribution's `searchToken` (e.g. `@mcp`).
 *   The popup behaves as an "include this type" filter: with nothing ticked no type token is
 *   present and every contribution is shown; ticking a type narrows the results to it. Multiple
 *   types compose (`@mcp @skills`).
 * - Mode shortcuts insert/remove the existing `@installed` / `@builtin` / `@recommended` token,
 *   which the view container interprets to switch widgets. Modes are mutually exclusive: clicking
 *   one replaces any previously selected mode.
 *
 * Both kinds compose freely in the query (e.g. `@installed @mcp` shows only installed MCP
 * servers), and clearing the query (`Clear Search Results`) automatically resets both.
 */
@injectable()
export class VSXExtensionsFilterContribution implements CommandContribution, MenuContribution {

    @inject(ContributionProvider) @named(ExtensionsSourceContribution)
    protected readonly contributions: ContributionProvider<ExtensionsSourceContribution>;

    @inject(VSXExtensionsSearchModel)
    protected readonly searchModel: VSXExtensionsSearchModel;

    protected readonly modeEntries: readonly ModeFilterEntry[] = [
        { id: 'installed', query: INSTALLED_QUERY, label: nls.localize('theia/vsx-registry/filter/showInstalled', 'Show Installed') },
        { id: 'builtin', query: BUILTIN_QUERY, label: nls.localize('theia/vsx-registry/filter/showBuiltin', 'Show Built-in') },
        { id: 'recommended', query: RECOMMENDED_QUERY, label: nls.localize('theia/vsx-registry/filter/showRecommended', 'Show Recommended') }
    ];

    registerCommands(commands: CommandRegistry): void {
        for (const contribution of this.orderedContributions()) {
            const token = contribution.searchToken;
            // No `label`: these commands exist only for the filter popup, and a labelless command
            // is excluded from the command palette. The menu action below carries the visible label.
            commands.registerCommand({ id: FILTER_COMMAND_PREFIX + contribution.type }, {
                execute: () => this.toggleType(token),
                // Ticked only when the type is explicitly included via its token. With no tokens
                // present nothing is ticked, matching the "no filter" state of the funnel icon.
                isToggled: () => this.searchModel.parseQuery().typeTokens.has(token)
            });
        }
        for (const mode of this.modeEntries) {
            commands.registerCommand({ id: FILTER_MODE_COMMAND_PREFIX + mode.id }, {
                execute: () => this.toggleMode(mode.query),
                isToggled: () => this.queryHasToken(mode.query)
            });
        }
    }

    registerMenus(menus: MenuModelRegistry): void {
        this.orderedContributions().forEach((contribution, index) => {
            menus.registerMenuAction(FILTER_BY_TYPE_GROUP, {
                commandId: FILTER_COMMAND_PREFIX + contribution.type,
                label: contribution.displayName,
                order: String(index)
            });
        });
        this.modeEntries.forEach((mode, index) => {
            menus.registerMenuAction(FILTER_BY_MODE_GROUP, {
                commandId: FILTER_MODE_COMMAND_PREFIX + mode.id,
                label: mode.label,
                order: String(index)
            });
        });
    }

    protected orderedContributions(): ExtensionsSourceContribution[] {
        return [...this.contributions.getContributions()].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    }

    /**
     * Toggles whether the given type is included by the filter. Nothing ticked means "no filter"
     * (all types shown); ticking a type adds its token so the results narrow to it, and ticking
     * a second type widens the selection to both. Unticking the last type returns to "no filter".
     */
    protected toggleType(token: string): void {
        const ticked = new Set(this.searchModel.parseQuery().typeTokens);
        if (ticked.has(token)) {
            ticked.delete(token);
        } else {
            ticked.add(token);
        }
        this.rewriteQuery({ typeTokens: ticked });
    }

    /**
     * Toggles a search-mode token. Modes are mutually exclusive in the view container, so a new
     * selection replaces the previous mode token; re-selecting the active mode clears it.
     */
    protected toggleMode(modeQuery: string): void {
        const previous = this.modeTokenInQuery();
        const nextMode = previous === modeQuery ? undefined : modeQuery;
        this.rewriteQuery({ modeToken: nextMode });
    }

    /** The mode token present in the query, if any. */
    protected modeTokenInQuery(): string | undefined {
        for (const token of this.queryTokens()) {
            if (MODE_QUERIES.includes(token)) {
                return token;
            }
        }
        return undefined;
    }

    /** True when the query contains the given token as a standalone word. */
    protected queryHasToken(token: string): boolean {
        return this.queryTokens().includes(token);
    }

    protected queryTokens(): string[] {
        return this.searchModel.query.split(/\s+/).filter(Boolean);
    }

    /**
     * Rebuilds the query, keeping the free-text remainder intact while swapping in the desired
     * mode and type tokens. Tokens are emitted in a stable order (mode first, then types,
     * then free text) so repeated toggles produce a tidy query.
     */
    protected rewriteQuery(update: { modeToken?: string; typeTokens?: ReadonlySet<string> }): void {
        const parsed = this.searchModel.parseQuery();
        const orderedTypeTokens = this.orderedContributions().map(c => c.searchToken);
        const validTokens = new Set(orderedTypeTokens);
        const previousModeToken = this.modeTokenInQuery();
        // Use key presence to distinguish "caller wants to clear/replace" from "caller is only
        // updating the other field". This applies symmetrically to both fields, so passing
        // `{ modeToken: undefined }` or `{ typeTokens: undefined }` clears that field.
        const nextModeToken = 'modeToken' in update ? update.modeToken : previousModeToken;
        const nextTypeTokens = 'typeTokens' in update
            ? new Set([...(update.typeTokens ?? [])].filter(t => validTokens.has(t)))
            : new Set(parsed.typeTokens);
        const parts: string[] = [];
        if (nextModeToken) {
            parts.push(nextModeToken);
        }
        // Preserve the contribution ordering so toggling later doesn't reshuffle visible tokens.
        for (const token of orderedTypeTokens) {
            if (nextTypeTokens.has(token)) {
                parts.push(token);
            }
        }
        if (parsed.freeText) {
            parts.push(parsed.freeText);
        }
        this.searchModel.query = parts.join(' ');
    }
}
