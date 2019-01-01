/********************************************************************************
 * Copyright (C) 2018 Arm and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, named, postConstruct } from 'inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { Repository } from '../common';
import { GitRepositoryProvider } from './git-repository-provider';
import { ContributionProvider } from '@theia/core';
import { BaseWidget } from '@theia/core/lib/browser/widgets/widget';
import { GitErrorHandler } from './git-error-handler';
import { SingletonLayout } from '@phosphor/widgets/lib/singletonlayout';
import { FileSystem } from '@theia/filesystem/lib/common';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { ScmWidgetFactory } from './index';

@injectable()
export class ScmContainerWidget extends BaseWidget {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(GitErrorHandler)
    protected readonly gitErrorHandler: GitErrorHandler;

    protected singletonLayout: SingletonLayout;

    @inject(ContributionProvider)
    @named(ScmWidgetFactory)
    protected readonly scmWidgetFactories: ContributionProvider<ScmWidgetFactory>;

    @inject(WidgetManager)
    protected widgetManager: WidgetManager;

    @inject(GitRepositoryProvider)
    protected readonly repositoryProvider: GitRepositoryProvider;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    constructor() {
        super();
        this.id = 'theia-gitContainer';
        this.addClass('theia-git');
        this.node.tabIndex = 0;
        this.singletonLayout = new SingletonLayout();
        if (this.scmWidgetFactories.getContributions().length === 1) {
            const theOnlyWidgetId = this.scmWidgetFactories.getContributions()[0].widgetId;
            this.widgetManager.getOrCreateWidget(theOnlyWidgetId).then(widget => {
                this.title.label = widget.title.label;
                this.title.caption = widget.title.caption;
                this.title.iconClass = widget.title.iconClass;
            });
        } else {
            this.title.label = 'SCM';
            this.title.caption = 'SCM';
            this.title.iconClass = 'fa git-tab-icon';
        }
        this.layout = this.singletonLayout;
    }

    @postConstruct()
    protected init() {
        this.toDispose.push(this.repositoryProvider.onDidChangeRepository(repository =>
            this.initialize(repository)
        ));
        this.initialize(this.repositoryProvider.selectedRepository);
    }

    protected async initialize(repository: Repository | undefined): Promise<void> {
        const widgetId = await this.getWidgetIdForRepository(repository);
        const widget = await this.widgetManager.getOrCreateWidget(widgetId);
        this.singletonLayout.widget = widget;
        this.update();
    }

    protected async getWidgetIdForRepository(repository: Repository | undefined): Promise<string> {
        if (repository) {
            for (const factory of this.scmWidgetFactories.getContributions()) {
                const fileStat = await this.fileSystem.getFileStat(repository.localUri);
                if (fileStat) {
                    if (factory.isUnderSourceControl(fileStat)) {
                        return factory.widgetId;
                    }
                }
            }
        }
        return 'no-scm';
    }
}
