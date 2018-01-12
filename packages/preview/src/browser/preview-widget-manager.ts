/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {
    interfaces,
    injectable
} from 'inversify';
import { DisposableCollection } from '@theia/core';
import URI from "@theia/core/lib/common/uri";
import {
    WidgetFactory,
} from '@theia/core/lib/browser';
import {
    Emitter,
    Event,
} from '@theia/core/lib/common';
import {
    PreviewWidget,
    PREVIEW_WIDGET_FACTORY_ID
} from './preview-widget';

@injectable()
export class PreviewWidgetManager implements WidgetFactory {

    readonly id: string = PREVIEW_WIDGET_FACTORY_ID;

    protected readonly onWidgetCreatedEmitter = new Emitter<string>();

    protected readonly disposables = new DisposableCollection();
    private widgets = new Map<string, PreviewWidget>();

    constructor(
        protected readonly container: interfaces.Container
    ) { }

    async createWidget(uri: string): Promise<PreviewWidget> {
        const key = this.asKey(uri);
        const previewWidget = this.widgets.get(key);
        if (previewWidget) {
            return previewWidget;
        }
        const newWidget = this.container.get(PreviewWidget);
        this.widgets.set(key, newWidget);
        newWidget.disposed.connect(() => {
            this.widgets.delete(key);
        });
        this.fireWidgetCreated(key);
        return newWidget;
    }

    get(uri: string): PreviewWidget | undefined {
        return this.widgets.get(this.asKey(uri));
    }

    get onWidgetCreated(): Event<string> {
        return this.onWidgetCreatedEmitter.event;
    }

    protected fireWidgetCreated(uri: string): void {
        this.onWidgetCreatedEmitter.fire(uri);
    }

    protected asKey(uri: string): string {
        return new URI(uri).withoutQuery().withoutFragment().toString();
    }

}
