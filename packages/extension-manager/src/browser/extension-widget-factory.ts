/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { WidgetFactory, FrontendApplication } from "@theia/core/lib/browser";
import { ExtensionManager } from '../common';
import { ExtensionUri } from "./extension-uri";
import { ExtensionDetailWidget } from './extension-detail-widget';

export class ExtensionWidgetOptions {
    readonly name: string;
}

@injectable()
export class ExtensionWidgetFactory implements WidgetFactory {

    readonly id = ExtensionUri.scheme;

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(ExtensionManager) protected readonly extensionManager: ExtensionManager
    ) { }

    async createWidget(options: ExtensionWidgetOptions): Promise<ExtensionDetailWidget> {
        const extension = await this.extensionManager.resolve(options.name);
        const widget = new ExtensionDetailWidget(extension);
        widget.id = 'extension:' + options.name;
        widget.title.closable = true;
        widget.title.label = options.name;
        this.app.shell.addToMainArea(widget);
        return widget;
    }

}
