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
import { inject, injectable } from 'inversify';
import { BoxLayout, ExtractableWidget, TabBar, Widget } from './widgets';
import { MessageService } from '../common/message-service';
import { ApplicationShell, DockPanelRenderer, MAIN_AREA_CLASS, MAIN_BOTTOM_AREA_CLASS } from './shell/application-shell';
import { Emitter } from '../common/event';
import { isSecondaryWindow, SecondaryWindowRootWidget, SecondaryWindowService } from './window/secondary-window-service';
import { KeybindingRegistry } from './keybinding';
import { MAIN_AREA_ID, TheiaDockPanel } from './shell/theia-dock-panel';
import { nls } from '../common/nls';

/** Widgets to be contained inside a DockPanel in the secondary window. */
class SecondaryWindowDockPanelWidget extends SecondaryWindowRootWidget {

    protected _widgets: Widget[] = [];
    protected dockPanel: TheiaDockPanel;

    constructor(
        dockPanelFactory: TheiaDockPanel.Factory,
        dockPanelRendererFactory: (document?: Document | ShadowRoot) => DockPanelRenderer,
        closeHandler: (sender: TabBar<Widget>, args: TabBar.ITabCloseRequestedArgs<Widget>) => boolean,
        secondaryWindow: Window
    ) {
        super();
        this.secondaryWindow = secondaryWindow;
        const boxLayout = new BoxLayout();

        // reuse same tab bar classes and dock panel id as main window to inherit styling
        const renderer = dockPanelRendererFactory(secondaryWindow.document);
        renderer.tabBarClasses.push(MAIN_BOTTOM_AREA_CLASS);
        renderer.tabBarClasses.push(MAIN_AREA_CLASS);
        this.dockPanel = dockPanelFactory({
            disableDragAndDrop: true,
            closeHandler,
            mode: 'multiple-document',
            renderer,
        });
        this.dockPanel.id = MAIN_AREA_ID;
        BoxLayout.setStretch(this.dockPanel, 1);
        boxLayout.addWidget(this.dockPanel);
        this.layout = boxLayout;
    }

    override get widgets(): ReadonlyArray<Widget> {
        return this._widgets;
    }

    addWidget(widget: Widget, disposeCallback: () => void, options?: TheiaDockPanel.AddOptions): void {
        this._widgets.push(widget);
        this.dockPanel.addWidget(widget, options);

        widget.disposed.connect(() => {
            const index = this._widgets.indexOf(widget);
            if (index > -1) {
                this._widgets.splice(index, 1);
            }
            disposeCallback();
        });

        this.dockPanel.activateWidget(widget);
    }

    override getTabBar(widget: Widget): TabBar<Widget> | undefined {
        return this.dockPanel.findTabBar(widget.title);
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
    }

    /**
     *  Moves the given widget to a new window.
     *
     * @param widget the widget to extract
     */
    moveWidgetToSecondaryWindow(widget: ExtractableWidget): void {
        if (!this.applicationShell) {
            console.error('Widget cannot be extracted because the WidgetExtractionHandler has not been initialized.');
            return;
        }
        if (!widget.isExtractable) {
            console.error('Widget is not extractable.', widget.id);
            return;
        }

        const newWindow = this.secondaryWindowService.createSecondaryWindow(widget, this.applicationShell);

        if (!newWindow) {
            this.messageService.error('The widget could not be moved to a secondary window because the window creation failed. Please make sure to allow popups.');
            return;
        }

        const mainWindowTitle = document.title;

        newWindow.addEventListener('load', () => {
            this.keybindings.registerEventListeners(newWindow);
            // Use the widget's title as the window title
            // Even if the widget's label were malicious, this should be safe against XSS because the HTML standard defines this is inserted via a text node.
            // See https://html.spec.whatwg.org/multipage/dom.html#document.title
            newWindow.document.title = `${widget.title.label} — ${mainWindowTitle}`;

            this.setupHtmlLanguageAttributes(newWindow.document.documentElement);

            const element = newWindow.document.getElementById('widget-host');
            if (!element) {
                console.error('Could not find dom element to attach to in secondary window');
                return;
            }

            this.onWillAddWidgetEmitter.fire([widget, newWindow]);

            widget.secondaryWindow = newWindow;
            widget.previousArea = this.applicationShell.getAreaFor(widget);
            const rootWidget: SecondaryWindowRootWidget = new SecondaryWindowDockPanelWidget(this.dockPanelFactory, this.dockPanelRendererFactory, this.onTabCloseRequested,
                newWindow);
            rootWidget.defaultRestoreArea = widget.previousArea;
            rootWidget.addClass('secondary-widget-root');
            rootWidget.addClass('monaco-workbench'); // needed for compatility with VSCode styles
            Widget.attach(rootWidget, element);
            if (isSecondaryWindow(newWindow)) {
                newWindow.rootWidget = rootWidget;
            }
            rootWidget.addWidget(widget, () => {
                this.onWidgetRemove(widget, newWindow, rootWidget);
            });
            widget.show();
            widget.update();

            this.addWidget(widget, newWindow);

            // debounce to avoid rapid updates while resizing the secondary window
            const updateWidget = debounce(() => {
                rootWidget.update();
            }, 100);
            newWindow.addEventListener('resize', () => {
                updateWidget();
            });
            widget.activate();
        });
    }

    protected setupHtmlLanguageAttributes(element: HTMLElement): void {
        nls.setHtmlLang(element);
        nls.setHtmlNoTranslate(element);
    }

    private onWidgetRemove(widget: Widget, newWindow: Window, rootWidget: SecondaryWindowRootWidget): void {
        // Close the window if the widget is disposed, e.g. by a command closing all widgets.
        this.onWillRemoveWidgetEmitter.fire([widget, newWindow]);
        this.removeWidget(widget, newWindow);
        if (!newWindow.closed && rootWidget.widgets.length === 0) {
            // no remaining widgets in window -> close the window
            newWindow.close();
        }

    }

    addWidgetToSecondaryWindow(widget: Widget, secondaryWindow: Window, options?: TheiaDockPanel.AddOptions): void {
        const rootWidget = isSecondaryWindow(secondaryWindow) ? secondaryWindow.rootWidget : undefined;
        if (!rootWidget) {
            console.error('Given secondary window no known root.');
            return;
        }

        // we allow to add any widget to an existing secondary window unless it is marked as not extractable or is already extracted
        if (ExtractableWidget.is(widget)) {
            if (!widget.isExtractable) {
                console.error('Widget is not extractable.', widget.id);
                return;
            }
            if (widget.secondaryWindow !== undefined) {
                console.error('Widget is extracted already.', widget.id);
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
        return window.document.hasFocus() ? window : this.secondaryWindowService.getWindows().find(candidate => candidate.document.hasFocus());
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
