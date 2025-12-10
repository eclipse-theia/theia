// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import { CommandService, DisposableCollection } from '@theia/core';
import { Message } from '@theia/core/shared/@lumino/messaging';
import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser';
import { ScmService } from './scm-service';
import { codicon } from '@theia/core/lib/browser';

@injectable()
export class ScmCommitButtonWidget extends ReactWidget {

    static ID = 'scm-commit-button-widget';

    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(CommandService) protected readonly commandService: CommandService;

    protected readonly toDisposeOnRepositoryChange = new DisposableCollection();

    constructor() {
        super();
        this.addClass('theia-scm-commit');
        this.id = ScmCommitButtonWidget.ID;
    }

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.refreshOnRepositoryChange();
        this.toDisposeOnDetach.push(this.scmService.onDidChangeSelectedRepository(() => {
            this.refreshOnRepositoryChange();
            this.update();
        }));
    }

    protected refreshOnRepositoryChange(): void {
        this.toDisposeOnRepositoryChange.dispose();
        const repository = this.scmService.selectedRepository;
        if (repository) {
            this.toDisposeOnRepositoryChange.push(repository.provider.onDidChange(async () => {
                this.update();
            }));
        }
    }

    protected render(): React.ReactNode {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            return React.createElement('div', this.createContainerAttributes(), this.renderButton());
        }
    }

    /**
     * Create the container attributes for the widget.
     */
    protected createContainerAttributes(): React.HTMLAttributes<HTMLElement> {
        return {
            style: { flexGrow: 0 }
        };
    }

    protected renderButton(): React.ReactNode {
        const checkIcon = codicon('check');
        return <div className={ScmCommitButtonWidget.Styles.COMMIT_BUTTON_CONTAINER}>
            <button className={ScmCommitButtonWidget.Styles.COMMIT_BUTTON} onClick={this.commitInput}>
                <span className={checkIcon} /> Commit
            </button>
        </div >
    }

    protected commitInput = () => this.commandService.executeCommand('scm.acceptInput');

}

export namespace ScmCommitButtonWidget {

    export namespace Styles {
        export const COMMIT_BUTTON = 'theia-scm-commit-button';
        export const COMMIT_BUTTON_CONTAINER = 'theia-scm-commit-button-container';
    }
}
