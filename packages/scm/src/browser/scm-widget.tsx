/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { injectable, inject, postConstruct } from 'inversify';
import { ContextMenuRenderer, SELECTED_CLASS, StatefulWidget } from '@theia/core/lib/browser';
import * as React from 'react';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import {
    InputValidator,
    ScmInput,
    ScmRepository,
    ScmResource,
    ScmResourceGroup,
    ScmService
} from './scm-service';
import { CommandRegistry, format, MenuPath } from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';
import { ScmTitleCommandRegistry, ScmTitleItem } from './scm-title-command-registry';
import { ScmResourceCommandRegistry } from './scm-resource-command-registry';
import { ScmGroupCommandRegistry } from './scm-group-command-registry';
import { ScmNavigableListWidget } from './scm-navigable-list-widget';
import { KeyboardEvent } from 'react';

@injectable()
export class ScmWidget extends ScmNavigableListWidget<ScmResource> implements StatefulWidget {
    private static MESSAGE_BOX_MIN_HEIGHT = 25;

    protected message: string = '';
    protected messageBoxHeight: number = ScmWidget.MESSAGE_BOX_MIN_HEIGHT;
    protected inputCommandMessageValidator: InputValidator | undefined;
    protected inputCommandMessageValidationResult: InputValidator.Result | undefined;
    protected listContainer: ScmResourceGroupsContainer | undefined;

