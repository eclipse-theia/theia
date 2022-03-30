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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import debounce = require('lodash.debounce');
import { inject, injectable } from 'inversify';
import { BoxLayout, BoxPanel, ExtractableWidget, Widget } from './widgets';
import { MessageService } from '../common/message-service';
import { ApplicationShell } from './shell/application-shell';
import { Emitter } from '../common/event';

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
 */
@injectable()
export class SecondaryWindowHandler {
    /** List of currently open secondary windows. Window references should be removed once the window is closed. */
    protected readonly secondaryWindows: Window[] = [];
    /** List of widgets in secondary windows. */
    protected readonly _widgets: Widget[] = [];

    /**
     * Randomized prefix to be included in opened windows' ids.
     * This avoids conflicts when creating sub-windows from multiple theia instances (e.g. by opening Theia multiple times in the same browser)
     */
    protected readonly prefix = crypto.getRandomValues(new Uint16Array(1))[0];

    protected applicationShell: ApplicationShell;

    protected readonly onDidAddWidgetEmitter = new Emitter<Widget>();
    /** Subscribe to get notified when a widget is added to this handler, i.e. the widget was moved to an secondary window . */
    readonly onDidAddWidget = this.onDidAddWidgetEmitter.event;

    protected readonly onDidRemoveWidgetEmitter = new Emitter<Widget>();
    /** Subscribe to get notified when a widget is removed from this handler, i.e. the widget's window was closed or the widget was disposed. */
    readonly onDidRemoveWidget = this.onDidRemoveWidgetEmitter.event;

    constructor(@inject(MessageService) protected readonly messageService: MessageService) { }

    /** @returns List of widgets in secondary windows. */
    get widgets(): ReadonlyArray<Widget> {
        // Create new array in case the original changes while this is used.
        return [...this._widgets];
    }

    /**
     * Sets up message forwarding from the main window to secondary windows.
     * Does nothing if this service has already been initialized.
     *
     * @param shell The `ApplicationShell` that widgets will be externalized from.
     */
    init(shell: ApplicationShell): void {
        if (this.applicationShell) {
            // Already initialized
            return;
        }
        this.applicationShell = shell;

        // Set up messaging with secondary windows
        window.addEventListener('message', (event: MessageEvent) => {
            console.trace('Message on main window', event);
            if (event.data.fromExternal) {
                console.trace('Message comes from secondary window');
                return;
            }
            if (event.data.fromMain) {
                console.trace('Message has mainWindow marker, therefore ignore it');
                return;
            }

            // Filter setImmediate messages. Do not log because these come in with very high frequency.
            if (typeof event.data === 'string' && event.data.startsWith('setImmediate')) {
                return;
            }

            console.trace('Delegate main window message to secondary windows', event);
            this.secondaryWindows.forEach(secondaryWindow => {
                if (!secondaryWindow.window.closed) {
                    secondaryWindow.window.postMessage({ ...event.data, fromMain: true }, '*');
                }
            });
        });
    }

    /**
     *  Moves the given widget to a new window.
     *
     * __Note__: This method is only be supposed to be called from the application shell.
     *
     * @param widget the widget to extract
     */
    moveWidgetToSecondaryWindow(widget: ExtractableWidget): void {
        if (!this.applicationShell) {
            console.error('Widget cannot be extracted because the WidgetExtractionHandler has not been initialized.');
            return;
        }
        if (!widget.isExtractable) {
            console.warn('Widget is not extractable.', widget.id);
            return;
        }

        // secondary-window.html is part of Theia's generated code. It is generated by dev-packages/application-manager/src/generator/frontend-generator.ts
        const newWindow = window.open('secondary-window.html', `${this.prefix}-subwindow${this.secondaryWindows.length}`, 'popup');

        if (!newWindow) {
            this.messageService.error('The widget could not be moved to a secondary window because the window creation failed. Please make sure to allow popus.');
            return;
        }

        this.secondaryWindows.push(newWindow);

        newWindow.onload = () => {
            // Use the widget's title as the window title
            // Even if the widget's label were malicious, this should be safe against XSS because the HTML standard defines this is inserted via a text node.
            // See https://stackoverflow.com/a/61435099 and https://html.spec.whatwg.org/multipage/dom.html#document.title
            newWindow.document.title = widget.title.label;

            const element = newWindow.document.getElementById('pwidget');
            if (!element) {
                console.error('Could not find dom element to attach to in secondary window');
                return;
            }

            widget.secondaryWindow = newWindow;
            const rootWidget = new SecondaryWindowRootWidget();
            Widget.attach(rootWidget, element);
            rootWidget.addWidget(widget);
            widget.update();

            this.addWidget(widget);

            // Close widget and remove window from this handler when the window is closed.
            newWindow.addEventListener('beforeunload', () => {
                this.applicationShell.closeWidget(widget.id);
                const extIndex = this.secondaryWindows.indexOf(newWindow);
                if (extIndex > -1) {
                    this.secondaryWindows.splice(extIndex, 1);
                }
            });

            // Close the window if the widget is disposed, e.g. by a command closing all widgets.
            widget.disposed.connect(() => {
                this.removeWidget(widget);
                if (!newWindow.closed) {
                    newWindow.close();
                }
            });

            // debounce to avoid rapid updates while resizing the secondary window
            const updateWidget = debounce(widget.update.bind(widget), 100);
            newWindow.addEventListener('resize', () => updateWidget());
        };
    }

    protected addWidget(widget: Widget): void {
        if (!this._widgets.includes(widget)) {
            this._widgets.push(widget);
            this.onDidAddWidgetEmitter.fire(widget);
        }
    }

    protected removeWidget(widget: Widget): void {
        const index = this._widgets.indexOf(widget);
        if (index > -1) {
            this._widgets.splice(index, 1);
            this.onDidRemoveWidgetEmitter.fire(widget);
        }
    }
}
