// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics, Ericsson, ARM, EclipseSource and others.
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

import debounce = require('lodash.debounce');
import { inject, injectable, named } from 'inversify';
import { toArray } from '@lumino/algorithm';
import { BoxLayout, DockLayout, DockPanel, ExtractableWidget, TabBar, Widget } from './widgets';
import { MessageService } from '../common/message-service';
import { ApplicationShell, DockPanelRenderer, MAIN_AREA_CLASS, MAIN_BOTTOM_AREA_CLASS } from './shell/application-shell';
import { Emitter } from '../common/event';
import { environment } from '../common';
import { isSecondaryWindow, SecondaryWindowOptions, SecondaryWindowRootWidget, SecondaryWindowService } from './window/secondary-window-service';
import { KeybindingRegistry } from './keybinding';
import { MAIN_AREA_ID, TheiaDockPanel } from './shell/theia-dock-panel';
import { ILogger } from '../common/logger';
import { nls } from '../common/nls';
import { NativeTabDragService } from './shell/native-tab-drag-service';
import { WindowService } from './window/window-service';
import { PreferenceService } from '../common/preferences';
import { WindowFocusService } from './window/window-focus-service';

/** Widgets to be contained inside a DockPanel in the secondary window. */
class SecondaryWindowDockPanelWidget extends SecondaryWindowRootWidget {

    protected _widgets: Widget[] = [];
    protected dockPanel: TheiaDockPanel;

    /** The bounds of the window when it was closed */
    closedBounds: SecondaryWindowHandler.WindowBounds | undefined;

    constructor(
        dockPanelFactory: TheiaDockPanel.Factory,
        dockPanelRendererFactory: (document?: Document | ShadowRoot) => DockPanelRenderer,
        closeHandler: (sender: TabBar<Widget>, args: TabBar.ITabCloseRequestedArgs<Widget>) => boolean,
        secondaryWindow: Window,
        dropOptions?: Pick<TheiaDockPanel.IOptions, 'canDropWidget' | 'onWillDropWidget'> & {
            /** Called when a widget has been dropped on this window, it must be tracked with {@link track} */
            onDidDropWidget(widget: Widget): void
        }
    ) {
        super();
        this.secondaryWindow = secondaryWindow;
        const boxLayout = new BoxLayout();

        // reuse same tab bar classes and dock panel id as main window to inherit styling
        const renderer = dockPanelRendererFactory(secondaryWindow.document);
        renderer.tabBarClasses.push(MAIN_BOTTOM_AREA_CLASS);
        renderer.tabBarClasses.push(MAIN_AREA_CLASS);
        this.dockPanel = dockPanelFactory({
            disableDragAndDrop: !dropOptions,
            closeHandler,
            mode: 'multiple-document',
            renderer,
            canDropWidget: dropOptions?.canDropWidget,
            onWillDropWidget: dropOptions?.onWillDropWidget
        });
        this.dockPanel.id = MAIN_AREA_ID;
        if (dropOptions) {
            // widgets added through `addWidget` are tracked already
            this.dockPanel.widgetAdded.connect((_, widget) => {
                if (!this._widgets.includes(widget)) {
                    dropOptions.onDidDropWidget(widget);
                }
            });
        }
        BoxLayout.setStretch(this.dockPanel, 1);
        boxLayout.addWidget(this.dockPanel);
        this.layout = boxLayout;
    }

    override get widgets(): ReadonlyArray<Widget> {
        return this._widgets;
    }

    addWidget(widget: Widget, disposeCallback: () => void, options?: TheiaDockPanel.AddOptions): void {
        this.track(widget, disposeCallback);
        this.dockPanel.addWidget(widget, options);
        this.dockPanel.activateWidget(widget);
    }

    /**
     * Tracks the given widget, which has been added to the dock panel of this window.
     *
     * @param disposeCallback called when the widget leaves this window
     */
    track(widget: Widget, disposeCallback: () => void): void {
        this._widgets.push(widget);

        // the widget leaves this window when it is disposed, moved back to the main window or dragged to another window
        const onRemove = () => {
            const index = this._widgets.indexOf(widget);
            if (index > -1) {
                this._widgets.splice(index, 1);
                widget.disposed.disconnect(onRemove);
                this.dockPanel.widgetRemoved.disconnect(onWidgetRemoved);
                disposeCallback();
            }
        };
        const onWidgetRemoved = (_: TheiaDockPanel, removed: Widget) => {
            if (removed === widget) {
                onRemove();
            }
        };
        widget.disposed.connect(onRemove);
        this.dockPanel.widgetRemoved.connect(onWidgetRemoved);
    }

