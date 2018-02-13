/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitHistoryContribution, GIT_HISTORY } from "./git-history-contribution";
import { interfaces } from "inversify";
import { CommandContribution, MenuContribution } from "@theia/core";
import { KeybindingContribution } from "@theia/core/lib/browser/keybinding";
import { WidgetFactory } from "@theia/core/lib/browser";
import { GitHistoryWidget } from "./git-history-widget";

import '../../../src/browser/style/history.css';

export function bindGitHistoryModule(bind: interfaces.Bind) {

    bind(GitHistoryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_HISTORY,
        createWidget: () => ctx.container.get<GitHistoryWidget>(GitHistoryWidget)
    }));

    bind(GitHistoryContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(GitHistoryContribution)
        ).inSingletonScope();
    }

}