    private selectedRepoUri: string | undefined;
    protected readonly selectChange = (change: ScmResource) => {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            const resources: ScmResource[] = [];
            const groups = repository.provider.groups;
            if (groups) {
                groups.forEach(group => group.resources.forEach(resource => resources.push(resource)));
                this.scmNodes = resources;
            }
        }
        this.selectNode(change);
    }
    protected readonly handleEnter: () => void;

    @inject(ScmTitleCommandRegistry) protected readonly scmTitleRegistry: ScmTitleCommandRegistry;
    @inject(ScmResourceCommandRegistry) protected readonly scmResourceCommandRegistry: ScmResourceCommandRegistry;
    @inject(ScmGroupCommandRegistry) protected readonly scmGroupCommandRegistry: ScmGroupCommandRegistry;
    @inject(ScmService) private readonly scmService: ScmService;
    @inject(CommandRegistry) private readonly commandRegistry: CommandRegistry;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;

    constructor() {
        super();
        this.id = 'theia-scmContainer';
        this.title.label = 'Scm';
        this.title.caption = 'Scm';
        this.title.closable = true;
        this.title.iconClass = 'scm-tab-icon';
        this.addClass('theia-scm');
        this.scrollContainer = ScmWidget.Styles.GROUPS_CONTAINER;

        this.update();
    }

    @postConstruct()
    protected init() {
        this.scmService.onDidAddRepository(repository => {
            repository.provider.onDidChangeResources(() => {
                if (this.selectedRepoUri === repository.provider.rootUri) {
                    this.update();
                }
            });
            repository.provider.onDidChange(() => {
                this.update();
            });
        });
        this.scmService.onDidChangeSelectedRepositories(repository => {
            this.selectedRepoUri = repository.provider.rootUri;
            this.update();
        });
    }

    protected addScmListKeyListeners = (id: string) => this.doAddScmListKeyListeners(id);
    protected doAddScmListKeyListeners(id: string) {
        const container = document.getElementById(id);
        if (container) {
            this.addScmListNavigationKeyListeners(container);
        }
    }

    protected handleListEnter() {
        const selected = this.getSelected();
        if (selected) {
            const commands = this.scmResourceCommandRegistry.getCommands(selected.group.label);
            if (commands && commands.length > 0) {
                this.commandRegistry.executeCommand(commands[0], selected.sourceUri.toString());
            }
        }
    }

    protected render(): React.ReactNode {
        let repository;
        if (this.selectedRepoUri) {
            repository = this.scmService.repositories.find(repo => repo.provider.rootUri === this.selectedRepoUri);
        } else {
            repository = this.scmService.selectedRepository;
        }
        if (!repository) {
            return <AlertMessage
                type='WARNING'
                header='Source control is not available at this time'
            />;
        }
        const input = repository.input;
        this.inputCommandMessageValidator = input.validateInput;
        return <div className={ScmWidget.Styles.MAIN_CONTAINER}>
            <div className='headerContainer'>
                {this.renderInput(input, repository)}
                {this.renderCommandBar(repository)}
            </div>
            <ScmResourceGroupsContainer
                id={this.scrollContainer}
                repository={repository}
                scmResourceCommandRegistry={this.scmResourceCommandRegistry}
                scmGroupCommandRegistry={this.scmGroupCommandRegistry}
                commandRegistry={this.commandRegistry}
                selectChange={this.selectChange}
                scmNodes={this.scmNodes}
                addScmListKeyListeners={this.addScmListKeyListeners}
                renderContextMenu={this.showMoreToolButtons}
            />
        </div>;
    }

    protected renderInput(input: ScmInput, repository: ScmRepository): React.ReactNode {
        const validationStatus = this.inputCommandMessageValidationResult ? this.inputCommandMessageValidationResult.type : 'idle';
        const validationMessage = this.inputCommandMessageValidationResult ? this.inputCommandMessageValidationResult.message : '';
        const keyBinding = navigator.appVersion.indexOf('Mac') !== -1 ? 'Cmd+Enter' : 'Ctrl+Enter';
        const message = format(input.placeholder, keyBinding);
        const handleHotKey = (event: KeyboardEvent) => {
            if (event.key === 'Enter' && event.ctrlKey) {
                const command = repository.provider.acceptInputCommand;
                if (command) {
                    this.executeInputCommand(command.id, repository.provider.handle);
                }
            }
        };
        return <div className={ScmWidget.Styles.INPUT_MESSAGE_CONTAINER}>
            <textarea
                className={`${ScmWidget.Styles.INPUT_MESSAGE} theia-scm-input-message-${validationStatus}`}
                style={{
                    height: this.messageBoxHeight,
                    overflow: this.messageBoxHeight > ScmWidget.MESSAGE_BOX_MIN_HEIGHT ? 'auto' : 'hidden'
                }}
                autoFocus={true}
                onInput={this.onInputMessageChange.bind(this)}
                placeholder={`${message}`}
                id={ScmWidget.Styles.INPUT_MESSAGE}
                defaultValue={`${input.value}`}
                onKeyPress={handleHotKey}
                tabIndex={1}>
            </textarea>
            <div
                className={
                    `${ScmWidget.Styles.VALIDATION_MESSAGE} ${ScmWidget.Styles.NO_SELECT}
                    theia-scm-validation-message-${validationStatus} theia-scm-input-message-${validationStatus}`
                }
                style={
                    {
                        display: !!this.inputCommandMessageValidationResult ? 'block' : 'none'
                    }
                }>{validationMessage}</div>
        </div>;
    }

    protected onInputMessageChange(e: Event): void {
        const {target} = e;
        if (target instanceof HTMLTextAreaElement) {
            const {value} = target;
            this.message = value;
            const repository = this.scmService.selectedRepository;
            if (repository) {
                repository.input.value = value;
            }
            this.resize(target);
            if (this.inputCommandMessageValidator) {
                this.inputCommandMessageValidator(value).then(result => {
                    if (!InputValidator.Result.equal(this.inputCommandMessageValidationResult, result)) {
                        this.inputCommandMessageValidationResult = result;
                        this.update();
                    }
                });
            }
        }
    }

    protected renderCommandBar(repository: ScmRepository | undefined): React.ReactNode {
        const onClick = (event: React.MouseEvent<HTMLElement>) => {
            this.showMoreToolButtons(event, undefined);
        };
        return <div id='commandBar' className='flexcontainer'>
            <div className='buttons'>
                {this.scmTitleRegistry.getCommands().map(command => this.renderButton(command))}
                <a className='toolbar-button' title='More...' onClick={onClick}>
                    <i className='fa fa-ellipsis-h'/>
                </a>
            </div>
            <div className='placeholder'/>
            {this.renderInputCommand(repository)}
        </div>;
    }

    protected readonly showMoreToolButtons = (event: React.MouseEvent<HTMLElement>, group: string[] | undefined) => this.doShowMoreToolButtons(event, group);

    protected doShowMoreToolButtons(event: React.MouseEvent<HTMLElement>, group: string[] | undefined) {
        const el = (event.target as HTMLElement).parentElement;
        if (el) {
            this.contextMenuRenderer.render(group ? group : ScmWidget.ContextMenu.PATH, {
                x: el.getBoundingClientRect().left,
                y: el.getBoundingClientRect().top + el.offsetHeight
            });
        }
    }

    private renderButton(item: ScmTitleItem): React.ReactNode {
        const command = this.commandRegistry.getCommand(item.command);
        if (item.when) {
            const provider = item.when.substring(item.when.indexOf('scmProvider == ') + 15);
            const repository = this.scmService.selectedRepository;
            if (repository) {
                if (provider.toLowerCase() !== repository.provider.label.toLowerCase()) {
                    return;
                }
            }
        }
        if (command && command.category === 'navigation') {
            const execute = () => {
                this.commandRegistry.executeCommand(item.command);
            };
            return <a className='toolbar-button' key={command.id}>
                <i className={command.iconClass} title={command.label} onClick={execute}/>
            </a>;
        }
    }

    private renderInputCommand(repository: ScmRepository | undefined): React.ReactNode {
        if (repository && repository.provider.acceptInputCommand) {
            const command = repository.provider.acceptInputCommand;
            return <div className='buttons'>
                <button className='theia-button'
                        onClick={() => {
                            this.executeInputCommand(command.id, repository.provider.handle);
                        }} title={`${command.tooltip}`}>
                    {`${repository.provider.acceptInputCommand.text}`}
                </button>
            </div>;
        }
    }

    private executeInputCommand(commandId: string, providerId: number): void {
        this.inputCommandMessageValidationResult = undefined;
        if (this.message.trim().length === 0) {
            this.inputCommandMessageValidationResult = {
                type: 'error',
                message: 'Please provide an input'
            };
        }
        if (this.inputCommandMessageValidationResult === undefined) {
            this.commandRegistry.executeCommand(commandId, providerId);
            this.resetInputMessages();
            this.update();
        } else {
            const messageInput = document.getElementById(ScmWidget.Styles.INPUT_MESSAGE) as HTMLInputElement;
            if (messageInput) {
                this.update();
                messageInput.focus();
            }
        }
    }

    private resetInputMessages(): void {
        this.message = '';
        const messageInput = document.getElementById(ScmWidget.Styles.INPUT_MESSAGE) as HTMLTextAreaElement;
        messageInput.value = '';
        this.resize(messageInput);
    }

    resize(textArea: HTMLTextAreaElement): void {
        // tslint:disable-next-line:no-null-keyword
        const fontSize = Number.parseInt(window.getComputedStyle(textArea, undefined).getPropertyValue('font-size').split('px')[0] || '0', 10);
        const {value} = textArea;
        if (Number.isInteger(fontSize) && fontSize > 0) {
            const requiredHeight = fontSize * value.split(/\r?\n/).length;
            if (requiredHeight < textArea.scrollHeight) {
                textArea.style.height = `${requiredHeight}px`;
            }
        }
        if (textArea.clientHeight < textArea.scrollHeight) {
            textArea.style.height = `${textArea.scrollHeight}px`;
            if (textArea.clientHeight < textArea.scrollHeight) {
                textArea.style.height = `${(textArea.scrollHeight * 2 - textArea.clientHeight)}px`;
            }
        }
        const updatedHeight = textArea.style.height;
        if (updatedHeight) {
            this.messageBoxHeight = parseInt(updatedHeight, 10) || ScmWidget.MESSAGE_BOX_MIN_HEIGHT;
            if (this.messageBoxHeight > ScmWidget.MESSAGE_BOX_MIN_HEIGHT) {
                textArea.style.overflow = 'auto';
            } else {
                // Hide the scroll-bar if we shrink down the size.
                textArea.style.overflow = 'hidden';
            }
        }
    }

    // tslint:disable-next-line:no-any
    restoreState(oldState: any): void {
        this.selectedRepoUri = oldState.selectedRepoUri;
        const repository = this.scmService.repositories.find(repo => repo.provider.rootUri === this.selectedRepoUri);
        if (repository) {
            // repository.setSelected(true);
            this.scmService.selectedRepository = repository;
            this.message = oldState.message;
        }
    }

    storeState(): object {
        return {
            selectedRepoUri: this.selectedRepoUri,
            message: this.message
        };
    }
}