    override getTabBar(widget: Widget): TabBar<Widget> | undefined {
        return this.dockPanel.findTabBar(widget.title);
    }

    /**
     * @returns the widgets in the order of the dock panel's layout
     */
    getLayoutWidgets(): Widget[] {
        return toArray(this.dockPanel.widgets());
    }

    saveLayout(): DockPanel.ILayoutConfig {
        return this.dockPanel.saveLayout();
    }

    /**
     * Restores the layout of the dock panel. The widgets of the layout must be tracked with {@link track} beforehand.
     */
    restoreLayout(config: DockPanel.ILayoutConfig): void {
        this.dockPanel.restoreLayout(config);
    }
}

/**
 * Offers functionality to move a widget out of the main window to a newly created window.
 * Widgets must explicitly implement the `ExtractableWidget` interface to support this.
 *
 * This handler manages the opened secondary windows and sets up messaging between them and the Theia main window.
 * In addition, it provides access to the extracted widgets and provides notifications when widgets are added to or removed from this handler.
 *
 */
@injectable()
export class SecondaryWindowHandler {
    /** List of widgets in secondary windows. */
    protected readonly _widgets: Widget[] = [];

    protected applicationShell: ApplicationShell;

    protected dockPanelRendererFactory: (document?: Document | ShadowRoot) => DockPanelRenderer;

    @inject(KeybindingRegistry)
    protected keybindings: KeybindingRegistry;

    @inject(TheiaDockPanel.Factory)
    protected dockPanelFactory: TheiaDockPanel.Factory;

    @inject(ILogger) @named('core:SecondaryWindowHandler')
    protected readonly logger: ILogger;

    protected readonly onWillAddWidgetEmitter = new Emitter<[Widget, Window]>();
    /** Subscribe to get notified when a widget is added to this handler, i.e. the widget was moved to an secondary window . */
    readonly onWillAddWidget = this.onWillAddWidgetEmitter.event;

    protected readonly onDidAddWidgetEmitter = new Emitter<[Widget, Window]>();
    /** Subscribe to get notified when a widget is added to this handler, i.e. the widget was moved to an secondary window . */
    readonly onDidAddWidget = this.onDidAddWidgetEmitter.event;

    protected readonly onWillRemoveWidgetEmitter = new Emitter<[Widget, Window]>();
    /** Subscribe to get notified when a widget is removed from this handler, i.e. the widget's window was closed or the widget was disposed. */
    readonly onWillRemoveWidget = this.onWillRemoveWidgetEmitter.event;

    protected readonly onDidRemoveWidgetEmitter = new Emitter<[Widget, Window]>();
    /** Subscribe to get notified when a widget is removed from this handler, i.e. the widget's window was closed or the widget was disposed. */
    readonly onDidRemoveWidget = this.onDidRemoveWidgetEmitter.event;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(SecondaryWindowService)
    protected readonly secondaryWindowService: SecondaryWindowService;

    @inject(NativeTabDragService)
    protected readonly nativeTabDragService: NativeTabDragService;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(WindowFocusService)
    protected readonly windowFocusService: WindowFocusService;

    /**
     * The secondary windows that are being restored, see {@link setLayoutData}, and have not been loaded yet.
     * Their widgets are not tracked yet, so they are stored with the layout as they were restored.
     */
    protected readonly pendingWindows = new Map<Window, SecondaryWindowHandler.LayoutData>();

    /** @returns List of widgets in secondary windows. */
    get widgets(): ReadonlyArray<Widget> {
        // Create new array in case the original changes while this is used.
        return [...this._widgets];
    }

