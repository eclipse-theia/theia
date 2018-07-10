/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MessageService } from "@theia/core";
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { PluginWidget } from "./plugin-ext-widget";

@injectable()
export class PluginFrontendViewContribution extends AbstractViewContribution<PluginWidget> {

    public static PLUGINS_WIDGET_FACTORY_ID = 'plugins';

    @inject(MessageService) protected readonly messageService: MessageService;

    constructor() {
        super({
            widgetId: PluginFrontendViewContribution.PLUGINS_WIDGET_FACTORY_ID,
            widgetName: 'Plugins',
            defaultWidgetOptions: {
                area: 'left',
                rank: 300
            },
            toggleCommandId: 'pluginsView:toggle',
        });
    }

}