export namespace ScmWidget {

    export namespace Styles {
        export const MAIN_CONTAINER = 'theia-scm-main-container';
        export const PROVIDER_CONTAINER = 'theia-scm-provider-container';
        export const PROVIDER_NAME = 'theia-scm-provider-name';
        export const GROUPS_CONTAINER = 'groups-outer-container';
        export const INPUT_MESSAGE_CONTAINER = 'theia-scm-input-message-container';
        export const INPUT_MESSAGE = 'theia-scm-input-message';
        export const VALIDATION_MESSAGE = 'theia-scm-input-validation-message';
        export const NO_SELECT = 'no-select';
    }

    export namespace ContextMenu {
        export const PATH: MenuPath = ['scm-widget-context-menu'];
        export const INPUT_GROUP: MenuPath = [...PATH, '1_input'];
        export const FIRST_GROUP: MenuPath = [...PATH, '2_other'];
        export const SECOND_GROUP: MenuPath = [...PATH, '3_other'];
        export const BATCH: MenuPath = [...PATH, '3_batch'];
    }
}

export namespace ScmResourceItem {
    export interface Props {
        name: string,
        path: string,
        icon: string,
        letter: string,
        color: string,
        resource: ScmResource,
        groupLabel: string,
        groupId: string,
        scmResourceCommandRegistry: ScmResourceCommandRegistry,
        commandRegistry: CommandRegistry,
        open: () => Promise<void>,
        selectChange: (change: ScmResource) => void,
        renderContextMenu: (event: React.MouseEvent<HTMLElement>, group: string[]) => void
    }
}

