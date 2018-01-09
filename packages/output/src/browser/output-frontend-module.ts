/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces } from "inversify";
import { OutputWidget, OUTPUT_WIDGET_KIND } from "./output-widget";
import { WidgetFactory } from "@theia/core/lib/browser";
import { MenuContribution, CommandContribution } from "@theia/core";
import { OutputContribution } from "./output-contribution";
import { OutputChannelManager } from "../common/output-channel";
import { bindOutputPreferences } from "../common/output-preferences";

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    bindOutputPreferences(bind);
    bind(OutputWidget).toSelf();
    bind(OutputChannelManager).to(OutputChannelManager).inSingletonScope();

    bind(WidgetFactory).toDynamicValue(context => ({
        id: OUTPUT_WIDGET_KIND,
        createWidget: () => context.container.get<OutputWidget>(OutputWidget)
    }));

    bind(OutputContribution).toSelf().inSingletonScope();
    bind(MenuContribution).toDynamicValue(context => context.container.get<OutputContribution>(OutputContribution));
    bind(CommandContribution).toDynamicValue(context => context.container.get<OutputContribution>(OutputContribution));
});
