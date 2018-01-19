/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { FILE_NAVIGATOR_ID, FileNavigatorWidget } from './navigator-widget';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';

@injectable()
export class FileNavigatorContribution extends AbstractViewContribution<FileNavigatorWidget> {

    constructor() {
        super({
            widgetId: FILE_NAVIGATOR_ID,
            widgetName: 'Files',
            defaultWidgetOptions: {
                area: 'left',
                rank: 100
            },
            toggleCommandId: 'fileNavigator:toggle',
            toggleKeybinding: 'ctrlcmd+shift+e'
        });
    }

}