class ScmResourceItem extends React.Component<ScmResourceItem.Props> {
    protected readonly selectChange = () => this.props.selectChange(this.props.resource);
    render() {
        const {name, path, icon, letter, color, open} = this.props;
        const style = {
            color
        };
        const renderContextMenu = (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            this.props.renderContextMenu(event, ['scm-resource-context-menu_' + this.props.groupId]);
        };
        const tooltip = this.props.resource.decorations ? this.props.resource.decorations.tooltip : '';
        return <div className={`scmItem ${ScmWidget.Styles.NO_SELECT}${this.props.resource.selected ? ' ' + SELECTED_CLASS : ''}`}
                    onContextMenu={renderContextMenu}>
            <div className='noWrapInfo' onDoubleClick={open} onClick={this.selectChange}>
                <span className={icon + ' file-icon'}/>
                <span className='name'>{name}</span>
                <span className='path'>{path}</span>
            </div>
            <div className='itemButtonsContainer'>
                {this.renderScmItemButtons()}
                <div title={`${tooltip}`} className={'status'} style={style}>
                    {letter}
                </div>
            </div>
        </div>;
    }

    protected renderScmItemButtons(): React.ReactNode {
        const commands = this.props.scmResourceCommandRegistry.getCommands(this.props.groupId);
        if (commands) {
            return <div className='buttons'>
                {commands.map(command => this.renderScmItemButton(command))}
            </div>;
        }
    }

    protected renderScmItemButton(commandId: string): React.ReactNode {
        const command = this.props.commandRegistry.getCommand(commandId);
        if (command) {
            const execute = () => {
                const resource = this.props.resource;
                const arg = {
                    id: 3,
                    handle: resource.handle,
                    groupHandle: resource.groupHandle,
                    sourceControlHandle: resource.sourceControlHandle,
                    uri: this.props.resource.sourceUri.toString()
                };
                this.props.commandRegistry.executeCommand(commandId, arg);
            };
            return <div className='toolbar-button' key={command.id}>
                <a className={command.iconClass} title={command.label} onClick={execute}/>
            </div>;
        }
    }
}

export namespace ScmResourceGroupsContainer {
    export interface Props {
        id: string,
        repository: ScmRepository,
        scmResourceCommandRegistry: ScmResourceCommandRegistry,
        scmGroupCommandRegistry: ScmGroupCommandRegistry,
        commandRegistry: CommandRegistry,
        selectChange: (change: ScmResource) => void,
        addScmListKeyListeners: (id: string) => void,
        scmNodes: ScmResource[],
        renderContextMenu: (event: React.MouseEvent<HTMLElement>, group: string[] | undefined) => void
    }
}

class ScmResourceGroupsContainer extends React.Component<ScmResourceGroupsContainer.Props> {
    render() {
        return (
            <div className={ScmWidget.Styles.GROUPS_CONTAINER} id={this.props.id} tabIndex={2}>
                {this.props.repository.provider.groups ? this.props.repository.provider.groups.map(group => this.renderGroup(group)) : undefined}
            </div>
        );
    }

