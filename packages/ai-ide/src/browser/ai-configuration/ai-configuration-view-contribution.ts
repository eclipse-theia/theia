// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { Command, CommandRegistry, MenuModelRegistry, nls } from '@theia/core';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { AI_SHOW_SETTINGS_COMMAND, AIViewContribution } from '@theia/ai-core/lib/browser';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { codicon, CommonCommands, CommonMenus, KeybindingRegistry } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { AIConfigurationContainerWidget } from './ai-configuration-widget';
import { AIConfigurationSelectionService } from './ai-configuration-service';
import {
    AiConfigurationCategoryId, AiConfigurationSearchProvider, AiConfigurationSelection
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationCategoryRegistry } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category-registry';
import { AiConfigurationSelectionModel } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-selection-model';

/** Preference key prefix under which all AI features register their preferences. */
const AI_PREFERENCE_PREFIX = 'ai-features.';

export const AI_CONFIGURATION_TOGGLE_COMMAND_ID = 'aiConfiguration:toggle';
export const OPEN_AI_CONFIG_VIEW = Command.toLocalizedCommand({
    id: 'aiConfiguration:open',
    label: 'Open AI Configuration view',
});

export const OPEN_AI_CONFIG_VIEW_TOOLS = Command.toLocalizedCommand({
    id: 'aiConfiguration:openTools',
    label: 'Open AI Tools Configuration',
});

@injectable()
export class AIConfigurationViewContribution extends AIViewContribution<AIConfigurationContainerWidget> implements TabBarToolbarContribution {

    @inject(AIConfigurationSelectionService)
    protected readonly aiConfigurationSelectionService: AIConfigurationSelectionService;

    @inject(AiConfigurationCategoryRegistry)
    protected readonly categoryRegistry: AiConfigurationCategoryRegistry;

    @inject(AiConfigurationSelectionModel)
    protected readonly selectionModel: AiConfigurationSelectionModel;

    constructor() {
        super({
            widgetId: AIConfigurationContainerWidget.ID,
            widgetName: AIConfigurationContainerWidget.LABEL,
            defaultWidgetOptions: {
                area: 'main',
                rank: 100
            },
            toggleCommandId: AI_CONFIGURATION_TOGGLE_COMMAND_ID
        });
    }

    /**
     * Overrides {@link AIViewContribution.init}, which closes the view when AI features are disabled.
     * The AI Configuration view must instead stay open, so that turning AI off does not close the very
     * view holding the toggle that turns it back on. It stays reachable either way via the Manage (gear)
     * menu and `alt+a`, both of which are ungated. See eclipsesource/theia#316.
     */
    protected override init(): void {
        // Intentionally left blank: do not register the deactivate-closes-view listener.
    }

    override registerCommands(commands: CommandRegistry): void {
        // Register the view toggle command as {@link AIViewContribution} would, but intentionally omit the
        // "Open View..." quick-pick item it registers. The AI Configuration view is reachable only from the
        // bottom-left Manage (gear) menu and the alt+a keybinding, mirroring the Settings UI.
        if (this.toggleCommand) {
            commands.registerCommand(this.toggleCommand, this.commandHandlerFactory({
                execute: () => this.toggleView()
            }));
        }
        commands.registerCommand(OPEN_AI_CONFIG_VIEW, {
            execute: async (target?: unknown) => {
                // The Manage-menu entry and the alt+a keybinding invoke this with no argument; the chat
                // toolbar passes the active widget. Only an explicit string target (a category or preference
                // id) navigates - anything else just opens the view, so every entry point behaves the same
                // as the Manage-menu entry.
                const explicitTarget = typeof target === 'string' ? target.trim() || undefined : undefined;
                // Whether the view already existed (open in some tab) before this call.
                const alreadyOpen = !!this.tryGetWidget();
                await this.openView({ activate: true });
                if (explicitTarget) {
                    // An explicit category/preference target always navigates.
                    this.navigateTo(explicitTarget);
                } else if (!alreadyOpen) {
                    // A fresh open with no target lands on General; an already-open view is only
                    // (re-)activated and keeps its current selection.
                    this.navigateTo(undefined);
                }
            },
        });
        commands.registerCommand(OPEN_AI_CONFIG_VIEW_TOOLS, {
            execute: () => commands.executeCommand(OPEN_AI_CONFIG_VIEW.id, AiConfigurationCategoryId.TOOLS),
        });
        // "Show AI Settings" (contributed by @theia/ai-core, e.g. the chat toolbar gear) opens the AI
        // features settings. Those now live in this view rather than the Settings UI, so route the command
        // straight here. Registered from @theia/ai-ide, this handler takes precedence over the core one
        // (which falls back to `preferences:open` for apps without this view). No `isEnabled` gate, so the
        // view stays reachable while AI is disabled — that is where AI features are re-enabled.
        commands.registerHandler(AI_SHOW_SETTINGS_COMMAND.id, {
            // Forwarded so callers can deep-link to a preference row; OPEN_AI_CONFIG_VIEW ignores any
            // argument that is not a string, so the widget the chat toolbar passes just opens the view.
            execute: (target?: unknown) => commands.executeCommand(OPEN_AI_CONFIG_VIEW.id, target)
        });
    }

