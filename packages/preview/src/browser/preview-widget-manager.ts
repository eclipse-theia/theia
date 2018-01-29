/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces, injectable } from 'inversify';
import URI from "@theia/core/lib/common/uri";
import { WidgetFactory, WidgetManager } from '@theia/core/lib/browser';
import { Emitter, Event, } from '@theia/core/lib/common';
import { PreviewWidget, PreviewWidgetOptions, PREVIEW_WIDGET_FACTORY_ID } from './preview-widget';

@injectable()
export class PreviewWidgetManager implements WidgetFactory {

    readonly id: string = PREVIEW_WIDGET_FACTORY_ID;

    protected readonly onWidgetCreatedEmitter = new Emitter<PreviewWidget>();

    protected readonly widgetManager: WidgetManager;

    constructor(
        protected readonly container: interfaces.Container
    ) {
        this.widgetManager = container.get(WidgetManager);
    }

    createWidget(options: PreviewWidgetOptions): Promise<PreviewWidget> {
        const uri = options.uri;
        const key = this.asKey(uri);
        const previewWidget = this.get(key);
        if (previewWidget) {
            return Promise.resolve(previewWidget);
        }
        const childContainer = this.container.createChild();
        childContainer.bind(PreviewWidgetOptions).toConstantValue(options);
        const newWidget = childContainer.get(PreviewWidget);
        this.fireWidgetCreated(newWidget);
        return Promise.resolve(newWidget);
    }

    get(uri: string): PreviewWidget | undefined {
        const key = this.asKey(uri);
        const existingWidget = this.widgetManager.getWidgets(PREVIEW_WIDGET_FACTORY_ID)
            .find(widget => widget instanceof PreviewWidget && this.asKey(widget.getUri()) === key) as PreviewWidget | undefined;
        return existingWidget;
    }

    get onWidgetCreated(): Event<PreviewWidget> {
        return this.onWidgetCreatedEmitter.event;
    }

    protected fireWidgetCreated(widget: PreviewWidget): void {
        this.onWidgetCreatedEmitter.fire(widget);
    }

    protected asKey(uri: string | URI): string {
        return (uri instanceof URI ? uri : new URI(uri)).withoutFragment().toString();
    }

}
