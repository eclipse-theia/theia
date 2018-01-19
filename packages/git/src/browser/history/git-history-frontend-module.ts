/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitHistoryContribution, GIT_HISTORY_WIDGET } from "./git-history-contribution";
import { interfaces } from "inversify";
import { CommandContribution, MenuContribution } from "@theia/core";
import { WidgetFactory } from "@theia/core/lib/browser";
import { GitHistoryWidget } from "./git-history-widget";

export function bindGitHistoryModule(bind: interfaces.Bind) {

    bind(GitHistoryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_HISTORY_WIDGET,
        createWidget: () => ctx.container.get<GitHistoryWidget>(GitHistoryWidget)
    }));

    bind(GitHistoryContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(GitHistoryContribution)
        ).inSingletonScope();
    }

}