    /** Whether a `preferences:open` argument targets the AI features preference section or a preference in it. */
    protected isAiConfigurationPreference(query: unknown): boolean {
        return typeof query === 'string' && (query === 'ai-features' || query.startsWith(AI_PREFERENCE_PREFIX));
    }

    /**
     * Navigates the (already-open) view to `target`. An `ai-features.*` preference id (or the `ai-features`
     * section) opens the owning category focused on that row; any other value is treated as a category/tab
     * id; no target lands on General. This lets every AI-settings entry point go through
     * {@link OPEN_AI_CONFIG_VIEW} instead of `preferences:open`.
     */
    protected navigateTo(target?: string): void {
        const value = target?.trim();
        // An AI preference id (or the `ai-features` section) → focus the owning category and row.
        if (value && this.isAiConfigurationPreference(value)) {
            this.selectionModel.select(
                this.resolvePreferenceTarget(value) ?? { categoryId: AiConfigurationCategoryId.GENERAL, highlight: { rowId: value } }
            );
            return;
        }
        // A known category id → select it directly (deterministic, no dependency on the legacy bridge).
        if (value && this.categoryRegistry.getCategory(value)) {
            this.selectionModel.select({ categoryId: value });
            return;
        }
        // A legacy per-tab widget id → let the container bridge map it onto a category.
        if (value) {
            this.aiConfigurationSelectionService.selectConfigurationTab(value);
            return;
        }
        // No/empty target → General, so the detail never stays on the empty "select a category" placeholder.
        this.selectionModel.select({ categoryId: AiConfigurationCategoryId.GENERAL });
    }

    /**
     * Finds the navigation target for a preference by scanning the categories' deep-search index for the
     * setting row that anchors it (rows use the preference id as their `highlight.rowId`). Returns
     * `undefined` when no category surfaces the preference.
     */
    protected resolvePreferenceTarget(preferenceId: string): AiConfigurationSelection | undefined {
        for (const category of this.categoryRegistry.getCategories()) {
            const searchProvider = category as Partial<AiConfigurationSearchProvider>;
            for (const item of searchProvider.getSearchItems?.() ?? []) {
                if (item.target.highlight?.rowId === preferenceId) {
                    return item.target;
                }
            }
        }
        return undefined;
    }

    /**
     * Overrides {@link AIViewContribution.registerMenus} so the AI Configuration view is offered only from
     * the bottom-left Manage (gear) menu, mirroring the Settings UI. It is intentionally not added to the
     * View menu's "Views" submenu. The Manage entry (and the alt+a keybinding) keep it reachable even while
     * AI is disabled, which is where AI gets re-enabled. See eclipsesource/theia#316.
     */
    override registerMenus(menus: MenuModelRegistry): void {
        // Bottom-left Manage menu, directly below "Settings" (order 'a10').
        menus.registerMenuAction(CommonMenus.MANAGE_SETTINGS, {
            commandId: OPEN_AI_CONFIG_VIEW.id,
            label: nls.localize('theia/ai/ide/aiConfiguration/manageMenu', 'AI Configuration'),
            order: 'a11'
        });
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: OPEN_AI_CONFIG_VIEW.id,
            keybinding: 'alt+a'
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        // The IDE offers "Open AI Configuration" (below) as the single chat-toolbar entry into AI settings,
        // so drop the generic "Open AI Settings" button that @theia/ai-chat-ui contributes for base apps
        // (AI_SHOW_SETTINGS_COMMAND). @theia/ai-ide depends on @theia/ai-chat-ui, so that item is already
        // registered by the time this runs.
        registry.unregisterItem('chat-view.' + AI_SHOW_SETTINGS_COMMAND.id);
        registry.registerItem({
            id: 'chat-view.' + OPEN_AI_CONFIG_VIEW.id,
            command: OPEN_AI_CONFIG_VIEW.id,
            tooltip: nls.localize('theia/ai-ide/open-ai-configuration-tooltip', 'Open AI Configuration'),
            group: 'ai-settings',
            priority: 2,
            isVisible: widget => this.activationService.isActive && widget instanceof ChatViewWidget
        });
        // Escape hatch from the AI Configuration view to the regular Settings UI. OPEN_PREFERENCES ignores
        // the widget argument the toolbar passes (it only acts on a string search term), and this view's
        // `ai-features.*` interceptor does not claim it (the argument is not an AI preference id).
        registry.registerItem({
            id: 'ai-configuration.open-settings-ui',
            command: CommonCommands.OPEN_PREFERENCES.id,
            icon: codicon('settings'),
            tooltip: nls.localizeByDefault('Open Settings (UI)'),
            isVisible: widget => widget instanceof AIConfigurationContainerWidget
        });
        // Expand/Collapse All are a single contextual toggle below the search box, owned by the search
        // widget and wired straight to the tree (see `AIConfigurationContainerWidget.initListeners`).
        // Deliberately not commands: they act on this view's own category tree, so "Expand All" would not
        // say in the command palette what it expands. The Outline and Problems views keep theirs out of the
        // palette the same way, by declaring the command without a `label` (`QuickCommandService.normalize`
        // filters those out) on top of gating it on the widget.
    }
}
