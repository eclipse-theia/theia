/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { OpenHandler, FrontendApplication, WidgetManager } from "@theia/core/lib/browser";
import URI from "@theia/core/lib/common/uri";
import { GitDiffCommitDetailWidget } from "./git-diff-commit-detail-widget";
import { GitDiffCommitUri } from "./git-diff-commit-uri";
import { GitDiffCommitWidgetOptions } from "./git-diff-commit-widget-factory";

@injectable()
export class GitDiffOpenHandler implements OpenHandler {
    readonly id = GitDiffCommitUri.scheme;

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager
    ) { }

    canHandle(uri: URI): number {
        try {
            GitDiffCommitUri.toCommitName(uri);
            return 500;
        } catch {
            return 0;
        }
    }

    async open(uri: URI): Promise<GitDiffCommitDetailWidget> {
        const options: GitDiffCommitWidgetOptions = {
            name: GitDiffCommitUri.toCommitName(uri)
        };
        const widget = await this.widgetManager.getOrCreateWidget<GitDiffCommitDetailWidget>(GitDiffCommitUri.scheme, options);
        this.app.shell.addWidget(widget, {
            area: 'main'
        });
        this.app.shell.activateWidget(widget.id);
        return widget;
    }

}
