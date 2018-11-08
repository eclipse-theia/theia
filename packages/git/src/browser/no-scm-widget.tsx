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

import { injectable, inject, multiInject, postConstruct } from 'inversify';
import { GitRepositoryProvider } from './git-repository-provider';
import { ScmWidgetFactory } from './index';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

@injectable()
export abstract class NoScmWidget extends ReactWidget {

    @inject(GitRepositoryProvider)
    protected readonly repositoryProvider: GitRepositoryProvider;

    constructor(
        @multiInject(ScmWidgetFactory) public readonly scmWidgetFactories: ScmWidgetFactory[],
    ) {
        super();
        this.node.tabIndex = 0;
    }

    @postConstruct()
    protected init() {
        this.toDispose.push(this.repositoryProvider.onDidChangeRepository(repository =>
            this.update()
        ));
        this.update();
    }

    protected render(): React.ReactNode {
        const repository = this.repositoryProvider.selectedRepository;
        if (repository) {
            return <div className={NoScmWidget.Styles.MAIN_CONTAINER}>
                The repository at {repository.localUri} is not under control of a supported Source Control Manager.
            {
                    this.scmWidgetFactories.length === 0
                        ? <div>No Source Control Managers are supported by this product</div>
                        : this.scmWidgetFactories.length === 1
                            ? <div>Only {this.scmWidgetFactories[0].widgetId} is supported.</div>
                            : <div>The supported Source Control Managers are {this.renderList()}.</div>
                }
            </div>;
        } else {
            return <div className={NoScmWidget.Styles.MAIN_CONTAINER}>
                Select a repository that is under source control to see details here.
        </div>;
        }
    }

    protected renderList(): React.ReactNode {
        let text = this.scmWidgetFactories[0].widgetId + ', and ' + this.scmWidgetFactories[1].widgetId;
        const theRest = this.scmWidgetFactories.slice(2);
        for (const factory of theRest) {
            text = factory.widgetId + ', '  + text;
        }
        return <div>
            {text}
        </div>;
    }
}

export namespace NoScmWidget {
    export namespace Styles {
        export const MAIN_CONTAINER = 'theia-git-main-container';
    }

}
