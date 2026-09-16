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

import { inject, injectable, named, optional } from 'inversify';
import { DockLayout } from '@lumino/widgets';
import { ApplicationShell, WidgetAreaResolver } from './shell/application-shell';
import { SidePanel } from './shell/side-panel-handler';
import { FrontendApplicationContribution } from './frontend-application-contribution';
import { AbstractViewContribution } from './shell/view-contribution';
import { WidgetManager } from './widget-manager';
import { ContributionProvider } from '../common/contribution-provider';
import { Command, CommandContribution, CommandRegistry } from '../common/command';
import { Emitter, Event } from '../common/event';
import { ILogger } from '../common/logger';
import { QuickInputService, QuickPickItem } from '../common/quick-pick-service';
import { nls } from '../common/nls';
import { CommonCommands } from './common-commands';
import { ContextKeyService } from './context-key-service';

export const ACTIVE_PERSPECTIVE_CONTEXT_KEY = 'activePerspectiveId';

export interface PerspectiveChromeOptions {
    /** Areas to collapse on first activation. User can re-expand freely. */
    collapseAreas?: ('left' | 'right' | 'bottom')[];
}

export interface PerspectiveDescriptor {
    id: string;
    label: string;
    /** Widget/view-container ID → target shell area */
    viewPlacements: Map<string, ApplicationShell.Area>;
    /** Chrome control options for this perspective */
    chromeOptions?: PerspectiveChromeOptions;
    /** Per-area primary view: the widget to activate last in each shell area, so it gets focus. */
    primaryViews?: Partial<Record<ApplicationShell.Area, string>>;
    /** Called when perspective is activated */
    onActivate?(shell: ApplicationShell): void;
    /** Called when switching away */
    onDeactivate?(shell: ApplicationShell): void;
}

export const PerspectiveService = Symbol('PerspectiveService');
export interface PerspectiveService {
    // --- High-level API (for general consumers) ---

    /** Event fired whenever the active perspective changes. The payload is the new perspective ID. */
    readonly onDidChangePerspective: Event<string>;

    /**
     * Registers a new perspective descriptor.
     * Contributions should call this from their `PerspectiveContribution.registerPerspectives` callback.
     */
    registerPerspective(descriptor: PerspectiveDescriptor): void;

    /**
     * Switches the workbench to the given perspective.
     * Saves the current perspective's layout, then restores the target perspective's layout
     * (or applies its `viewPlacements` on first activation). Concurrent calls are serialized.
     */
    switchPerspective(id: string): Promise<void>;

    /** Returns the descriptor of the currently active perspective, or `undefined` if none. */
    getActivePerspective(): PerspectiveDescriptor | undefined;

    /** Returns the target shell area for a widget in the active perspective, or `undefined` if unmapped. */
    getAreaForView(viewId: string): ApplicationShell.Area | undefined;

    /** Returns all registered perspective descriptors. */
    getRegisteredPerspectives(): PerspectiveDescriptor[];

    /** Returns the ID of the currently active perspective. A convenient alternative to `getActivePerspective()?.id` that always returns a string. */
    getActivePerspectiveId(): string;

    /**
     * Resets the active perspective to its programmatic state (viewPlacements from its descriptor),
     * discarding the saved layout. Does not affect other perspectives.
     */
    resetCurrentPerspective(): Promise<void>;
}

export const PerspectiveServiceInternal = Symbol('PerspectiveServiceInternal');
/**
 * Internal plumbing API for layout persistence infrastructure.
 * General consumers should use {@link PerspectiveService} instead.
 */
export interface PerspectiveServiceInternal {
    /**
     * Returns the ID of the currently active perspective.
     * @internal Plumbing API, used by `ShellLayoutRestorer` for layout persistence.
     */
    getActivePerspectiveId(): string;

    /**
     * Returns the IDs of all perspectives that have a saved (in-memory) layout snapshot.
     * @internal Plumbing API, used by `ShellLayoutRestorer` for layout persistence.
     */
    getSavedPerspectiveIds(): string[];

    /**
     * Returns the saved in-memory layout for a perspective, or `undefined` if none exists.
     * @internal Plumbing API, used by `ShellLayoutRestorer` for layout persistence.
     */
    getSavedLayout(perspectiveId: string): ApplicationShell.LayoutData | undefined;

