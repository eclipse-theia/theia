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
import { ContextMenuRenderer, SELECTED_CLASS, StatefulWidget, StorageService } from '@theia/core/lib/browser';
import * as React from 'react';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import {
    InputValidation,
    InputValidator,
    ScmInput,
    ScmRepository,
    ScmResource,
    ScmResourceGroup,
    ScmService,
    ScmAmendSupport
} from './scm-service';
import { CommandRegistry, MenuPath } from '@theia/core';
import { EditorManager } from '@theia/editor/lib/browser';
import { ScmAvatarService } from './scm-avatar-service';
import { ScmTitleCommandRegistry, ScmTitleItem } from './scm-title-command-registry';
import { ScmResourceCommandRegistry } from './scm-resource-command-registry';
import { ScmGroupCommandRegistry } from './scm-group-command-registry';
import { ScmNavigableListWidget } from './scm-navigable-list-widget';
import { ScmAmendComponent } from './scm-amend-component';
import { KeyboardEvent } from 'react';

@injectable()
export class ScmWidget extends ScmNavigableListWidget<ScmResource> implements StatefulWidget {
    private static MESSAGE_BOX_MIN_HEIGHT = 25;

    protected message: string = '';
    protected messageBoxHeight: number = ScmWidget.MESSAGE_BOX_MIN_HEIGHT;
    protected inputCommandMessageValidator: InputValidator | undefined;
    protected inputCommandMessageValidation: InputValidation | undefined;
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
    @inject(ScmAvatarService) protected readonly avatarService: ScmAvatarService;
    @inject(StorageService) protected readonly storageService: StorageService;

    constructor() {
        super();
        this.id = 'theia-scmContainer';
        this.title.label = 'Source Control';
        this.title.caption = 'SCM';
        this.title.closable = true;
        this.title.iconClass = 'scm-tab-icon';
        this.addClass('theia-scm');
        this.scrollContainer = ScmWidget.Styles.GROUPS_CONTAINER;

        this.update();
    }

    @postConstruct()
    protected init() {
        const changeHandler = (repository: ScmRepository) => {
            repository.provider.onDidChangeResources(() => {
                if (this.selectedRepoUri === repository.provider.rootUri) {
                    this.update();
                }
            });
            repository.provider.onDidChange(() => {
                this.update();
            });
        };
        this.scmService.repositories.forEach(repository => {
            changeHandler(repository);
        });
        this.scmService.onDidAddRepository(repository => {
            changeHandler(repository);
        });
        this.scmService.onDidChangeSelectedRepositories(repository => {
            if (repository) {
                this.selectedRepoUri = repository.provider.rootUri;
                this.update();
            } else {
                this.selectedRepoUri = undefined;
            }
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

        const amendSupport: ScmAmendSupport | undefined = repository.provider.amendSupport;

        return <div className={ScmWidget.Styles.MAIN_CONTAINER}>
            <div className='headerContainer' style={{ flexGrow: 0 }}>
                {this.renderInput(input, repository)}
                {this.renderCommandBar(repository)}
            </div>
            <ScmResourceGroupsContainer
                style={{ flexGrow: 1 }}
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
            {
                amendSupport
                    ? <ScmAmendComponent
                        key={`amend:${repository.provider.rootUri}`}
                        style={{ flexGrow: 0 }}
                        id={this.scrollContainer}
                        repository={repository}
                        scmAmendSupport={amendSupport}
                        setCommitMessage={this.setInputMessages}
                        avatarService={this.avatarService}
                        storageService={this.storageService}
                    />
                    : ''
            }
        </div>;
    }

    protected renderInput(input: ScmInput, repository: ScmRepository): React.ReactNode {
        const validationStatus = this.inputCommandMessageValidation ? this.inputCommandMessageValidation.type : 'idle';
        const validationMessage = this.inputCommandMessageValidation ? this.inputCommandMessageValidation.message : '';
        const keyBinding = navigator.appVersion.indexOf('Mac') !== -1 ? 'Cmd+Enter' : 'Ctrl+Enter';
        // tslint:disable-next-line:no-any
        const format = (value: string, ...args: string[]): string => {
            if (args.length !== 0) {
                return value.replace(/{(\d+)}/g, (found, n) => {
                    const i = parseInt(n);
                    return isNaN(i) || i < 0 || i >= args.length ? found : args[i];
                });
            }
            return value;
        };
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
                        display: !!this.inputCommandMessageValidation ? 'block' : 'none'
                    }
                }>{validationMessage}</div>
        </div>;
    }