    /**
     * Sets up message forwarding from the main window to secondary windows.
     * Does nothing if this service has already been initialized.
     *
     * @param shell The `ApplicationShell` that widgets will be moved out from.
     * @param dockPanelRendererFactory A factory function to create a `DockPanelRenderer` for use in secondary windows.
     */
    init(shell: ApplicationShell, dockPanelRendererFactory: (document?: Document | ShadowRoot) => DockPanelRenderer): void {
        if (this.applicationShell) {
            // Already initialized
            return;
        }
        this.applicationShell = shell;
        this.dockPanelRendererFactory = dockPanelRendererFactory;

        this.secondaryWindowService.beforeWidgetRestore(([widget, window]) => this.removeWidget(widget, window));
        this.nativeTabDragService.onDidDropTab(({ title, window: target }) => this.focusDroppedWidget(title.owner, target));
    }

    /**
     * Focuses the window in which a tab has been dropped and the widget of the tab. The drag started in another window,
     * or outside of the main area, which keeps the focus otherwise.
     */
    protected focusDroppedWidget(widget: Widget, target: Window): void {
        if (widget.isDisposed) {
            return;
        }
        if (target === window) {
            this.windowService.focus();
            this.applicationShell.activateWidget(widget.id);
        } else {
            this.secondaryWindowService.focus(target);
            widget.activate();
        }
    }

    /**
     *  Moves the given widget to a new window.
     *
     * @param widget the widget to extract
     * @param options optional options for the created window, e.g. its screen position
     */
    moveWidgetToSecondaryWindow(widget: ExtractableWidget, options?: SecondaryWindowOptions): void {
        if (!this.applicationShell) {
            this.logger.error('Widget cannot be extracted because the WidgetExtractionHandler has not been initialized.');
            return;
        }
        if (!widget.isExtractable) {
            this.logger.error('Widget is not extractable.', widget.id);
            return;
        }

        // a widget that is moved from one secondary window to another one keeps the area to restore it to
        const previousArea = widget.secondaryWindow ? widget.previousArea : this.applicationShell.getAreaFor(widget);
        const opened = this.openSecondaryWindow(widget, options, (newWindow, rootWidget) => {
            this.onWillAddWidgetEmitter.fire([widget, newWindow]);

            widget.secondaryWindow = newWindow;
            widget.previousArea = previousArea;
            rootWidget.defaultRestoreArea = previousArea;
            rootWidget.addWidget(widget, () => {
                this.onWidgetRemove(widget, newWindow, rootWidget);
            });
            widget.show();
            widget.update();

            this.addWidget(widget, newWindow);
            widget.activate();
        });
        if (!opened) {
            this.messageService.error('The widget could not be moved to a secondary window because the window creation failed. Please make sure to allow popups.');
        }
    }

    /**
     * Opens a secondary window and sets up its root widget once the window has been loaded.
     *
     * @param widget the widget the window is created for, its label is used as the window title
     * @param options the options for the created window, e.g. its bounds
     * @param populate adds the widgets to the root widget of the loaded window
     * @param onDidFailToLoad called if the loaded window cannot host widgets, the window is closed then
     * @returns the created window or `undefined` if it could not be created
     */
    protected openSecondaryWindow(widget: ExtractableWidget, options: SecondaryWindowOptions | undefined,
        populate: (newWindow: Window, rootWidget: SecondaryWindowDockPanelWidget) => void, onDidFailToLoad?: (newWindow: Window) => void): Window | undefined {
        const newWindow = this.secondaryWindowService.createSecondaryWindow(widget, this.applicationShell, options);
        if (!newWindow) {
            return undefined;
        }

        const mainWindowTitle = document.title;

        newWindow.addEventListener('load', () => {
            this.keybindings.registerEventListeners(newWindow);
            // tabs dragged from other windows must not be dropped on the default drop targets of this window
            const tabDragRegistration = this.nativeTabDragService.installWindow(newWindow);
            newWindow.addEventListener('pagehide', () => tabDragRegistration.dispose());
            // Use the widget's title as the window title
            // Even if the widget's label were malicious, this should be safe against XSS because the HTML standard defines this is inserted via a text node.
            // See https://html.spec.whatwg.org/multipage/dom.html#document.title
            newWindow.document.title = `${widget.title.label} — ${mainWindowTitle}`;

            this.setupHtmlLanguageAttributes(newWindow.document.documentElement);

            const element = newWindow.document.getElementById('widget-host');
            if (!element) {
                this.logger.error('Could not find dom element to attach to in secondary window');
                newWindow.close();
                onDidFailToLoad?.(newWindow);
                return;
            }

            const rootWidget: SecondaryWindowDockPanelWidget = new SecondaryWindowDockPanelWidget(this.dockPanelFactory, this.dockPanelRendererFactory, this.onTabCloseRequested,
                newWindow, {
                canDropWidget: dropped => this.canDropInSecondaryWindow(dropped),
                onWillDropWidget: dropped => this.onWillDropInSecondaryWindow(dropped),
                onDidDropWidget: dropped => this.onDidDropInSecondaryWindow(dropped, newWindow, rootWidget)
            });
            rootWidget.addClass('secondary-widget-root');
            rootWidget.addClass('monaco-workbench'); // needed for compatility with VSCode styles
            Widget.attach(rootWidget, element);
            if (isSecondaryWindow(newWindow)) {
                newWindow.rootWidget = rootWidget;
            }
            // the window is closed already when the layout is stored on shutdown
            newWindow.addEventListener('pagehide', () => {
                rootWidget.closedBounds = this.getWindowBounds(newWindow);
            });

            populate(newWindow, rootWidget);

            // debounce to avoid rapid updates while resizing the secondary window
            const updateWidget = debounce(() => {
                rootWidget.update();
            }, 100);
            newWindow.addEventListener('resize', () => {
                updateWidget();
            });
        });
        return newWindow;
    }

