/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { GitDiffService } from './git-diff-service';
import { GitDiffModel } from './git-diff-model';
import { GitDiffWidget } from './git-diff-widget';
import { interfaces } from "inversify";
import { GIT_DIFF, GitDiffContribution } from './git-diff-contribution';
import { WidgetFactory, OpenHandler } from "@theia/core/lib/browser";
import { CommandContribution, MenuContribution } from '@theia/core';
import { GitDiffCommitWidgetFactory } from './git-diff-commit-widget-factory';
import { GitDiffOpenHandler } from './git-diff-open-handler';

import '../../../src/browser/style/diff.css';

export function bindGitDiffModule(bind: interfaces.Bind) {

    bind(GitDiffService).toSelf().inSingletonScope();
    bind(GitDiffModel).toSelf().inSingletonScope();

    bind(GitDiffWidget).toSelf();

    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: GIT_DIFF,
        createWidget: () => ctx.container.get<GitDiffWidget>(GitDiffWidget)
    }));

    bind(GitDiffContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(GitDiffContribution)
        ).inSingletonScope();
    }

    bind(GitDiffCommitWidgetFactory).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ctx.container.get(GitDiffCommitWidgetFactory)).inSingletonScope();

    bind(GitDiffOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toDynamicValue(ctx => ctx.container.get(GitDiffOpenHandler)).inSingletonScope();
}
