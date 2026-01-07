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
import { CommandService, DisposableCollection, MenuNode, CommandMenu } from '@theia/core';
import { Message } from '@theia/core/shared/@lumino/messaging';
import * as React from '@theia/core/shared/react';
import { codicon, ContextMenuRenderer, ReactWidget } from '@theia/core/lib/browser';
import { ScmService } from './scm-service';
import { ScmRepository } from './scm-repository';
import { ScmActionButton, ScmCommand, ScmProvider } from './scm-provider';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { BrowserMenuNodeFactory } from '@theia/core/lib/browser/menu/browser-menu-node-factory';

@injectable()
export class ScmCommitButtonWidget extends ReactWidget {

    static ID = 'scm-action-button-widget';

    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(CommandService) protected readonly commandService: CommandService;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(LabelParser) protected readonly labelParser: LabelParser;
    @inject(BrowserMenuNodeFactory) protected readonly menuNodeFactory: BrowserMenuNodeFactory;

    protected readonly toDisposeOnRepositoryChange = new DisposableCollection();

    constructor() {
        super();
        this.addClass('theia-scm-commit');
        this.id = ScmCommitButtonWidget.ID;
    };

    protected override onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.refreshOnRepositoryChange();
        this.toDisposeOnDetach.push(this.scmService.onDidChangeSelectedRepository(() => {
            this.refreshOnRepositoryChange();
            this.update();
        }));
    };

    protected refreshOnRepositoryChange(): void {
        this.toDisposeOnRepositoryChange.dispose();
        const repository = this.scmService.selectedRepository;
        if (repository) {
            this.toDisposeOnRepositoryChange.push(repository.provider.onDidChange(async () => {
                this.update();
            }));
            const actionButtonListener = repository.provider.onDidChangeActionButton;
            if (actionButtonListener) {
                this.toDisposeOnRepositoryChange.push(actionButtonListener(() => {
                    this.update();
                }));
            }
        }
    };

    protected render(): React.ReactNode {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            return React.createElement('div', this.createContainerAttributes(), this.renderButton());
        }
    };

    /**
     * Create the container attributes for the widget.
     */
    protected createContainerAttributes(): React.HTMLAttributes<HTMLElement> {
        return {
            style: { flexGrow: 0 }
        };
    };

    protected renderButton(): React.ReactNode {
        const repo: ScmRepository | undefined = this.scmService.selectedRepository;
        const provider: ScmProvider | undefined = repo?.provider;
        const actionButton = provider?.actionButton;
        if (actionButton === undefined) {
            return undefined;
        }

        return <>
            <ScmActionButtonComponent
                actionButton={actionButton}
                onExecuteCommand={this.handleExecuteCommand}
                onShowSecondaryMenu={this.handleShowSecondaryMenu}
                renderLabel={this.renderLabel}
            />
        </>;
    };

    protected handleExecuteCommand = (commandId: string, args: unknown[]): void => {
        this.commandService.executeCommand(commandId, ...args);
    };

    protected handleShowSecondaryMenu = (
        event: React.MouseEvent,
        actionButton: ScmActionButton
    ): void => {
        event.preventDefault();
        event.stopPropagation();

        const element = event.currentTarget as HTMLElement;
        const rect = element.getBoundingClientRect();

        // Build menu with commands that have their arguments baked in
        const menuGroups: MenuNode[] = this.buildMenuGroupsWithCommands(actionButton);

        this.contextMenuRenderer.render({
            anchor: { x: rect.left, y: rect.bottom },
            menu: {
                children: menuGroups,
                isEmpty: () => menuGroups.length === 0,
                id: 'scm-action-button-dynamic-menu',
                isVisible: () => true,
                sortString: '0'
            },
            menuPath: ['scm-action-button-context-menu'],
            context: element,
            includeAnchorArg: false
        });
    };

    protected buildMenuGroupsWithCommands(actionButton: ScmActionButton): MenuNode[] {
        const menuGroups: MenuNode[] = [];

        actionButton.secondaryCommands?.forEach((commandGroup: ScmCommand[], groupIndex: number) => {
            const menuGroup = this.menuNodeFactory.createGroup(`group-${groupIndex}`);

            commandGroup.forEach((cmd: ScmCommand, cmdIndex: number) => {

                // Create a custom CommandMenu node that executes the command with its arguments
                const customNode: CommandMenu = {
                    id: `${cmd.command}-${groupIndex}-${cmdIndex}`,
                    sortString: String(cmdIndex),
                    label: this.stripIcons(cmd.title || ''),
                    icon: undefined,

                    isVisible: () => true,
                    isEnabled: () => true,
                    isToggled: () => false,

                    run: async () => {
                        await this.commandService.executeCommand(cmd.command || '', ...(cmd.arguments || []));
                    }
                };

                menuGroup.addNode(customNode);
            });

            if (menuGroup.children.length > 0) {
                menuGroups.push(menuGroup);
            }
        });

        return menuGroups;
    }

    protected renderLabel = (text: string): React.ReactNode[] => {
        const result: React.ReactNode[] = [];
        const labelParts = this.labelParser.parse(text);
        labelParts.forEach((labelPart, index) => {
            if (typeof labelPart === 'string') {
                result.push(labelPart);
            } else {
                result.push(<span key={index} className={codicon(labelPart.name)}></span>);
            }
        });
        return result;
    };

    protected stripIcons(text: string): string {
        let result = '';
        const labelParts = this.labelParser.parse(text);
        labelParts.forEach(labelPart => {
            if (typeof labelPart === 'string') {
                result += labelPart;
            }
        });
        return result;
    };

}

