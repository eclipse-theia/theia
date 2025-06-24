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
import { BoxLayout, BoxPanel, ExtractableWidget, Widget } from './widgets';
import { MessageService } from '../common/message-service';
import { ApplicationShell } from './shell/application-shell';
import { Emitter } from '../common/event';
import { SecondaryWindowService } from './window/secondary-window-service';
import { KeybindingRegistry } from './keybinding';

/** Widget to be contained directly in a secondary window. */
class SecondaryWindowRootWidget extends Widget {

    constructor() {
        super();
        this.layout = new BoxLayout();
    }

    addWidget(widget: Widget): void {
        (this.layout as BoxLayout).addWidget(widget);
        BoxPanel.setStretch(widget, 1);
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
    protected readonly _widgets: ExtractableWidget[] = [];

    protected applicationShell: ApplicationShell;

    @inject(KeybindingRegistry)
    protected keybindings: KeybindingRegistry;

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
     */
    init(shell: ApplicationShell): void {
        if (this.applicationShell) {
            // Already initialized
            return;
        }
        this.applicationShell = shell;
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

            const element = newWindow.document.getElementById('widget-host');
            if (!element) {
                console.error('Could not find dom element to attach to in secondary window');
                return;
            }

            this.onWillAddWidgetEmitter.fire([widget, newWindow]);

            widget.secondaryWindow = newWindow;
            const rootWidget = new SecondaryWindowRootWidget();
            rootWidget.addClass('secondary-widget-root');
            rootWidget.addClass('monaco-workbench'); // needed for compatility with VSCode styles
            Widget.attach(rootWidget, element);
            rootWidget.addWidget(widget);
            widget.show();
            widget.update();

            this.addWidget(widget, newWindow);

            // Close the window if the widget is disposed, e.g. by a command closing all widgets.
            widget.disposed.connect(() => {
                this.onWillRemoveWidgetEmitter.fire([widget, newWindow]);
                this.removeWidget(widget, newWindow);
                if (!newWindow.closed) {
                    newWindow.close();
                }
            });

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

    /**
     * If the given widget is tracked by this handler, activate it and focus its secondary window.
     *
     * @param widgetId The widget to activate specified by its id
     * @returns The activated `ExtractableWidget` or `undefined` if the given widget id is unknown to this handler.
     */
    activateWidget(widgetId: string): ExtractableWidget | undefined {
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
    revealWidget(widgetId: string): ExtractableWidget | undefined {
        const trackedWidget = this._widgets.find(w => w.id === widgetId);
        if (trackedWidget && this.getFocusedWindow()) {
            this.secondaryWindowService.focus(trackedWidget.secondaryWindow!);
        }
        return trackedWidget;
    }

    getFocusedWindow(): Window | undefined {
        return window.document.hasFocus() ? window : this.secondaryWindowService.getWindows().find(candidate => candidate.document.hasFocus());
    }

    protected addWidget(widget: ExtractableWidget, win: Window): void {
        if (!this._widgets.includes(widget)) {
            this._widgets.push(widget);
            this.onDidAddWidgetEmitter.fire([widget, win]);
        }
    }

    protected removeWidget(widget: ExtractableWidget, win: Window): void {
        const index = this._widgets.indexOf(widget);
        if (index > -1) {
            this._widgets.splice(index, 1);
            this.onDidRemoveWidgetEmitter.fire([widget, win]);
        }
    }
}
