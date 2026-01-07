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
import { ActionMenuNode, CommandRegistry, CommandService, DisposableCollection, MenuAction, MenuNode, MenuPath } from '@theia/core';
import { Message } from '@theia/core/shared/@lumino/messaging';
import * as React from '@theia/core/shared/react';
import { codicon, ContextMenuRenderer, KeybindingRegistry, ReactWidget } from '@theia/core/lib/browser';
import { ScmService } from './scm-service';
import { ScmRepository } from './scm-repository';
import { ScmActionButton, ScmCommand, ScmProvider } from './scm-provider';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

interface ScmActionButtonProps {
    actionButton: ScmActionButton;
    commandService: CommandService;
    labelParser: LabelParser;
    contextMenuRenderer: ContextMenuRenderer;
    commandRegistry: CommandRegistry;
    keybindingRegistry: KeybindingRegistry;
    contextKeyService: ContextKeyService;
}

@injectable()
export class ScmCommitButtonWidget extends ReactWidget {

    static ID = 'scm-commit-button-widget';

    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(CommandService) protected readonly commandService: CommandService;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(LabelParser) protected readonly labelParser: LabelParser;

    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry;
    @inject(ContextKeyService) protected readonly contextKeyService: ContextKeyService;

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
            labelParser: this.labelParser,
            contextMenuRenderer: this.contextMenuRenderer,
            commandRegistry: this.commandRegistry,
            keybindingRegistry: this.keybindingRegistry,
            contextKeyService: this.contextKeyService
        } as ScmActionButtonProps;

        return <div>
            <ScmActionButtonComponent
                actionButton={props.actionButton}
                commandService={props.commandService}
                labelParser={props.labelParser}
                contextMenuRenderer={props.contextMenuRenderer}
                commandRegistry={props.commandRegistry}
                keybindingRegistry={props.keybindingRegistry}
                contextKeyService={props.contextKeyService}
            >
            </ScmActionButtonComponent>
        </div>
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
                {actionButton.secondaryCommands && actionButton.secondaryCommands.length > 0 &&
                    <>
                        <div
                            className={ScmCommitButtonWidget.Styles.COMMIT_BUTTON_DIVIDER + (isDisabled ? ` ${ScmCommitButtonWidget.Styles.COMMIT_BUTTON_DIVIDER_DISABLED}` : '')}
                        />
                        <button
                            className={`${ScmCommitButtonWidget.Styles.COMMIT_BUTTON_SECONDARY} ${ScmCommitButtonWidget.Styles.COMMIT_BUTTON}`}
                            onClick={this.handleOnClick}
                            disabled={isDisabled}
                            title='More Actions...'
                        >
                            <span className={codicon('chevron-down')}></span>
                        </button>
                    </>
                }
            </div>
        );

    }

    protected handleOnClick = (e: React.MouseEvent<HTMLButtonElement>): void => this.doHandleOnClick(e);
    protected doHandleOnClick(e: React.MouseEvent<HTMLButtonElement>): void {
        this.renderContextMenu(e, this.props.actionButton);
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

    protected renderWithoutIcons(text: string): string {
        let result: string = '';
        const labelParts = this.props.labelParser.parse(text);
        labelParts.forEach((labelPart, index) => {
            if (typeof labelPart === 'string') {
                result += labelPart;
            }
        });
        return result;
    }

    // Define a menu path for the dynamic menu
    protected static readonly SCM_ACTION_BUTTON_CONTEXT_MENU: MenuPath = ['scm-action-button-context-menu'];

    protected renderContextMenu(event: React.MouseEvent, actionButton: ScmActionButton): void {
        event.preventDefault();
        event.stopPropagation();

        const element = event.currentTarget as HTMLElement;
        const rect = element.getBoundingClientRect();

        const anchor = {
            x: rect.left,
            y: rect.bottom
        };

        // Build menu items dynamically
        const menuNodes: MenuNode[] = this.buildMenuNodes(actionButton);

        this.props.contextMenuRenderer.render({
            anchor,
            menu: {
                children: menuNodes,
                isEmpty: () => menuNodes.length === 0,
                id: 'scm-action-button-dynamic-menu',
                isVisible: () => true,
                sortString: '0'
            },
            menuPath: ScmActionButtonComponent.SCM_ACTION_BUTTON_CONTEXT_MENU,
            context: element
        });
    }

    protected buildMenuNodes(actionButton: ScmActionButton): MenuNode[] {
        const nodes: MenuNode[] = [];

        actionButton.secondaryCommands?.forEach((group) => {
            group.forEach((cmd: ScmCommand) => {
                const action: MenuAction = {
                    commandId: cmd.command || '',
                    label: this.renderWithoutIcons(cmd.title || ''),
                }
                const node = new ActionMenuNode(
                    action,
                    this.props.commandRegistry,
                    this.props.keybindingRegistry,
                    this.props.contextKeyService
                );
                nodes.push(node);
            });
        });

        return nodes;
    }

}

export namespace ScmCommitButtonWidget {

    export namespace Styles {
        export const COMMIT_BUTTON = 'theia-scm-commit-button';
        export const COMMIT_BUTTON_SECONDARY = 'theia-scm-commit-button-secondary';
        export const COMMIT_BUTTON_DIVIDER = 'theia-scm-commit-button-divider';
        export const COMMIT_BUTTON_DIVIDER_DISABLED = 'theia-scm-commit-button-divider-disabled';
        export const COMMIT_BUTTON_CONTAINER = 'theia-scm-commit-button-container';
    }

}
