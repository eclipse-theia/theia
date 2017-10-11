/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplicationContribution, FrontendApplication } from "@theia/core/lib/browser";
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';

@injectable()
export class OutlineViewContribution implements FrontendApplicationContribution {

    constructor(
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager
    ) { }

    onStart(app: FrontendApplication): void {
        this.widgetManager.getOrCreateWidget('outline-view').then(outline => {
            app.shell.addToRightArea(outline);
        });
    }

}
