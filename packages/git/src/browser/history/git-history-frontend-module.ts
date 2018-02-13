/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitHistoryContribution, GIT_HISTORY } from "./git-history-contribution";
import { interfaces, Container } from "inversify";
import { CommandContribution, MenuContribution } from "@theia/core";
import { KeybindingContribution } from "@theia/core/lib/browser/keybinding";
import { WidgetFactory, OpenHandler } from "@theia/core/lib/browser";
import { GitHistoryWidget } from "./git-history-widget";
import { GIT_COMMIT_DETAIL, GitCommitDetailWidget, GitCommitDetails, GitCommitDetailWidgetOptions } from "./git-commit-detail-widget";
import { GitAvatarService } from "./git-avatar-service";

import '../../../src/browser/style/history.css';
import '../../../src/browser/style/git-icons.css';
import { GitCommitDetailOpenHandler } from "./git-commit-detail-open-handler";

export function bindGitHistoryModule(bind: interfaces.Bind) {

    bind(GitAvatarService).toSelf().inSingletonScope();
    bind(GitHistoryWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_HISTORY,
        createWidget: () => ctx.container.get<GitHistoryWidget>(GitHistoryWidget)
    }));

    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_COMMIT_DETAIL,
        createWidget: (options: GitCommitDetails) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(GitCommitDetailWidget).toSelf();
            child.bind(GitCommitDetailWidgetOptions).toConstantValue(options);
            return child.get(GitCommitDetailWidget);
        }
    }));

    bind(GitCommitDetailOpenHandler).toSelf();
    bind(OpenHandler).toDynamicValue(ctx => ctx.container.get(GitCommitDetailOpenHandler));

    bind(GitHistoryContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(GitHistoryContribution)
        ).inSingletonScope();
    }

}
