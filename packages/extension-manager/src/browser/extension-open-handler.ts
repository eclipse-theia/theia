/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { OpenHandler, WidgetManager, ApplicationShell } from "@theia/core/lib/browser";
import { ExtensionUri } from "./extension-uri";
import { ExtensionWidgetOptions } from './extension-widget-factory';
import { ExtensionDetailWidget } from './extension-detail-widget';

@injectable()
export class ExtensionOpenHandler implements OpenHandler {

    readonly id = ExtensionUri.scheme;

    constructor(
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager
    ) { }

    canHandle(uri: URI): number {
        try {
            ExtensionUri.toExtensionName(uri);
            return 500;
        } catch {
            return 0;
        }
    }

    async open(uri: URI): Promise<ExtensionDetailWidget> {
        const options: ExtensionWidgetOptions = {
            name: ExtensionUri.toExtensionName(uri)
        };
        const widget = await this.widgetManager.getOrCreateWidget<ExtensionDetailWidget>(ExtensionUri.scheme, options);
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        this.shell.activateWidget(widget.id);
        return widget;
    }

}