    public get messageInput(): HTMLTextAreaElement {
        return document.getElementById(ScmWidget.Styles.INPUT_MESSAGE) as HTMLTextAreaElement;
    }

    protected onInputMessageChange(e: Event): void {
        const { target } = e;
        if (target instanceof HTMLTextAreaElement) {
            const { value } = target;
            this.message = value;
            const repository = this.scmService.selectedRepository;
            const equal = (left: InputValidation | undefined, right: InputValidation | undefined): boolean => {
                if (left && right) {
                    return left.message === right.message && left.type === right.type;
                }
                return left === right;
            };
            if (repository) {
                repository.input.value = value;
            }
            this.resize(target);
            if (this.inputCommandMessageValidator) {
                this.inputCommandMessageValidator(value).then(result => {
                    if (!equal(this.inputCommandMessageValidation, result)) {
                        this.inputCommandMessageValidation = result;
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
                    <i className='fa fa-ellipsis-h' />
                </a>
            </div>
            <div className='placeholder' />
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
        if (command && command.props) {
            const props = command.props;
            if (props && props['group'] === 'navigation') {
                const execute = () => {
                    this.commandRegistry.executeCommand(item.command);
                };
                return <a className='toolbar-button' key={command.id}>
                    <i className={command.iconClass} title={command.label} onClick={execute} />
                </a>;
            }
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
        this.inputCommandMessageValidation = undefined;
        if (this.message.trim().length === 0) {
            this.inputCommandMessageValidation = {
                type: 'error',
                message: 'Please provide an input'
            };
        }
        if (this.inputCommandMessageValidation === undefined) {
            this.commandRegistry.executeCommand(commandId, providerId);
            this.doSetInputMessages('');
            this.update();
        } else {
            const messageInput = this.messageInput;
            if (messageInput) {
                this.update();
                messageInput.focus();
            }
        }
    }

    protected readonly setInputMessages = (message: string) => this.doSetInputMessages(message);

    protected doSetInputMessages(message: string): void {
        this.message = message;
        const messageInput = this.messageInput;
        messageInput.value = message;
        this.resize(messageInput);
    }

    resize(textArea: HTMLTextAreaElement): void {
        // tslint:disable-next-line:no-null-keyword
        const fontSize = Number.parseInt(window.getComputedStyle(textArea, undefined).getPropertyValue('font-size').split('px')[0] || '0', 10);
        const { value } = textArea;
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
        const { name, path, icon, letter, color, open } = this.props;
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
                <span className={icon + ' file-icon'} />
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
                <a className={command.iconClass} title={command.label} onClick={execute} />
            </div>;
        }
    }
}

export namespace ScmResourceGroupsContainer {
    export interface Props {
        id: string,
        style: React.CSSProperties | undefined,
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
            <div className={ScmWidget.Styles.GROUPS_CONTAINER} style={this.props.style} id={this.props.id} tabIndex={2}>
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
                commandRegistry={this.props.commandRegistry} />;
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
        return <div className={'changesContainer'} key={`${group.id}`}>
            <div className='theia-header scm-theia-header' onContextMenu={renderContextMenu}>
                <div className='noWrapInfo'>{`${group.label}`}</div>
                {this.renderGroupButtons()}
                {this.renderChangeCount(group.resources.length)}
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
        if (command && command.props) {
            const props = command.props;
            if (props && props['group'] === 'inline') {
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
                    <i className={command.iconClass} title={command.label} onClick={execute} />
                </a>;
            }
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