    /**
     * Stores an in-memory layout snapshot for a perspective.
     * @internal Plumbing API, used by `ShellLayoutRestorer` for layout persistence.
     */
    setSavedLayout(perspectiveId: string, layout: ApplicationShell.LayoutData): void;

    /**
     * Sets the active perspective ID (without triggering a switch).
     * Returns `true` if the ID corresponds to a registered perspective, `false` otherwise.
     * @internal Plumbing API, used by `ShellLayoutRestorer` during layout restore.
     */
    setActivePerspectiveId(id: string): boolean;

    /**
     * The ID of the built-in default perspective.
     * @internal Plumbing API, used by `ShellLayoutRestorer` for legacy migration.
     */
    readonly defaultPerspectiveId: string;

    /**
     * Clears all saved in-memory layout snapshots.
     * @internal Plumbing API, used by `ShellLayoutRestorer` during layout reset.
     */
    clearSavedLayouts(): void;

    /**
     * Called by `ShellLayoutRestorer` after restoring a persisted layout to apply chrome options
     * (e.g., status bar visibility) for the given perspective.
     * @internal Plumbing API, used by `ShellLayoutRestorer` after layout restore.
     */
    onLayoutRestored(activePerspectiveId: string): void;
}

export const PerspectiveContribution = Symbol('PerspectiveContribution');
export interface PerspectiveContribution {
    registerPerspectives(service: PerspectiveService): void;
}

@injectable()
export class WidgetAreaResolverImpl implements WidgetAreaResolver {
    protected activePlacementMap = new Map<string, ApplicationShell.Area>();

    setActivePlacementMap(map: Map<string, ApplicationShell.Area>): void {
        this.activePlacementMap = map;
    }

    resolveArea(widgetId: string, requestedArea: ApplicationShell.Area): ApplicationShell.Area | undefined {
        return this.activePlacementMap.get(widgetId);
    }
}

@injectable()
export class PerspectiveServiceImpl implements FrontendApplicationContribution, CommandContribution, PerspectiveService, PerspectiveServiceInternal {

    static readonly SWITCH_PERSPECTIVE_COMMAND = Command.toLocalizedCommand({
        id: 'perspective.switch',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Switch Perspective (Experimental)'
    }, 'theia/core/perspective/switchPerspective', CommonCommands.VIEW_CATEGORY_KEY);