    private renderGroup(group: ScmResourceGroup): React.ReactNode {
        if (group.resources.length > 0) {
            return <ScmResourceGroupContainer
                group={group}
                key={group.id}
                scmResourceCommandRegistry={this.props.scmResourceCommandRegistry}
                scmGroupCommandRegistry={this.props.scmGroupCommandRegistry}
                selectChange={this.props.selectChange}
                scmNodes={this.props.scmNodes}
                renderContextMenu={this.props.renderContextMenu}
                commandRegistry={this.props.commandRegistry}/>;
        }
    }
    componentDidMount() {
        this.props.addScmListKeyListeners(this.props.id);
    }
}

namespace ScmResourceGroupContainer {
    export interface Props {
        group: ScmResourceGroup,
        scmNodes: ScmResource[],
        scmResourceCommandRegistry: ScmResourceCommandRegistry
        scmGroupCommandRegistry: ScmGroupCommandRegistry
        commandRegistry: CommandRegistry;
        selectChange: (change: ScmResource) => void
        renderContextMenu: (event: React.MouseEvent<HTMLElement>, group: string[]) => void
    }
}

class ScmResourceGroupContainer extends React.Component<ScmResourceGroupContainer.Props> {
    render() {
        const group = this.props.group;
        const renderContextMenu = (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            this.props.renderContextMenu(event, ['scm-group-context-menu_' + group.id]);
        };
        return <div key={`${group.id}`}>
            <div className='theia-header scm-theia-header' onContextMenu={renderContextMenu}>
                {`${group.label}`}
                {this.renderChangeCount(group.resources.length)}
                {this.renderGroupButtons()}
            </div>
            <div>{group.resources.map(resource => this.renderScmResourceItem(this.props.scmNodes, resource, group.provider.rootUri))}</div>
        </div>;
    }

    protected renderChangeCount(changes: number | undefined): React.ReactNode {
        if (changes) {
            return <div className='notification-count-container scm-change-count'>
                <span className='notification-count'>{changes}</span>
            </div>;
        }
    }

    protected renderGroupButtons(): React.ReactNode {
        const commands = this.props.scmGroupCommandRegistry.getCommands(this.props.group.id);
        if (commands) {
            return <div className='scm-change-list-buttons-container'>
                {commands.map(command => this.renderGroupButton(command))}
            </div>;
        }
    }

    protected renderGroupButton(commandId: string): React.ReactNode {
        const command = this.props.commandRegistry.getCommand(commandId);
        if (command && command.category === 'inline') {
            const execute = () => {
                const group = this.props.group;
                const arg = {
                    id: 2,
                    groupHandle: group.handle,
                    sourceControlHandle: group.sourceControlHandle
                };
                this.props.commandRegistry.executeCommand(commandId, arg);
            };
            return <a className='toolbar-button' key={command.id}>
                <i className={command.iconClass} title={command.label} onClick={execute}/>
            </a>;
        }
    }

    protected renderScmResourceItem(scmNodes: ScmResource[], resource: ScmResource, repoUri: string | undefined): React.ReactNode {
        if (!repoUri) {
            return undefined;
        }
        const open = () => {
            resource.open();
            return Promise.resolve(undefined);
        };
        if (scmNodes) {
            const res = scmNodes.find(node => node.sourceUri.toString() === resource.sourceUri.toString() &&
                ((node.group && resource.group) ? node.group.label === resource.group.label : true));
            if (res) {
                resource = res;
            }
        }
        const decorations = resource.decorations;
        const uri = resource.sourceUri.path.toString();
        const project = repoUri.substring(repoUri.lastIndexOf('/') + 1);
        const name = uri.substring(uri.lastIndexOf('/') + 1) + ' ';
        const path = uri.substring(uri.lastIndexOf(project) + project.length + 1, uri.lastIndexOf('/'));
        return <ScmResourceItem key={`${resource.sourceUri}`}
                                name={name}
                                path={path.length > 1 ? path : ''}
                                icon={(decorations && decorations.icon) ? decorations.icon : ''}
                                color={(decorations && decorations.color) ? decorations.color : ''}
                                letter={(decorations && decorations.letter) ? decorations.letter : ''}
                                resource={resource}
                                open={open}
                                groupLabel={this.props.group.label}
                                groupId={this.props.group.id}
                                commandRegistry={this.props.commandRegistry}
                                scmResourceCommandRegistry={this.props.scmResourceCommandRegistry}
                                selectChange={this.props.selectChange}
                                renderContextMenu={this.props.renderContextMenu}
        />;
    }
}
