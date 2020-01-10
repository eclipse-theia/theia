/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { inject, named, injectable } from 'inversify';
import { Widget } from '@phosphor/widgets';
import { ILogger, Emitter, Event, ContributionProvider, MaybePromise } from '../common';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const WidgetFactory = Symbol('WidgetFactory');
/**
 * `OpenHandler` should be implemented to provide a new opener.
 */
export interface WidgetFactory {

    /**
     * The factory id.
     */
    readonly id: string;

    /**
     * Creates a widget and attaches it to the application shell.
     * @param options serializable JSON data.
     */
    createWidget(options?: any): MaybePromise<Widget>;
}

/**
 * Representation of the `WidgetConstructionOptions`.
 * Defines a serializable description to create widgets.
 */
export interface WidgetConstructionOptions {
    /**
     * The id of the widget factory to use.
     */
    factoryId: string,

    /**
     * The widget factory specific information.
     */
    options?: any
}

/**
 * Representation of a `didCreateWidgetEvent`.
 */
export interface DidCreateWidgetEvent {
    /**
     * The widget which was created.
     */
    readonly widget: Widget;
    /**
     * The widget factory id.
     */
    readonly factoryId: string;
}

/**
 * Creates and manages widgets.
 */
@injectable()
export class WidgetManager {

    protected _cachedFactories: Map<string, WidgetFactory>;
    protected readonly widgets = new Map<string, Widget>();
    protected readonly widgetPromises = new Map<string, MaybePromise<Widget>>();
    protected readonly pendingWidgetPromises = new Map<string, MaybePromise<Widget>>();

    @inject(ContributionProvider) @named(WidgetFactory)
    protected readonly factoryProvider: ContributionProvider<WidgetFactory>;

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly onDidCreateWidgetEmitter = new Emitter<DidCreateWidgetEvent>();
    readonly onDidCreateWidget: Event<DidCreateWidgetEvent> = this.onDidCreateWidgetEmitter.event;

    /**
     * Get the list of widgets created for the given factory id.
     * @param factoryId the widget factory id.
     *
     * @returns the list of widgets created for the given factory id.
     */
    getWidgets(factoryId: string): Widget[] {
        const result: Widget[] = [];
        for (const [key, widget] of this.widgets.entries()) {
            if (this.fromKey(key).factoryId === factoryId) {
                result.push(widget);
            }
        }
        return result;
    }

    /**
     * Try and get the widget.
     *
     * @returns the widget if available, else `undefined`.
     */
    tryGetWidget<T extends Widget>(factoryId: string, options?: any): T | undefined {
        const key = this.toKey({ factoryId, options });
        const existing = this.widgetPromises.get(key);
        if (existing instanceof Widget) {
            return existing as T;
        }
        return undefined;
    }

    /**
     * Get the widget for the given description.
     *
     * @returns a promise resolving to the widget if available, else `undefined.
     */
    async getWidget<T extends Widget>(factoryId: string, options?: any): Promise<T | undefined> {
        const key = this.toKey({ factoryId, options });
        const pendingWidget = this.doGetWidget<T>(key);
        const widget = pendingWidget && await pendingWidget;
        return widget;
    }

    protected doGetWidget<T extends Widget>(key: string): MaybePromise<T> | undefined {
        const pendingWidget = this.widgetPromises.get(key) || this.pendingWidgetPromises.get(key);
        if (pendingWidget) {
            return pendingWidget as MaybePromise<T>;
        }
        return undefined;
    }

    /**
     * Creates or returns the widget for the given description.
     */
    async getOrCreateWidget<T extends Widget>(factoryId: string, options?: any): Promise<T> {
        const key = this.toKey({ factoryId, options });
        const existingWidget = this.doGetWidget<T>(key);
        if (existingWidget) {
            return existingWidget;
        }
        const factory = this.factories.get(factoryId);
        if (!factory) {
            throw Error("No widget factory '" + factoryId + "' has been registered.");
        }
        try {
            const widgetPromise = factory.createWidget(options);
            this.pendingWidgetPromises.set(key, widgetPromise);
            const widget = await widgetPromise;
            this.widgetPromises.set(key, widgetPromise);
            this.widgets.set(key, widget);
            widget.disposed.connect(() => {
                this.widgets.delete(key);
                this.widgetPromises.delete(key);
            });
            this.onDidCreateWidgetEmitter.fire({
                factoryId, widget
            });
            return widget as T;
        } finally {
            this.pendingWidgetPromises.delete(key);
        }
    }

    /**
     * Get the widget construction options.
     * @param widget the widget.
     *
     * @returns the widget construction options if the widget was created through the manager, else `undefined`.
     */
    getDescription(widget: Widget): WidgetConstructionOptions | undefined {
        for (const [key, aWidget] of this.widgets.entries()) {
            if (aWidget === widget) {
                return this.fromKey(key);
            }
        }
        return undefined;
    }

    /**
     * Convert the widget construction options to string.
     * @param options the widget construction options.
     *
     * @returns the widget construction options represented as a string.
     */
    protected toKey(options: WidgetConstructionOptions): string {
        return JSON.stringify(options);
    }

    /**
     * Convert the key into the widget construction options object.
     * @param key the key.
     *
     * @returns the widget construction options object.
     */
    protected fromKey(key: string): WidgetConstructionOptions {
        return JSON.parse(key);
    }

    protected get factories(): Map<string, WidgetFactory> {
        if (!this._cachedFactories) {
            this._cachedFactories = new Map();
            for (const factory of this.factoryProvider.getContributions()) {
                if (factory.id) {
                    this._cachedFactories.set(factory.id, factory);
                } else {
                    this.logger.error('Invalid ID for factory: ' + factory + ". ID was: '" + factory.id + "'.");
                }
            }
        }
        return this._cachedFactories;
    }

}
