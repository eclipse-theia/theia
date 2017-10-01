/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, named, injectable } from 'inversify';
import { Widget } from '@phosphor/widgets';
import { ContributionProvider } from '../common/contribution-provider';
import { ILogger, MaybePromise } from '../common';

// tslint:disable:no-any
export const WidgetFactory = Symbol("WidgetFactory");
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

/**
 * Creates and manages widgets.
 */
@injectable()
export class WidgetManager {

    private _cachedfactories: Map<string, WidgetFactory>;
    private widgets = new Map<string, Widget>();

    constructor(
        @inject(ContributionProvider) @named(WidgetFactory) protected readonly factoryProvider: ContributionProvider<WidgetFactory>,
        @inject(ILogger) protected logger: ILogger) {
    }

    getWidgets(factoryId: string): Widget[] {
        const result: Widget[] = [];
        for (const [key, widget] of this.widgets.entries()) {
            if (this.fromKey(key).factoryId === factoryId) {
                result.push(widget);
            }
        }
        return result;
    }

    /*
     * creates or returns the widget for the given description.
     */
    async getOrCreateWidget<T extends Widget>(factoryId: string, options?: any): Promise<T> {
        const key = this.toKey({ factoryId, options });
        const existingWidget = this.widgets.get(key);
        if (existingWidget) {
            return existingWidget as T;
        }
        const factory = this.factories.get(factoryId);
        if (!factory) {
            throw Error("No widget factory '" + factoryId + "' has been registered.");
        }
        const widget = await factory.createWidget(options);
        this.widgets.set(key, widget);
        widget.disposed.connect(() => {
            this.widgets.delete(key);
        });
        return widget as T;
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

    private get factories(): Map<string, WidgetFactory> {
        if (!this._cachedfactories) {
            this._cachedfactories = new Map();
            for (const f of this.factoryProvider.getContributions()) {
                if (f.id) {
                    this._cachedfactories.set(f.id, f);
                } else {
                    this.logger.error("Factory id cannot be undefined : " + f);
                }
            }
        }
        return this._cachedfactories;
    }

}