    /**
     * @returns the bounds of the given window, the size as expected by `window.open`
     */
    protected getWindowBounds(win: Window): SecondaryWindowHandler.WindowBounds {
        // Electron applies the size given to `window.open` to the window, browsers apply it to the content
        return environment.electron.is()
            ? { x: win.screenX, y: win.screenY, width: win.outerWidth, height: win.outerHeight }
            : { x: win.screenX, y: win.screenY, width: win.innerWidth, height: win.innerHeight };
    }

    /**
     * @returns the data to restore the open secondary windows with their widgets, see {@link setLayoutData}
     */
    getLayoutData(): SecondaryWindowHandler.LayoutData[] {
        const rootWidgets = new Set<SecondaryWindowDockPanelWidget>();
        for (const widget of this._widgets) {
            const rootWidget = extractSecondaryWindowRootWidget(widget);
            if (rootWidget instanceof SecondaryWindowDockPanelWidget) {
                rootWidgets.add(rootWidget);
            }
        }
        const openWindows: SecondaryWindowHandler.LayoutData[] = Array.from(rootWidgets, rootWidget => ({
            bounds: rootWidget.secondaryWindow.closed ? rootWidget.closedBounds : this.getWindowBounds(rootWidget.secondaryWindow),
            config: rootWidget.saveLayout(),
            restoreAreas: rootWidget.getLayoutWidgets().map(widget =>
                (ExtractableWidget.is(widget) ? widget.previousArea : undefined) ?? rootWidget.defaultRestoreArea ?? 'main')
        }));
        return [...openWindows, ...this.pendingWindows.values()];
    }

    /**
     * Opens secondary windows with the widgets of the given layout data, see {@link getLayoutData}.
     * The widgets are added to the main window instead if the `window.restoreSecondaryWindows` preference is disabled,
     * or if their window cannot be opened, e.g. because a browser blocks the popup.
     */
    async setLayoutData(layoutData: SecondaryWindowHandler.LayoutData[]): Promise<void> {
        if (!this.applicationShell) {
            this.logger.error('Secondary windows cannot be restored because the SecondaryWindowHandler has not been initialized.');
            return;
        }
        // the layout may be restored before the preferences have been loaded
        await this.preferenceService.ready;
        const openWindows = this.preferenceService.get('window.restoreSecondaryWindows', true);
        for (const data of layoutData) {
            this.restoreSecondaryWindow(data, openWindows);
        }
    }

