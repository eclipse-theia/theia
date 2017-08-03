/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify"
import { FrontendApplication } from "@theia/core/lib/browser"
import { ResolvedExtension } from "../common/extension-protocol"
import { ExtensionDetailWidget } from './extension-detail-widget'

@injectable()
export class ExtensionDetailWidgetService {

    protected extensionDetailWidgetStore = new Map<string, ExtensionDetailWidget>();
    protected counter = 0;

    constructor( @inject(FrontendApplication) protected readonly app: FrontendApplication) {

    }

    openOrFocusDetailWidget(rawExt: ResolvedExtension) {
        const widget = this.extensionDetailWidgetStore.get(rawExt.name);

        if (!widget) {
            const newWidget = new ExtensionDetailWidget("extensionDetailWidget" + this.counter, rawExt);
            newWidget.title.closable = true;
            newWidget.title.label = rawExt.name;
            this.extensionDetailWidgetStore.set(rawExt.name, newWidget);
            this.app.shell.addToMainArea(newWidget);
            this.app.shell.activateMain(newWidget.id);
        } else {
            // this.app.shell.activateMain(newWidget.id);
        }
    }

}