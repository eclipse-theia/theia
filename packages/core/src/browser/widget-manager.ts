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

// tslint:disable:no-any
export const WidgetFactory = Symbol('WidgetFactory');
/**
 * `OpenHandler` should be implemented to provide a new opener.
 */
export interface WidgetFactory {

    /*
     * the factory's id
     */
    readonly id: string;

    /**
     * Creates a widget and attaches it to the shell
     * The options need to be serializable JSON data.
     */
    createWidget(options?: any): MaybePromise<Widget>;
}

/*
 * a serializable description to create a widget
 */
export interface WidgetConstructionOptions {
    /**
     * the id of the widget factory to use.
     */
    factoryId: string,

    /*
     * widget factory specific information
     */
    options?: any
}

export interface DidCreateWidgetEvent {
    readonly widget: Widget;
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

    getWidgets(factoryId: string): Widget[] {
        const result: Widget[] = [];
        for (const [key, widget] of this.widgets.entries()) {
            if (this.fromKey(key).factoryId === factoryId) {
                result.push(widget);
            }
        }
        return result;
    }

    tryGetWidget<T extends Widget>(factoryId: string, options?: any): T | undefined {
        const key = this.toKey({ factoryId, options });
        const existing = this.widgetPromises.get(key);
        if (existing instanceof Widget) {
            return existing as T;
        }
        return undefined;
    }

    /**
     * return the widget for the given description
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

    /*
     * creates or returns the widget for the given description.
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

    /*
     *  returns the construction description for the given widget, or undefined if the widget was not created through this manager.
     */
    getDescription(widget: Widget): WidgetConstructionOptions | undefined {
        for (const [key, aWidget] of this.widgets.entries()) {
            if (aWidget === widget) {
                return this.fromKey(key);
            }
        }
        return undefined;
    }

    protected toKey(options: WidgetConstructionOptions) {
        return JSON.stringify(options);
    }

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