class ScmActionButtonComponent extends React.Component<ScmActionButtonComponent.Props> {

    override render(): React.ReactNode {
        const { actionButton, onExecuteCommand, onShowSecondaryMenu, renderLabel } = this.props;
        const isDisabled = !actionButton.enabled;
        const result: React.ReactNode[] = renderLabel(actionButton.command.title || '');

        return (
            <div className={ScmCommitButtonWidget.Styles.ACTION_BUTTON_CONTAINER}>
                <button
                    className={ScmCommitButtonWidget.Styles.ACTION_BUTTON}
                    onClick={() => onExecuteCommand(
                        actionButton.command.command ?? '',
                        actionButton.command.arguments || []
                    )}
                    disabled={isDisabled}
                    title={actionButton.command.tooltip || ''}>
                    {result}
                </button>
                {actionButton.secondaryCommands && actionButton.secondaryCommands.length > 0 &&
                    <>
                        <div
                            className={ScmCommitButtonWidget.Styles.ACTION_BUTTON_DIVIDER +
                                (isDisabled ? ` ${ScmCommitButtonWidget.Styles.ACTION_BUTTON_DIVIDER_DISABLED}` : '')}
                        />
                        <button
                            className={`${ScmCommitButtonWidget.Styles.ACTION_BUTTON_SECONDARY} ${ScmCommitButtonWidget.Styles.ACTION_BUTTON}`}
                            onClick={e => onShowSecondaryMenu(e, actionButton)}
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

}

namespace ScmActionButtonComponent {
    export interface Props {
        actionButton: ScmActionButton;
        onExecuteCommand: (commandId: string, args: unknown[]) => void;
        onShowSecondaryMenu: (event: React.MouseEvent<HTMLButtonElement>, actionButton: ScmActionButton) => void;
        renderLabel: (text: string) => React.ReactNode[];
    };
}

export namespace ScmCommitButtonWidget {

    export namespace Styles {
        export const ACTION_BUTTON = 'theia-scm-action-button';
        export const ACTION_BUTTON_SECONDARY = 'theia-scm-action-button-secondary';
        export const ACTION_BUTTON_DIVIDER = 'theia-scm-action-button-divider';
        export const ACTION_BUTTON_DIVIDER_DISABLED = 'theia-scm-action-button-divider-disabled';
        export const ACTION_BUTTON_CONTAINER = 'theia-scm-action-button-container';
    };

}