    protected restoreSecondaryWindow(data: SecondaryWindowHandler.LayoutData, openWindow: boolean): void {
        const { bounds, config, restoreAreas } = data;
        const widgets = this.collectLayoutWidgets(config.main);
        // widgets that could not be stored or restored are missing from the layout, the areas cannot be matched with the widgets then
        const previousArea = new Map<Widget, ApplicationShell.Area>();
        if (restoreAreas?.length === widgets.length) {
            widgets.forEach((widget, i) => previousArea.set(widget, restoreAreas[i]));
        }
        const getPreviousArea = (widget: Widget) => previousArea.get(widget) ?? 'main';
        // widgets that have been added elsewhere in the meantime are not moved
        const isAvailable = (widget: Widget) => !widget.parent && !widget.isDisposed;
        const addToMainWindow = () => {
            for (const widget of widgets.filter(isAvailable)) {
                this.applicationShell.addWidget(widget, { area: SecondaryWindowHandler.getMainWindowArea(getPreviousArea(widget)) });
            }
        };

        const extractable = widgets.find(widget => isAvailable(widget) && ExtractableWidget.is(widget) && widget.isExtractable) as ExtractableWidget | undefined;
        const options: SecondaryWindowOptions | undefined = bounds && { position: { x: bounds.x, y: bounds.y }, size: { width: bounds.width, height: bounds.height } };
        const opened = openWindow && extractable && this.openSecondaryWindow(extractable, options, (newWindow, rootWidget) => {
            this.pendingWindows.delete(newWindow);
            this.removeFromLayout(config.main, isAvailable);
            const windowWidgets = this.collectLayoutWidgets(config.main);
            if (windowWidgets.length === 0) {
                newWindow.close();
                return;
            }
            rootWidget.defaultRestoreArea = getPreviousArea(windowWidgets[0]);
            for (const widget of windowWidgets) {
                this.onWillAddWidgetEmitter.fire([widget, newWindow]);
                if (ExtractableWidget.is(widget)) {
                    widget.secondaryWindow = newWindow;
                    widget.previousArea = getPreviousArea(widget);
                }
                rootWidget.track(widget, () => {
                    this.onWidgetRemove(widget, newWindow, rootWidget);
                });
            }
            rootWidget.restoreLayout(config);
            for (const widget of windowWidgets) {
                this.addWidget(widget, newWindow);
            }
        }, newWindow => {
            this.pendingWindows.delete(newWindow);
            addToMainWindow();
        });
        if (opened) {
            this.pendingWindows.set(opened, data);
            // the window may be closed before it has been populated, its widgets would not be shown anywhere then
            const closeListener = this.secondaryWindowService.onWindowClosed(closed => {
                if (closed === opened) {
                    closeListener.dispose();
                    if (this.pendingWindows.delete(opened)) {
                        addToMainWindow();
                    }
                }
            });
        } else {
            addToMainWindow();
        }
    }

    protected collectLayoutWidgets(area: DockLayout.AreaConfig | null): Widget[] {
        if (!area) {
            return [];
        }
        if (area.type === 'tab-area') {
            return [...area.widgets];
        }
        return area.children.flatMap(child => this.collectLayoutWidgets(child));
    }

    /**
     * Removes the widgets that do not match the given predicate from the given layout. Empty areas are removed when the layout is restored.
     */
    protected removeFromLayout(area: DockLayout.AreaConfig | null, keep: (widget: Widget) => boolean): void {
        if (!area) {
            return;
        }
        if (area.type === 'tab-area') {
            const current = area.widgets[area.currentIndex];
            area.widgets = area.widgets.filter(keep);
            area.currentIndex = Math.max(0, area.widgets.indexOf(current));
        } else {
            area.children.forEach(child => this.removeFromLayout(child, keep));
        }
    }

    protected setupHtmlLanguageAttributes(element: HTMLElement): void {
        nls.setHtmlLang(element);
        nls.setHtmlNoTranslate(element);
    }

    /**
     * Moves the given widget from its secondary window back to the main window.
     * The secondary window is closed once it does not contain any widgets anymore.
     *
     * @param widget the widget to move back
     */
    async moveWidgetToMainWindow(widget: Widget): Promise<void> {
        if (!this.applicationShell) {
            this.logger.error('Widget cannot be moved back because the WidgetExtractionHandler has not been initialized.');
            return;
        }
        const secondaryWindow = extractSecondaryWindow(widget);
        if (!secondaryWindow) {
            this.logger.error('Widget is not contained in a secondary window.', widget.id);
            return;
        }
        await this.secondaryWindowService.restoreWidget(widget, secondaryWindow, this.applicationShell);
    }

