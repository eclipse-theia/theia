/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import URI from "@theia/core/lib/common/uri";
import { WidgetOpenHandler } from "@theia/core/lib/browser";
import { ExtensionUri } from "./extension-uri";
import { ExtensionWidgetOptions } from './extension-widget-factory';
import { ExtensionDetailWidget } from './extension-detail-widget';

@injectable()
export class ExtensionOpenHandler extends WidgetOpenHandler<ExtensionDetailWidget> {

    readonly id = ExtensionUri.scheme;
    protected readonly widgetConstructor = ExtensionDetailWidget;

    canHandle(uri: URI): number {
        try {
            ExtensionUri.toExtensionName(uri);
            return 500;
        } catch {
            return 0;
        }
    }

    protected createWidgetOptions(uri: URI): ExtensionWidgetOptions {
        return {
            name: ExtensionUri.toExtensionName(uri)
        };
    }

}
