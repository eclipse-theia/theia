/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { OUTPUT_WIDGET_KIND, OutputWidget } from "./output-widget";

@injectable()
export class OutputContribution extends AbstractViewContribution<OutputWidget> {

    constructor() {
        super({
            widgetId: OUTPUT_WIDGET_KIND,
            widgetName: 'Output',
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: 'output:toggle',
            toggleKeybinding: 'ctrlcmd+shift+u'
        });
    }

}
