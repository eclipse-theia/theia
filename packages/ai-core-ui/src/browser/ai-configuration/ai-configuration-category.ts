// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { Event } from '@theia/core';
// Type-only, so this contribution point stays free of a runtime dependency on the rendering component.
import type { AiConfigurationOrigin } from './components/ai-configuration-origin-badge';

/**
 * Contribution point for a category shown in the AI Configuration view.
 *
 * Both built-in and externally contributed categories use this identical path;
 * there is no privileged API. Categories are collected via a
 * {@link ContributionProvider} and ordered by {@link AiConfigurationCategory.order}
 * by the {@link AiConfigurationCategoryRegistry}.
 */
export const AiConfigurationCategory = Symbol('AiConfigurationCategory');

/**
 * A `single-page` category renders one detail page; a `collection` category
 * exposes tree children and renders an overview plus (optionally) per-item detail.
 */
export type AiConfigurationCategoryKind = 'single-page' | 'collection';

/**
 * Spaced ordering scale for the built-in categories, leaving room for
 * future built-ins and extensions to slot in between. Assigned to
 * {@link AiConfigurationCategory.order}. Categories with `contributed: true`
 * always sort after all built-ins, regardless of their `order`.
 */
export namespace AiConfigurationCategoryOrder {
    export const GENERAL = 100;
    export const MODELS = 200;
    export const MODEL_ALIASES = 300;
    export const AGENTS = 400;
    export const PROMPTS_AND_SKILLS = 500;
    export const PROMPT_SNIPPETS = 550;
    export const VARIABLES = 600;
    export const MCP_SERVERS = 700;
    export const TOOLS = 800;
    export const TOKEN_USAGE = 900;
}

/**
 * Canonical ids of the built-in categories. Shared so that the categories
 * (contributed from `ai-ide` and `ai-mcp`), navigation targets, and the legacy
 * `OPEN_AI_CONFIG_VIEW` tab-id mapping all reference the same stable strings.
 */
export namespace AiConfigurationCategoryId {
    export const GENERAL = 'general';
    export const MODELS = 'models';
    export const MODEL_ALIASES = 'model-aliases';
    export const AGENTS = 'agents';
    export const PROMPTS_AND_SKILLS = 'prompts-and-skills';
    export const PROMPT_SNIPPETS = 'prompt-snippets';
    export const VARIABLES = 'variables';
    export const MCP_SERVERS = 'mcp-servers';
    export const TOOLS = 'tools';
    export const TOKEN_USAGE = 'token-usage';
}

/**
 * Navigation into the Tools category's per-tool list. Shared here because the lists that link to it are
 * spread across packages (an agent's used tools in `@theia/ai-ide`, a server's tools in `@theia/ai-mcp`)
 * while the page itself lives in `@theia/ai-ide`, which those packages cannot all import.
 */
export namespace AiConfigurationTools {
    /**
     * Prefix of the `data-ai-config-row-id` the Tools page puts on each tool row. The tool's registry name
     * completes it — for an MCP tool that is `mcp_<server>_<tool>`, not the bare name shown per server.
     */
    export const ROW_ID_PREFIX = 'tool:';

    /** Navigation target that scrolls to and flashes `toolName`'s row, where its confirmation mode is set. */
    export function selectionFor(toolName: string): AiConfigurationSelection {
        return {
            categoryId: AiConfigurationCategoryId.TOOLS,
            highlight: { rowId: ROW_ID_PREFIX + toolName }
        };
    }
}

/**
 * The scope a category's settings are read from and written to.
 *
 * The view currently always renders the `user` scope; selecting a scope is not implemented yet.
 */
export type AiConfigurationScope = 'user' | 'workspace' | 'folder';

export interface AiConfigurationCategory {
    /** Stable id; used as the tree-node id and in navigation targets. */
    readonly id: string;
    /** Localized label shown in the tree and breadcrumb. */
    readonly label: string;
    /** Optional one-line description shown under the category name in the detail-page header. */
    readonly description?: string;
    /** `codicon(...)` class shown in the tree, breadcrumb, and cards. */
    readonly iconClass: string;
    /** Ascending sort; defaults to `0`. Built-ins use a spaced scale. */
    readonly order?: number;
    readonly kind: AiConfigurationCategoryKind;
    /** When `true`, grouped under "Contributed by extensions". Built-ins omit or set `false`. */
    readonly contributed?: boolean;

    readonly renderer: AiConfigurationCategoryRenderer;
    /** Optional: items contributed to the tree-level (deep) search index. */
    readonly search?: AiConfigurationSearchProvider;

    /** Fire to refresh tree children/count badge, overview, and search index. */
    readonly onDidChange?: Event<void>;
    dispose?(): void;
}

