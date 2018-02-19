/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { OutlineViewWidget } from './outline-view-widget';

export const OUTLINE_WIDGET_FACTORY_ID = 'outline-view';

@injectable()
export class OutlineViewContribution extends AbstractViewContribution<OutlineViewWidget> {

    constructor() {
        super({
            widgetId: OUTLINE_WIDGET_FACTORY_ID,
            widgetName: 'Outline',
            defaultWidgetOptions: {
                area: 'right',
                rank: 500
            },
            toggleCommandId: 'outlineView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+o'
        });
    }
}
