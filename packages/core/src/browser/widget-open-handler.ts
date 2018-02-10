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
     * Emit when the active widget changed.
     */
    readonly onActiveChanged: Event<W | undefined> = this.onActiveChangedEmitter.event;

    protected readonly onCurrentChangedEmitter = new Emitter<W | undefined>();
    /**
     * Emit when the current widget changed.
     */
    readonly onCurrentChanged: Event<W | undefined> = this.onCurrentChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.shell.activeChanged.connect((_, arg) => {
            if (arg.newValue instanceof this.widgetConstructor || arg.oldValue instanceof this.widgetConstructor) {
                this.onActiveChangedEmitter.fire(this.current);
            }
        });
        this.shell.currentChanged.connect((_, arg) => {
            if (arg.newValue instanceof this.widgetConstructor || arg.oldValue instanceof this.widgetConstructor) {
                this.onCurrentChangedEmitter.fire(this.current);
            }
        });
    }

    /**
     * The widget opeh handler id.
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

    get active(): W | undefined {
        const widget = this.shell.activeWidget;
        if (widget instanceof this.widgetConstructor) {
            return widget as W;
        }
    }

    /**
     * The most recently activated widget.
     */
    get current(): W | undefined {
        const widget = this.shell.currentWidget;
        if (widget instanceof this.widgetConstructor) {
            return widget as W;
        }
    }

    canHandle(uri: URI, options?: WidgetOpenerOptions): MaybePromise<number> {
        return 100;
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

    protected getOrCreateWidget(uri: URI, options?: WidgetOpenerOptions): Promise<W> {
        const widgetOptions = this.createWidgetOptions(uri, options);
        return this.widgetManager.getOrCreateWidget(this.id, widgetOptions) as Promise<W>;
    }

    protected createWidgetOptions(uri: URI, options?: WidgetOpenerOptions): Object {
        return uri.withoutFragment().toString();
    }

}