    /**
     * Moves all widgets of the given secondary window back to the main window, which closes the secondary window.
     *
     * @param secondaryWindow the window to move the widgets from
     */
    async moveAllWidgetsToMainWindow(secondaryWindow: Window): Promise<void> {
        // copy, as moving a widget back removes it from the secondary window's widgets
        for (const widget of [...getAllWidgetsFromSecondaryWindow(secondaryWindow) ?? []]) {
            await this.moveWidgetToMainWindow(widget);
        }
    }

    /**
     * Only widgets that can be moved to secondary windows, or that are in a secondary window already, can be dropped on secondary windows.
     */
    protected canDropInSecondaryWindow(widget: Widget): boolean {
        return ExtractableWidget.is(widget) || this._widgets.includes(widget);
    }

    protected onWillDropInSecondaryWindow(widget: Widget): void {
        if (ExtractableWidget.is(widget) && widget.secondaryWindow === undefined) {
            // the widget is still in the main window
            widget.previousArea = this.applicationShell.getAreaFor(widget);
        }
    }

    protected onDidDropInSecondaryWindow(widget: Widget, secondaryWindow: Window, rootWidget: SecondaryWindowDockPanelWidget): void {
        // the widget is part of the window's dock panel already, but not tracked yet
        this.onWillAddWidgetEmitter.fire([widget, secondaryWindow]);
        if (ExtractableWidget.is(widget)) {
            widget.secondaryWindow = secondaryWindow;
        }
        rootWidget.track(widget, () => {
            this.onWidgetRemove(widget, secondaryWindow, rootWidget);
        });
        this.addWidget(widget, secondaryWindow);
    }

    private onWidgetRemove(widget: Widget, newWindow: Window, rootWidget: SecondaryWindowRootWidget): void {
        // Widgets moved back to the main window have already been removed via `beforeWidgetRestore`
        if (this._widgets.includes(widget)) {
            this.onWillRemoveWidgetEmitter.fire([widget, newWindow]);
            this.removeWidget(widget, newWindow);
        }
        // A widget dropped on another window is assigned to that window once it has been added there
        if (ExtractableWidget.is(widget) && widget.secondaryWindow === newWindow) {
            widget.secondaryWindow = undefined;
        }
        // Close the window if the widget is disposed, e.g. by a command closing all widgets, or the last widget was moved away.
        if (!newWindow.closed && rootWidget.widgets.length === 0) {
            // Close asynchronously, as the widget may have been dragged away by a drag that started in this window
            setTimeout(() => {
                if (!newWindow.closed && rootWidget.widgets.length === 0) {
                    newWindow.close();
                }
            });
        }
    }

    addWidgetToSecondaryWindow(widget: Widget, secondaryWindow: Window, options?: TheiaDockPanel.AddOptions): void {
        const rootWidget = isSecondaryWindow(secondaryWindow) ? secondaryWindow.rootWidget : undefined;
        if (!rootWidget) {
            this.logger.error('Given secondary window no known root.');
            return;
        }

        // we allow to add any widget to an existing secondary window unless it is marked as not extractable or is already extracted
        if (ExtractableWidget.is(widget)) {
            if (!widget.isExtractable) {
                this.logger.error('Widget is not extractable.', widget.id);
                return;
            }
            if (widget.secondaryWindow !== undefined) {
                this.logger.error('Widget is extracted already.', widget.id);
                return;
            }
            widget.secondaryWindow = secondaryWindow;
            widget.previousArea = this.applicationShell.getAreaFor(widget);
        }

        rootWidget.addWidget(widget, () => {
            this.onWidgetRemove(widget, secondaryWindow, rootWidget);
        }, options);
        widget.show();
        widget.update();
        this.addWidget(widget, secondaryWindow);
        widget.activate();
    }

    onTabCloseRequested(_sender: TabBar<Widget>, _args: TabBar.ITabCloseRequestedArgs<Widget>): boolean {
        // return false to keep default behavior
        // override this method if you want to move tabs back instead of closing them
        return false;
    }

    /**
     * If the given widget is tracked by this handler, activate it and focus its secondary window.
     *
     * @param widgetId The widget to activate specified by its id
     * @returns The activated `ExtractableWidget` or `undefined` if the given widget id is unknown to this handler.
     */
    activateWidget(widgetId: string): ExtractableWidget | Widget | undefined {
        const trackedWidget = this.revealWidget(widgetId);
        trackedWidget?.activate();
        return trackedWidget;
    }

