/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, postConstruct, injectable } from 'inversify';
import { Widget, FocusTracker } from '@phosphor/widgets';
import URI from '../common/uri';
import { MaybePromise, Emitter, Event } from '../common';
import { BaseWidget } from './widgets';
import { ApplicationShell } from './shell';
import { OpenHandler, OpenerOptions } from './opener-service';
import { WidgetManager } from './widget-manager';

export type WidgetOpenMode = 'open' | 'reveal' | 'activate';

export interface WidgetOpenerOptions extends OpenerOptions {
    /**
     * Whether the widget should be only opened, revealed or activated.
     * By default is `activate`.
     */
    mode?: WidgetOpenMode;
    /**
     * Specify how an opened widget should be added to the shell.
     * By default to the main area.
     */
    widgetOptions?: ApplicationShell.WidgetOptions;
}

@injectable()
export abstract class WidgetOpenHandler<W extends BaseWidget> implements OpenHandler {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    protected readonly onCreatedEmitter = new Emitter<W>();
    /**
     * Emit when a new widget is created.
     */
    readonly onCreated: Event<W> = this.onCreatedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
            if (factoryId === this.id) {
                this.onCreatedEmitter.fire(widget as W);
            }
        });
    }

    /**
     * The widget open handler id.
     *
     * #### Implementation
     * - A widget factory for this id should be registered.
     * - Subclasses should not implement `WidgetFactory`
     * to avoid exposing capabilities to create a widget outside of `WidgetManager`.
     */
    abstract readonly id: string;
    abstract canHandle(uri: URI, options?: WidgetOpenerOptions): MaybePromise<number>;

    /**
     * Open a widget for the given uri and options.
     * Reject if the given options is not an widget options or a widget cannot be opened.
     */
    async open(uri: URI, options?: WidgetOpenerOptions): Promise<W> {
        const widget = await this.getOrCreateWidget(uri, options);
        await this.doOpen(widget, options);
        return widget;
    }
    protected async doOpen(widget: W, options?: WidgetOpenerOptions): Promise<void> {
        const op: WidgetOpenerOptions = {
            mode: 'activate',
            ...options
        };
        if (!widget.isAttached) {
            this.shell.addWidget(widget, op.widgetOptions || { area: 'main' });
        }
        const promises: Promise<void>[] = [];
        if (op.mode === 'activate') {
            promises.push(this.onActive(widget));
            promises.push(this.onReveal(widget));
            this.shell.activateWidget(widget.id);
        } else if (op.mode === 'reveal') {
            promises.push(this.onReveal(widget));
            this.shell.revealWidget(widget.id);
        }
        await Promise.all(promises);
    }
    protected onActive(widget: W): Promise<void> {
        if (this.shell.activeWidget === widget) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            const listener = (shell: ApplicationShell, args: FocusTracker.IChangedArgs<Widget>) => {
                if (args.newValue === widget) {
                    this.shell.activeChanged.disconnect(listener);
                    resolve();
                }
            };
            this.shell.activeChanged.connect(listener);
        });
    }
    protected onReveal(widget: W): Promise<void> {
        if (widget.isVisible) {
            return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
        }
        return new Promise(resolve => {
            const waitForVisible = () => window.requestAnimationFrame(() => {
                if (widget.isVisible) {
                    window.requestAnimationFrame(() => resolve());
                } else {
                    waitForVisible();
                }
            });
            waitForVisible();
        });
    }

    /**
     * Return an existing widget for the given uri.
     */
    getByUri(uri: URI): Promise<W | undefined> {
        return this.getWidget(uri);
    }

    /**
     * Return an existing widget for the given uri or creates a new one.
     *
     * It does not open a widget, use `open` instead.
     */
    getOrCreateByUri(uri: URI): Promise<W> {
        return this.getOrCreateWidget(uri);
    }

    /**
     * All opened widgets.
     */
    get all(): W[] {
        return this.widgetManager.getWidgets(this.id) as W[];
    }

    protected getWidget(uri: URI, options?: WidgetOpenerOptions): Promise<W | undefined> {
        const widgetOptions = this.createWidgetOptions(uri, options);
        return this.widgetManager.getWidget(this.id, widgetOptions) as Promise<W | undefined>;
    }

    protected getOrCreateWidget(uri: URI, options?: WidgetOpenerOptions): Promise<W> {
        const widgetOptions = this.createWidgetOptions(uri, options);
        return this.widgetManager.getOrCreateWidget(this.id, widgetOptions) as Promise<W>;
    }

    protected abstract createWidgetOptions(uri: URI, options?: WidgetOpenerOptions): Object;

}