/**
 * Produces the React nodes that drop into the detail-pane primitives.
 *
 * A `single-page` category implements {@link renderPage}; a `collection`
 * category implements {@link getTreeChildren} + {@link renderOverview} and,
 * optionally, {@link renderItemDetail}.
 */
export interface AiConfigurationCategoryRenderer {
    /** Single-page body (e.g. General, Models, Prompts & Skills, Tools, Token Usage). */
    renderPage?(ctx: AiConfigurationRenderContext): React.ReactNode;

    /**
     * Collection overview (category node selected): category-level settings +
     * filter slot + item card grid + add action + empty state.
     */
    renderOverview?(ctx: AiConfigurationRenderContext): React.ReactNode;

    /**
     * Collection children (items) shown inline in the tree and mirrored as
     * overview cards. Order is preserved.
     */
    getTreeChildren?(): AiConfigurationTreeItem[];

    /**
     * Collection item detail (child selected). `itemId` is a {@link getTreeChildren} id.
     * Optional: e.g. Variables have no editable detail (read-only card only).
     */
    renderItemDetail?(itemId: string, ctx: AiConfigurationRenderContext): React.ReactNode;

    /**
     * The `ai-features.*` preference ids this category surfaces or manages. Used by the catch-all
     * "Advanced" category to render only the preferences no dedicated category already covers, so that
     * every AI preference stays reachable (AI preferences are hidden from the Settings UI) without being
     * shown twice. Best-effort: a missing id merely shows up in the catch-all too, it is never lost.
     */
    getOwnedPreferenceIds?(): string[];

    /**
     * The "create item" action of a `collection` category (e.g. adding a custom agent or an MCP server).
     * Rendered both on the overview and as an inline action on the category's tree node, so it is reachable
     * without opening the page first. Omit it for categories whose items are not user-created.
     */
    getAddAction?(ctx: AiConfigurationRenderContext): AiConfigurationAddDescriptor | undefined;
}

/** A category's "create item" action: what to call it, and what to run. */
export interface AiConfigurationAddDescriptor {
    readonly label: string;
    readonly iconClass?: string;
    run(): void;
}

export interface AiConfigurationTreeItem {
    readonly id: string;
    readonly label: string;
    /**
     * Short labels shown as badges next to the item's name, for what it *is* rather than what it is doing
     * (which is {@link status}). Use {@link origins} for where the item came from, which is a badge of its
     * own kind: it carries an icon and leads somewhere.
     */
    readonly tags?: string[];
    /**
     * Where the item came from, when that is not the user - an AI registry entry, an Agent Plugin. Shown
     * next to the item's name on the overview and, unchanged, on the item's detail header, so that
     * provenance reads the same in both places.
     */
    readonly origins?: AiConfigurationOrigin[];
    /** Status badge shown on the overview card and the item detail header. */
    readonly status?: AiConfigurationItemStatus;
    /** Short text for the overview card. */
    readonly description?: string;
    /** Overrides the category icon for this item, e.g. a per-agent icon. */
    readonly iconClass?: string;
}

export interface AiConfigurationItemStatus {
    readonly kind: 'on' | 'off' | 'warn' | 'error';
    /** Short, human-readable badge text, e.g. "Enabled", "Ready". */
    readonly label: string;
    /** Optional longer hover detail; falls back to {@link label}. */
    readonly tooltip?: string;
}

export interface AiConfigurationSearchProvider {
    /**
     * Called to (re)build this category's slice of the deep-search index.
     * Rebuilt on the category's `onDidChange`.
     */
    getSearchItems(): AiConfigurationSearchItem[];
}

export interface AiConfigurationSearchItem {
    readonly label: string;
    /** Small type badge, e.g. "MCP server", "Prompt", "Setting". */
    readonly typeLabel: string;
    readonly categoryId: string;
    /** Where selecting the result navigates. */
    readonly target: AiConfigurationSelection;
    /** Extra text folded into the match key (ids, descriptions). */
    readonly keywords?: string;
}

export interface AiConfigurationSelection {
    readonly categoryId: string;
    /** `undefined` => single-page body / collection overview. */
    readonly itemId?: string;
    /**
     * Optional row/setting to scroll-to and flash after navigating. `rowId` is matched against the
     * `data-ai-config-row-id` attribute the shared setting rows carry.
     */
    readonly highlight?: { readonly rowId: string };
}

export interface AiConfigurationRenderContext {
    /** Scope the rows read from and write to. Always `user` for now; per-scope editing is not wired up yet. */
    readonly scope: AiConfigurationScope;
    /** Select another node (used by cards, links, "used by" chips). */
    navigate(selection: AiConfigurationSelection): void;
    /** Ask the detail host to re-render the current category body. */
    update(): void;
}
