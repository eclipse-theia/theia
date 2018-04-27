/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { WidgetOpenHandler, WidgetOpenerOptions } from '@theia/core/lib/browser/widget-open-handler';
import { FileLocationMapper } from './location-mapper-service';
import { MiniBrowser, MiniBrowserProps } from './mini-browser';

/**
 * Further options for opening a new `Mini Browser` widget.
 */
export interface MiniBrowserOpenerOptions extends WidgetOpenerOptions, MiniBrowserProps {

}

@injectable()
export class MiniBrowserOpenHandler extends WidgetOpenHandler<MiniBrowser> {

    readonly id = 'mini-browser-open-handler';
    readonly label = 'Mini Browser';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    async canHandle(uri: URI): Promise<number> {
        const url = await FileLocationMapper.toURL(uri, 'mini-browser-check');
        const response = await fetch(url);
        return response.status === 200 ? 1 : 0;
    }

    async open(uri?: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowser> {
        const mergedOptions = await this.options(uri, options);
        const widget = await this.widgetManager.getOrCreateWidget<MiniBrowser>(MiniBrowser.Factory.ID, mergedOptions);
        await this.doOpen(widget, mergedOptions);
        const { area } = mergedOptions.widgetOptions;
        if (area !== 'main') {
            this.shell.resize(this.shell.mainPanel.node.offsetWidth / 2, area);
        }
        return widget;
    }

    protected async options(uri?: URI, options?: MiniBrowserOpenerOptions): Promise<MiniBrowserOpenerOptions & { widgetOptions: ApplicationShell.WidgetOptions }> {
        // Get the default options.
        let result = await this.defaultOptions();
        if (uri) {
            // Decorate it with a few properties inferred from the URI.
            const startPage = uri.toString();
            const name = await this.labelProvider.getName(uri);
            const iconClass = `${await this.labelProvider.getIcon(uri)} file-icon`;
            result = {
                ...result,
                startPage,
                name,
                iconClass,
                // Make sure the toolbar is not visible. We have the `iframe.src` anyway.
                toolbar: 'read-only'
            };
        }
        if (options) {
            // Explicit options overrule everything.
            result = {
                ...result,
                ...options
            };
        }
        return result;
    }

    protected async defaultOptions(): Promise<MiniBrowserOpenerOptions & { widgetOptions: ApplicationShell.WidgetOptions }> {
        return {
            mode: 'activate',
            widgetOptions: { area: 'main' },
            sandbox: MiniBrowserProps.SandboxOptions.DEFAULT,
            toolbar: 'show'
        };
    }

}