    static readonly RESET_PERSPECTIVE_COMMAND = Command.toLocalizedCommand({
        id: 'perspective.reset',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Reset Perspective (Experimental)'
    }, 'theia/core/perspective/resetPerspective', CommonCommands.VIEW_CATEGORY_KEY);

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ContributionProvider) @named(PerspectiveContribution) @optional()
    protected readonly contributions: ContributionProvider<PerspectiveContribution> | undefined;

    @inject(ContributionProvider) @named(FrontendApplicationContribution)
    protected readonly appContributions: ContributionProvider<FrontendApplicationContribution>;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService | undefined;

    @inject(ILogger) @named('core:PerspectiveServiceImpl')
    protected readonly logger: ILogger;

    @inject(WidgetAreaResolver)
    protected readonly widgetAreaResolver: WidgetAreaResolver;

    @inject(ContextKeyService) @optional()
    protected readonly contextKeyService: ContextKeyService | undefined;

    static readonly DEFAULT_PERSPECTIVE_ID = 'default';

    readonly defaultPerspectiveId = PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID;

    protected readonly perspectives = new Map<string, PerspectiveDescriptor>();
    protected activePerspectiveId: string | undefined;
    protected readonly savedLayouts = new Map<string, ApplicationShell.LayoutData>();

    protected readonly onDidChangePerspectiveEmitter = new Emitter<string>();
    readonly onDidChangePerspective: Event<string> = this.onDidChangePerspectiveEmitter.event;

    protected switchInProgress: Promise<void> | undefined;

    onLayoutRestored(activePerspectiveId: string): void {
        this.updateActivePerspectiveContextKey(activePerspectiveId);
    }

    initialize(): void {
        this.registerPerspective({
            id: PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID,
            label: nls.localizeByDefault('Default'),
            viewPlacements: new Map()
        });
        this.activePerspectiveId = PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID;
        this.updateActivePerspectiveContextKey(PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID);

        if (this.contributions) {
            for (const contribution of this.contributions.getContributions()) {
                contribution.registerPerspectives(this);
            }
        }
    }

    onStop(): void {
        this.onDidChangePerspectiveEmitter.dispose();
    }

    protected updateActivePerspectiveContextKey(id: string): void {
        this.contextKeyService?.createKey<string>(ACTIVE_PERSPECTIVE_CONTEXT_KEY, id).set(id);
    }

    registerPerspective(descriptor: PerspectiveDescriptor): void {
        this.perspectives.set(descriptor.id, descriptor);
    }

    async switchPerspective(id: string): Promise<void> {
        const pending = (this.switchInProgress ?? Promise.resolve())
            .catch(() => { /* swallow previous rejection so next switch can proceed */ })
            .then(() => this.doSwitchPerspective(id));
        this.switchInProgress = pending;
        try {
            await pending;
        } finally {
            if (this.switchInProgress === pending) {
                this.switchInProgress = undefined;
            }
        }
    }

    protected async doSwitchPerspective(id: string): Promise<void> {
        if (id === this.activePerspectiveId) {
            return;
        }

        const descriptor = this.perspectives.get(id);
        if (!descriptor) {
            return;
        }

        const oldPerspective = this.getActivePerspective();
        if (oldPerspective?.onDeactivate) {
            oldPerspective.onDeactivate(this.shell);
        }

        if (this.activePerspectiveId) {
            this.savedLayouts.set(this.activePerspectiveId, this.shell.getLayoutData());
        }

        this.activePerspectiveId = id;
        this.widgetAreaResolver.setActivePlacementMap(descriptor.viewPlacements);

        try {
            const savedLayout = this.savedLayouts.get(id);
            if (savedLayout) {
                const layoutWidgetIds = this.collectWidgetIds(savedLayout);
                await this.healLayoutData(savedLayout);
                await this.shell.setLayoutData(savedLayout);
                this.detachStrayWidgets(layoutWidgetIds);
            } else {
                await this.applyViewPlacements(descriptor);
            }
        } catch (error) {
            this.logger.warn('Failed to apply layout for perspective', error);
        }

        if (descriptor.onActivate) {
            descriptor.onActivate(this.shell);
        }

        this.updateActivePerspectiveContextKey(id);

        this.onDidChangePerspectiveEmitter.fire(id);
    }

    protected async applyViewPlacements(descriptor: PerspectiveDescriptor): Promise<void> {
        for (const [viewId, area] of descriptor.viewPlacements) {
            try {
                const widget = await this.widgetManager.getOrCreateWidget(viewId);
                const currentTabBar = this.shell.getTabBarFor(widget);
                if (currentTabBar) {
                    const currentArea = this.shell.getAreaFor(widget);
                    if (currentArea === area) {
                        continue;
                    }
                }
                await this.shell.addWidget(widget, { area });
            } catch (error) {
                this.logger.warn('Failed to create or place widget for perspective', error);
            }
        }

        for (const [viewId] of descriptor.viewPlacements) {
            try {
                await this.shell.activateWidget(viewId);
            } catch (error) {
                this.logger.warn('Failed to activate widget for perspective', error);
            }
        }

        if (descriptor.primaryViews) {
            for (const viewId of Object.values(descriptor.primaryViews)) {
                if (viewId) {
                    try {
                        await this.shell.activateWidget(viewId);
                    } catch (error) {
                        this.logger.warn('Failed to activate primary view for perspective', error);
                    }
                }
            }
        }

        if (descriptor.chromeOptions?.collapseAreas) {
            for (const area of descriptor.chromeOptions.collapseAreas) {
                await this.shell.collapsePanel(area);
            }
        }
    }

    async resetCurrentPerspective(): Promise<void> {
        const pending = (this.switchInProgress ?? Promise.resolve())
            .catch(() => { /* swallow previous rejection so next reset can proceed */ })
            .then(() => this.doResetCurrentPerspective());
        this.switchInProgress = pending;
        try {
            await pending;
        } finally {
            if (this.switchInProgress === pending) {
                this.switchInProgress = undefined;
            }
        }
    }

    protected async doResetCurrentPerspective(): Promise<void> {
        const descriptor = this.getActivePerspective();
        if (!descriptor) {
            return;
        }

        this.savedLayouts.delete(descriptor.id);

        try {
            if (descriptor.id === PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID) {
                await this.resetDefaultPerspective();
            } else {
                await this.applyViewPlacements(descriptor);
            }
        } catch (error) {
            this.logger.warn('Failed to apply layout for perspective', error);
        }

        if (descriptor.onActivate) {
            descriptor.onActivate(this.shell);
        }

        this.onDidChangePerspectiveEmitter.fire(descriptor.id);
    }

    protected async resetDefaultPerspective(): Promise<void> {
        // Phase 1: Relocate open views to their default areas
        for (const contribution of this.appContributions.getContributions()) {
            if (contribution instanceof AbstractViewContribution) {
                const widgetId = contribution.effectiveWidgetId;
                const targetArea = contribution.defaultViewOptions?.area;
                if (!widgetId || !targetArea) {
                    continue;
                }
                const widget = this.widgetManager.tryGetWidget(widgetId);
                if (widget && !widget.isDisposed && widget.isAttached) {
                    const currentArea = this.shell.getAreaFor(widget);
                    if (currentArea && currentArea !== targetArea) {
                        try {
                            await this.shell.addWidget(widget, { area: targetArea });
                        } catch (error) {
                            this.logger.warn('Failed to relocate widget during default perspective reset', widgetId, error);
                        }
                    }
                }
            }
        }

        // Phase 2: Re-open closed views via openView({ activate: false }).
        // Non-view contributions (e.g., Terminal) are skipped to avoid side effects
        // like creating new terminal instances.
        for (const contribution of this.appContributions.getContributions()) {
            if (contribution instanceof AbstractViewContribution) {
                try {
                    await contribution.openView({ activate: false });
                } catch (error) {
                    this.logger.warn('Failed to open view during default perspective reset', error);
                }
            }
        }
    }

    /**
     * Views may be shared between multiple perspective. If a view exists in two or more perspectives
     * and is closed in one of them, the shared widget is disposed. When switching back to the other
     * perspective, we need to restore this widget (i.e. reopen the view).
     * @param layout
     */
    protected async healLayoutData(layout: ApplicationShell.LayoutData): Promise<void> {
        if (layout.leftPanel) {
            await this.healSidePanelLayout(layout.leftPanel);
        }
        if (layout.rightPanel) {
            await this.healSidePanelLayout(layout.rightPanel);
        }
        if (layout.mainPanel?.main) {
            await this.healDockAreaConfig(layout.mainPanel.main);
        }
        if (layout.bottomPanel?.config?.main) {
            await this.healDockAreaConfig(layout.bottomPanel.config.main);
        }
    }

    protected async healSidePanelLayout(layout: SidePanel.LayoutData): Promise<void> {
        if (!layout.items) {
            return;
        }
        for (const item of layout.items) {
            if (item.widget?.isDisposed) {
                try {
                    item.widget = await this.widgetManager.getOrCreateWidget(item.widget.id);
                } catch (error) {
                    this.logger.warn('Failed to recreate disposed widget for perspective layout', item.widget.id, error);
                    item.widget = undefined;
                }
            }
        }
    }

    protected async healDockAreaConfig(config: DockLayout.ITabAreaConfig | DockLayout.ISplitAreaConfig): Promise<void> {
        if (config.type === 'tab-area') {
            for (let i = 0; i < config.widgets.length; i++) {
                const widget = config.widgets[i];
                if (widget.isDisposed) {
                    try {
                        config.widgets[i] = await this.widgetManager.getOrCreateWidget(widget.id);
                    } catch (error) {
                        this.logger.warn('Failed to recreate disposed widget for perspective layout', widget.id, error);
                        config.widgets.splice(i, 1);
                        i--;
                    }
                }
            }
        } else if (config.type === 'split-area') {
            for (const child of config.children) {
                await this.healDockAreaConfig(child);
            }
        }
    }

    protected collectWidgetIds(layout: ApplicationShell.LayoutData): Set<string> {
        const ids = new Set<string>();
        if (layout.leftPanel) {
            this.collectSidePanelWidgetIds(layout.leftPanel, ids);
        }
        if (layout.rightPanel) {
            this.collectSidePanelWidgetIds(layout.rightPanel, ids);
        }
        if (layout.mainPanel?.main) {
            this.collectDockWidgetIds(layout.mainPanel.main, ids);
        }
        if (layout.bottomPanel?.config?.main) {
            this.collectDockWidgetIds(layout.bottomPanel.config.main, ids);
        }
        return ids;
    }

    protected collectSidePanelWidgetIds(layout: SidePanel.LayoutData, ids: Set<string>): void {
        if (layout.items) {
            for (const item of layout.items) {
                if (item.widget) {
                    ids.add(item.widget.id);
                }
            }
        }
    }

    protected collectDockWidgetIds(
        config: DockLayout.ITabAreaConfig | DockLayout.ISplitAreaConfig,
        ids: Set<string>
    ): void {
        if (config.type === 'tab-area') {
            for (const widget of config.widgets) {
                if (widget) {
                    ids.add(widget.id);
                }
            }
        } else if (config.type === 'split-area') {
            for (const child of config.children) {
                this.collectDockWidgetIds(child, ids);
            }
        }
    }

    protected detachStrayWidgets(layoutWidgetIds: Set<string>): void {
        const sidePanelAreas: ApplicationShell.Area[] = ['left', 'right'];
        for (const area of sidePanelAreas) {
            for (const widget of this.shell.getWidgets(area)) {
                if (!layoutWidgetIds.has(widget.id)) {
                    // Detach via parent = null rather than widget.close() to avoid
                    // disposing the widget — it may be needed by another perspective.
                    // eslint-disable-next-line no-null/no-null
                    widget.parent = null;
                }
            }
        }
    }

    getActivePerspective(): PerspectiveDescriptor | undefined {
        if (this.activePerspectiveId) {
            return this.perspectives.get(this.activePerspectiveId);
        }
        return undefined;
    }

    getAreaForView(viewId: string): ApplicationShell.Area | undefined {
        const active = this.getActivePerspective();
        if (active) {
            return active.viewPlacements.get(viewId);
        }
        return undefined;
    }

    getRegisteredPerspectives(): PerspectiveDescriptor[] {
        return Array.from(this.perspectives.values());
    }

    getActivePerspectiveId(): string {
        return this.activePerspectiveId ?? PerspectiveServiceImpl.DEFAULT_PERSPECTIVE_ID;
    }

    getSavedPerspectiveIds(): string[] {
        return Array.from(this.savedLayouts.keys());
    }

    getSavedLayout(perspectiveId: string): ApplicationShell.LayoutData | undefined {
        return this.savedLayouts.get(perspectiveId);
    }

    setSavedLayout(perspectiveId: string, layout: ApplicationShell.LayoutData): void {
        this.savedLayouts.set(perspectiveId, layout);
    }

    setActivePerspectiveId(id: string): boolean {
        if (this.perspectives.has(id)) {
            this.activePerspectiveId = id;
            return true;
        }
        return false;
    }

    clearSavedLayouts(): void {
        this.savedLayouts.clear();
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(PerspectiveServiceImpl.SWITCH_PERSPECTIVE_COMMAND, {
            execute: () => this.showPerspectivePicker(),
            isVisible: () => this.perspectives.size > 1
        });
        commands.registerCommand(PerspectiveServiceImpl.RESET_PERSPECTIVE_COMMAND, {
            execute: () => this.resetCurrentPerspective(),
            isEnabled: () => this.activePerspectiveId !== undefined
        });
    }

    protected async showPerspectivePicker(): Promise<void> {
        if (!this.quickInputService) {
            return;
        }

        const items: QuickPickItem[] = this.getRegisteredPerspectives().map(p => ({
            label: p.label,
            id: p.id,
            description: this.activePerspectiveId === p.id ? nls.localizeByDefault('Active') : undefined
        }));

        const selected = await this.quickInputService.showQuickPick(items, {
            placeholder: nls.localize('theia/core/perspective/selectPerspective', 'Select a perspective')
        });

        if (selected?.id) {
            await this.switchPerspective(selected.id);
        }
    }
}
