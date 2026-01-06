// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
import { codicon, ContextMenuRenderer, ReactWidget } from '@theia/core/lib/browser';
import { ScmService } from './scm-service';
import { ScmRepository } from './scm-repository';
import { ScmActionButton, ScmProvider } from './scm-provider';
import { LabelParser } from '@theia/core/lib/browser/label-parser';

interface ScmActionButtonProps {
    actionButton: ScmActionButton;
    commandService: CommandService;
    labelParser: LabelParser;
}

@injectable()
export class ScmCommitButtonWidget extends ReactWidget {

    static ID = 'scm-commit-button-widget';

    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(CommandService) protected readonly commandService: CommandService;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(LabelParser) protected readonly labelParser: LabelParser;

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
            const actionButtonListener = repository.provider.onDidChangeActionButton;
            if (actionButtonListener) {
                this.toDisposeOnDetach.push(actionButtonListener(() => {
                    this.update();
                }));
            }
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
        const repo: ScmRepository | undefined = this.scmService.selectedRepository;
        const provider: ScmProvider | undefined = repo?.provider;
        const actionButton = provider?.actionButton;
        if (actionButton === undefined) {
            return null;
        }

        const props = {
            actionButton: actionButton!,
            commandService: this.commandService,
            labelParser: this.labelParser
        } as ScmActionButtonProps;

        return <div>
            <ScmActionButtonComponent
                actionButton={props.actionButton}
                commandService={props.commandService}
                labelParser={props.labelParser}
            >
            </ScmActionButtonComponent>
            <button onClick={this.test}>
                test
            </button>
        </div>
    }

    protected test = async () => {
        const repo: ScmRepository | undefined = this.scmService.selectedRepository;
        const provider: ScmProvider | undefined = repo?.provider;
        const button = provider?.actionButton;
        console.log(provider?.id);
        console.log(provider?.label);
        console.dir(provider, { depth: 5 });

        console.log('Action Button:', button);
        console.dir(button, { depth: 5 });
    }

    protected handleOnClick = (e: React.MouseEvent<HTMLButtonElement>): void => this.doHandleOnClick(e);
    protected doHandleOnClick(e: React.MouseEvent<HTMLButtonElement>): void {
        e.stopPropagation();
        this.contextMenuRenderer.render({
            menuPath: ['scm-provider-action-button-menu'],
            anchor: { x: e.clientX, y: e.clientY },
            context: e.currentTarget
        });
    }
}


class ScmActionButtonComponent extends React.Component<ScmActionButtonProps> {

    override render(): React.ReactNode {
        const { actionButton, commandService } = this.props;
        const isDisabled = !actionButton.enabled;
        const result: React.ReactNode[] = this.renderWithIcons(actionButton.command.title || '');

        return (
            <div className={ScmCommitButtonWidget.Styles.COMMIT_BUTTON_CONTAINER}>
                <button
                    className={ScmCommitButtonWidget.Styles.COMMIT_BUTTON}
                    onClick={() => commandService.executeCommand(actionButton.command.command ?? '', ...(actionButton.command.arguments || []))}
                    disabled={isDisabled}
                    title={actionButton.command.tooltip || ''}>
                    {result}
                </button>
                <button>
                    test
                </button>
            </div>
        );

    }

    protected renderWithIcons(text: string): React.ReactNode[] {
        const result: React.ReactNode[] = [];
        const labelParts = this.props.labelParser.parse(text);
        labelParts.forEach((labelPart, index) => {
            if (typeof labelPart === 'string') {
                result.push(labelPart);
            } else {
                result.push(<span key={index} className={codicon(labelPart.name)}></span>);
            }
        });
        return result;
    }

}

export namespace ScmCommitButtonWidget {

    export namespace Styles {
        export const COMMIT_BUTTON = 'theia-scm-commit-button';
        export const COMMIT_BUTTON_CONTAINER = 'theia-scm-commit-button-container';
    }
}
