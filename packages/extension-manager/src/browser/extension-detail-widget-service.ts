/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplication } from "@theia/core/lib/browser";
import { ResolvedExtension } from "../common/extension-protocol";
import { ExtensionDetailWidget } from './extension-detail-widget';

@injectable()
export class ExtensionDetailWidgetService {

    protected extensionDetailWidgetStore = new Map<string, ExtensionDetailWidget>();
    protected counter = 0;

    constructor( @inject(FrontendApplication) protected readonly app: FrontendApplication) {

    }

    openOrFocusDetailWidget(rawExt: ResolvedExtension) {
        let widget = this.extensionDetailWidgetStore.get(rawExt.name);

        if (!widget) {
            widget = new ExtensionDetailWidget("extensionDetailWidget" + this.counter++, rawExt);
            this.extensionDetailWidgetStore.set(rawExt.name, widget);
            widget.disposed.connect(() => {
                if (widget) {
                    this.extensionDetailWidgetStore.delete(rawExt.name);
                }
            });
            this.app.shell.addToMainArea(widget);
        }
        this.app.shell.activateMain(widget.id);
    }
}