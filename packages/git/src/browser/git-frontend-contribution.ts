/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';

export const GIT_WIDGET_FACTORY_ID = 'git';

@injectable()
export class GitFrontendContribution implements FrontendApplicationContribution {
    constructor(
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager
    ) { }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        this.widgetManager.getOrCreateWidget(GIT_WIDGET_FACTORY_ID).then(widget => {
            app.shell.addToLeftArea(widget, {
                rank: 200
            });
        });
    }

}