    /**
     * If the given widget is tracked by this handler, reveal it by focussing its secondary window.
     *
     * @param widgetId The widget to reveal specified by its id
     * @returns The revealed `ExtractableWidget` or `undefined` if the given widget id is unknown to this handler.
     */
    revealWidget(widgetId: string): ExtractableWidget | Widget | undefined {
        const trackedWidget = this._widgets.find(w => w.id === widgetId);
        if (trackedWidget && this.getFocusedWindow()) {
            if (ExtractableWidget.is(trackedWidget)) {
                this.secondaryWindowService.focus(trackedWidget.secondaryWindow!);
                return trackedWidget;
            } else {
                const window = extractSecondaryWindow(trackedWidget);
                if (window) {
                    this.secondaryWindowService.focus(window);
                    return trackedWidget;
                }
            }
        }
        return undefined;
    }

    getFocusedWindow(): Window | undefined {
        return this.windowFocusService.focusedWindow;
    }

    protected addWidget(widget: Widget, win: Window): void {
        if (!this._widgets.includes(widget)) {
            this._widgets.push(widget);
            this.onDidAddWidgetEmitter.fire([widget, win]);
        }
    }

    protected removeWidget(widget: Widget, win: Window): void {
        const index = this._widgets.indexOf(widget);
        if (index > -1) {
            this._widgets.splice(index, 1);
            this.onDidRemoveWidgetEmitter.fire([widget, win]);
        }
    }

    getTabBarFor(widget: Widget): TabBar<Widget> | undefined {
        const secondaryWindowRootWidget = extractSecondaryWindowRootWidget(widget);
        if (secondaryWindowRootWidget && secondaryWindowRootWidget.getTabBar) {
            return secondaryWindowRootWidget.getTabBar(widget);
        }
        return undefined;
    }

}

export namespace SecondaryWindowHandler {
    /**
     * The screen bounds of a secondary window.
     */
    export interface WindowBounds {
        x: number;
        y: number;
        width: number;
        height: number;
    }

    /**
     * Data to save and restore a secondary window with its widgets.
     */
    export interface LayoutData {
        bounds?: WindowBounds;
        /** The layout of the window's dock panel */
        config: DockPanel.ILayoutConfig;
        /** The areas of the main window to move the widgets of `config` back to, in the order of the widgets in `config` */
        restoreAreas?: ApplicationShell.Area[];
    }

    /**
     * @returns the area of the main window to move a widget back to whose previous area is the given one
     */
    export function getMainWindowArea(previousArea: ApplicationShell.Area | undefined): ApplicationShell.Area {
        return previousArea === undefined || previousArea === 'top' || previousArea === 'secondaryWindow' ? 'main' : previousArea;
    }
}

export function getDefaultRestoreArea(window: Window): ApplicationShell.Area | undefined {
    if (isSecondaryWindow(window) && window.rootWidget !== undefined) {
        return window.rootWidget.defaultRestoreArea;
    }
    return undefined;
}

export function getAllWidgetsFromSecondaryWindow(window: Window): ReadonlyArray<Widget> | undefined {
    if (isSecondaryWindow(window) && window.rootWidget !== undefined) {
        return window.rootWidget.widgets;
    }
    return undefined;
}

export function extractSecondaryWindowRootWidget(widget: Widget | undefined | null): SecondaryWindowRootWidget | undefined {
    if (!widget) {
        return undefined;
    }
    //  check two levels of parent hierarchy, usually a root widget would have nested layout widget
    if (widget.parent instanceof SecondaryWindowRootWidget) {
        return widget.parent;
    }
    if (widget.parent?.parent instanceof SecondaryWindowRootWidget) {
        return widget.parent.parent;
    }
}

export function extractSecondaryWindow(widget: Widget | undefined | null): Window | undefined {
    if (!widget) {
        return undefined;
    }
    if (ExtractableWidget.is(widget)) {
        return widget.secondaryWindow;
    }
    if (widget instanceof SecondaryWindowRootWidget) {
        return widget.secondaryWindow;
    }
    const secondaryWindowRootWidget = extractSecondaryWindowRootWidget(widget);
    if (secondaryWindowRootWidget) {
        return secondaryWindowRootWidget.secondaryWindow;
    }

    return undefined;
}
