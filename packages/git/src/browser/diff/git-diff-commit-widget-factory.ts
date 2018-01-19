/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { WidgetFactory, FrontendApplication } from "@theia/core/lib/browser";
import { injectable, inject } from "inversify";
import { GitDiffCommitUri } from "./git-diff-commit-uri";
import { GitDiffCommitDetailWidget } from "./git-diff-commit-detail-widget";

export interface GitDiffCommitWidgetOptions {
    name: string;
}

@injectable()
export class GitDiffCommitWidgetFactory implements WidgetFactory {
    readonly id = GitDiffCommitUri.scheme;

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        // @inject(ExtensionManager) protected readonly extensionManager: ExtensionManager
    ) { }

    async createWidget(options: GitDiffCommitWidgetOptions): Promise<GitDiffCommitDetailWidget> {
        // const extension = await this.extensionManager.resolve(options.name);
        const widget = new GitDiffCommitDetailWidget();
        widget.id = 'Commit:' + options.name;
        widget.title.closable = true;
        widget.title.label = options.name;
        widget.title.iconClass = 'fa fa-puzzle-piece';
        return widget;
    }
}
