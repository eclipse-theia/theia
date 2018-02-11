/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-any

import { inject, postConstruct, injectable } from "inversify";
import URI from "../common/uri";
import { MaybePromise, Emitter, Event } from "../common";
import { BaseWidget } from "./widgets";
import { ApplicationShell } from "./shell";
import { OpenHandler, OpenerOptions } from "./opener-service";
import { WidgetManager } from "./widget-manager";

export interface WidgetOpenerOptions extends OpenerOptions {
    /**
     * Test whether an opened widget should be revealed.
     * By default is `true`.
     */
    reveal?: boolean
    /**
     * Test whether an opened widget should be activated.
     * By default is `true`.
     */
    activate?: boolean
    /**
     * Specify how an opened widget should be added to the shell.
     * By default to the main area.
     */
    widgetOptions?: ApplicationShell.WidgetOptions;
}

export interface WidgetConstructor<W extends BaseWidget> {
    new(...args: any[]): W;
}

@injectable()
export abstract class WidgetOpenHandler<W extends BaseWidget> implements OpenHandler {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    protected readonly onActiveChangedEmitter = new Emitter<W | undefined>();
    /**
     * Emit when the active widget is changed.
     */
    readonly onActiveChanged: Event<W | undefined> = this.onActiveChangedEmitter.event;

    protected readonly onCurrentChangedEmitter = new Emitter<W | undefined>();
    /**
     * Emit when the current widget is changed.
     */
    readonly onCurrentChanged: Event<W | undefined> = this.onCurrentChangedEmitter.event;

    protected readonly onCreatedEmitter = new Emitter<W>();
    /**
     * Emit when a new widget is created.
     */
    readonly onCreated: Event<W> = this.onCreatedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.shell.activeChanged.connect(() => this.updateActive());
        this.shell.currentChanged.connect(() => this.updateCurrent());
        this.widgetManager.onDidCreateWidget(({ factoryId, widget }) => {
            if (factoryId === this.id && widget instanceof this.widgetConstructor) {
                widget.disposed.connect(() => this.updateCurrent());
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
    protected readonly abstract widgetConstructor: WidgetConstructor<W>;

    /**
     * All opened widgets.
     */
    get all(): W[] {
        return this.widgetManager.getWidgets(this.id) as W[];
    }

    protected _active: W | undefined;
    /**
     * The active widget.
     */
    get active(): W | undefined {
        return this._active;
    }
    protected setActive(active: W | undefined): void {
        if (this._active !== active) {
            this._active = active;
            this.onActiveChangedEmitter.fire(this._active);
        }
    }
    protected updateActive(): void {
        const widget = this.shell.activeWidget;
        if (widget instanceof this.widgetConstructor) {
            this.setActive(widget as W);
        }
    }

    protected _current: W | undefined;
    /**
     * The most recently activated widget.
     */
    get current(): W | undefined {
        return this._current;
    }
    protected setCurrent(current: W | undefined): void {
        if (this._current !== current) {
            this._current = current;
            this.onCurrentChangedEmitter.fire(this._current);
        }
    }
    protected updateCurrent(): void {
        const widget = this.shell.currentWidget;
        if (widget instanceof this.widgetConstructor) {
            this.setCurrent(widget as W);
        } else if (!this._current || !this._current.isVisible) {
            this.setCurrent(undefined);
        }
    }

    protected readonly defaultPriority = 100;
    canHandle(uri: URI, options?: WidgetOpenerOptions): MaybePromise<number> {
        return this.defaultPriority;
    }

    /**
     * Open a widget for the given uri and options.
     * Reject if the given options is not an widget options or a widget cannot be opened.
     */
    async open(uri: URI, options?: WidgetOpenerOptions): Promise<W> {
        const widget = await this.getOrCreateWidget(uri, options);
        this.doOpen(widget, options);
        return widget;
    }
    protected doOpen(widget: W, options?: WidgetOpenerOptions): void {
        const op: WidgetOpenerOptions = {
            reveal: true,
            activate: true,
            ...options
        };
        if (!widget.isAttached) {
            this.shell.addWidget(widget, op.widgetOptions || { area: 'main' });
        }
        if (op.activate) {
            this.shell.activateWidget(widget.id);
        } else if (op.reveal) {
            this.shell.revealWidget(widget.id);
        }
    }

    /**
     * Return an opened widget for the given uri.
     */
    getByUri(uri: URI): Promise<W | undefined> {
        return this.getWidget(uri);
    }

    protected getWidget(uri: URI, options?: WidgetOpenerOptions): Promise<W | undefined> {
        const widgetOptions = this.createWidgetOptions(uri, options);
        return this.widgetManager.getWidget(this.id, widgetOptions) as Promise<W | undefined>;
    }

    protected getOrCreateWidget(uri: URI, options?: WidgetOpenerOptions): Promise<W> {
        const widgetOptions = this.createWidgetOptions(uri, options);
        return this.widgetManager.getOrCreateWidget(this.id, widgetOptions) as Promise<W>;
    }

    protected createWidgetOptions(uri: URI, options?: WidgetOpenerOptions): Object {
        return uri.withoutFragment().toString();
    }

}
