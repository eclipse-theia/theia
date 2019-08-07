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

// tslint:disable:no-any
// tslint:disable:no-null-keyword

import * as React from 'react';
import TextareaAutosize from 'react-autosize-textarea';
import { Message } from '@phosphor/messaging';
import { ElementExt } from '@phosphor/domutils';
import { injectable, inject, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { MenuModelRegistry, ActionMenuNode, CompositeMenuNode, MenuPath } from '@theia/core/lib/common/menu';
import { DisposableCollection, Disposable } from '@theia/core/lib/common/disposable';
import {
    ContextMenuRenderer, SELECTED_CLASS, StorageService,
    ReactWidget, Key, LabelProvider, DiffUris, KeybindingRegistry, Widget, StatefulWidget, CorePreferences
} from '@theia/core/lib/browser';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { EditorManager, DiffNavigatorProvider, EditorWidget } from '@theia/editor/lib/browser';
import { ScmAvatarService } from './scm-avatar-service';
import { ScmAmendComponent } from './scm-amend-component';
import { ScmContextKeyService } from './scm-context-key-service';
import { ScmService } from './scm-service';
import { ScmInput } from './scm-input';
import { ScmRepository } from './scm-repository';
import { ScmResource, ScmResourceGroup } from './scm-provider';

@injectable()
export class ScmWidget extends ReactWidget implements StatefulWidget {

    static ID = 'scm-view';

    static RESOURCE_GROUP_CONTEXT_MENU = ['RESOURCE_GROUP_CONTEXT_MENU'];
    static RESOURCE_GROUP_INLINE_MENU = ['RESOURCE_GROUP_INLINE_MENU'];

    static RESOURCE_INLINE_MENU = ['RESOURCE_INLINE_MENU'];
    static RESOURCE_CONTEXT_MENU = ['RESOURCE_CONTEXT_MENU'];

    @inject(CorePreferences) protected readonly corePreferences: CorePreferences;
    @inject(ScmService) protected readonly scmService: ScmService;
    @inject(CommandRegistry) protected readonly commands: CommandRegistry;
    @inject(KeybindingRegistry) protected readonly keybindings: KeybindingRegistry;
    @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry;
    @inject(ScmContextKeyService) protected readonly contextKeys: ScmContextKeyService;
    @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(ScmAvatarService) protected readonly avatarService: ScmAvatarService;
    @inject(StorageService) protected readonly storageService: StorageService;
    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(DiffNavigatorProvider) protected readonly diffNavigatorProvider: DiffNavigatorProvider;

    // TODO: a hack to install DOM listeners, replace it with React, i.e. use TreeWidget instead
    protected _scrollContainer: string;
    protected set scrollContainer(id: string) {
        this._scrollContainer = id + Date.now();
    }
    protected get scrollContainer(): string {
        return this._scrollContainer;
    }

    /** don't modify DOM use React! only exposed for `focusInput` */
    protected readonly inputRef = React.createRef<HTMLTextAreaElement>();

    constructor() {
        super();
        this.node.tabIndex = 0;
        this.id = ScmWidget.ID;
        this.addClass('theia-scm');
        this.scrollContainer = ScmWidget.Styles.GROUPS_CONTAINER;
    }

    @postConstruct()
    protected init(): void {
        this.refresh();
        this.toDispose.push(this.scmService.onDidChangeSelectedRepository(() => this.refresh()));
        this.toDispose.push(this.labelProvider.onDidChange(() => this.update()));
    }

    protected readonly toDisposeOnRefresh = new DisposableCollection();
    protected refresh(): void {
        this.toDisposeOnRefresh.dispose();
        this.toDispose.push(this.toDisposeOnRefresh);
        const repository = this.scmService.selectedRepository;
        this.title.label = repository ? repository.provider.label : 'no repository found';
        this.title.caption = this.title.label;
        this.update();
        if (repository) {
            this.toDisposeOnRefresh.push(repository.onDidChange(() => this.update()));
            // render synchronously to avoid cursor jumping
            // see https://stackoverflow.com/questions/28922275/in-reactjs-why-does-setstate-behave-differently-when-called-synchronously/28922465#28922465
            this.toDisposeOnRefresh.push(repository.input.onDidChange(() => this.updateImmediately()));
            this.toDisposeOnRefresh.push(repository.input.onDidFocus(() => this.focusInput()));
        }
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        (this.inputRef.current || this.node).focus();
    }

    protected onAfterShow(msg: Message): void {
        super.onAfterShow(msg);
        this.update();
    }

    protected updateImmediately(): void {
        this.onUpdateRequest(Widget.Msg.UpdateRequest);
    }

    protected onUpdateRequest(msg: Message): void {
        if (!this.isAttached || !this.isVisible) {
            return;
        }
        this.onRender.push(Disposable.create(() => async () => {
            const selected = this.node.getElementsByClassName(SELECTED_CLASS)[0];
            if (selected) {
                ElementExt.scrollIntoViewIfNeeded(this.node, selected);
            }
        }));
        super.onUpdateRequest(msg);
    }

    protected addScmListKeyListeners = (id: string) => {
        const container = document.getElementById(id);
        if (container) {
            this.addScmListNavigationKeyListeners(container);
        }
    }

    protected render(): React.ReactNode {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return <AlertMessage
                type='WARNING'
                header='No repository found'
            />;
        }
        const input = repository.input;
        const amendSupport = repository.provider.amendSupport;

        return <div className={ScmWidget.Styles.MAIN_CONTAINER}>
            <div className='headerContainer' style={{ flexGrow: 0 }}>
                {this.renderInput(input, repository)}
            </div>
            <ScmResourceGroupsContainer
                style={{ flexGrow: 1 }}
                id={this.scrollContainer}
                repository={repository}
                commands={this.commands}
                menus={this.menus}
                contextKeys={this.contextKeys}
                labelProvider={this.labelProvider}
                addScmListKeyListeners={this.addScmListKeyListeners}
                contextMenuRenderer={this.contextMenuRenderer}
                corePreferences={this.corePreferences}
            />
            {amendSupport && <ScmAmendComponent
                key={`amend:${repository.provider.rootUri}`}
                style={{ flexGrow: 0 }}
                id={this.scrollContainer}
                repository={repository}
                scmAmendSupport={amendSupport}
                setCommitMessage={this.setInputValue}
                avatarService={this.avatarService}
                storageService={this.storageService}
            />}
        </div>;
    }

    protected renderInput(input: ScmInput, repository: ScmRepository): React.ReactNode {
        const validationStatus = input.issue ? input.issue.type : 'idle';
        const validationMessage = input.issue ? input.issue.message : '';
        const format = (value: string, ...args: string[]): string => {
            if (args.length !== 0) {
                return value.replace(/{(\d+)}/g, (found, n) => {
                    const i = parseInt(n);
                    return isNaN(i) || i < 0 || i >= args.length ? found : args[i];
                });
            }
            return value;
        };

        const keybinding = this.keybindings.acceleratorFor(this.keybindings.getKeybindingsForCommand('scm.acceptInput')[0]).join('+');
        const message = format(input.placeholder || '', keybinding);
        return <div className={ScmWidget.Styles.INPUT_MESSAGE_CONTAINER}>
            <TextareaAutosize
                className={`${ScmWidget.Styles.INPUT_MESSAGE} theia-scm-input-message-${validationStatus}`}
                id={ScmWidget.Styles.INPUT_MESSAGE}
                placeholder={message}
                autoFocus={true}
                tabIndex={1}
                value={input.value}
                onChange={this.setInputValue}
                ref={this.inputRef}
                rows={1}
                maxRows={6} /* from VS Code */>
            </TextareaAutosize>
            <div
                className={
                    `${ScmWidget.Styles.VALIDATION_MESSAGE} ${ScmWidget.Styles.NO_SELECT}
                    theia-scm-validation-message-${validationStatus} theia-scm-input-message-${validationStatus}`
                }
                style={{
                    display: !!input.issue ? 'block' : 'none'
                }}>{validationMessage}</div>
        </div>;
    }

    protected focusInput(): void {
        if (this.inputRef.current) {
            this.inputRef.current.focus();
        }
    }

    protected setInputValue = (event: React.FormEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLTextAreaElement> | string) => {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            repository.input.value = typeof event === 'string' ? event : event.currentTarget.value;
        }
    }

    protected acceptInput = () => this.commands.executeCommand('scm.acceptInput');

    protected addScmListNavigationKeyListeners(container: HTMLElement): void {
        this.addKeyListener(container, Key.ARROW_LEFT, () => this.openPreviousChange());
        this.addKeyListener(container, Key.ARROW_RIGHT, () => this.openNextChange());
        this.addKeyListener(container, Key.ARROW_UP, () => this.selectPreviousResource());
        this.addKeyListener(container, Key.ARROW_DOWN, () => this.selectNextResource());
        this.addKeyListener(container, Key.ENTER, () => this.openSelected());
    }

    protected async openPreviousChange(): Promise<void> {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return;
        }
        const selected = repository.selectedResource;
        if (selected) {
            const widget = await this.openResource(selected);
            if (widget) {
                const diffNavigator = this.diffNavigatorProvider(widget.editor);
                if (diffNavigator.canNavigate() && diffNavigator.hasPrevious()) {
                    diffNavigator.previous();
                } else {
                    const previous = repository.selectPreviousResource();
                    if (previous) {
                        previous.open();
                    }
                }
            } else {
                const previous = repository.selectPreviousResource();
                if (previous) {
                    previous.open();
                }
            }
        }
    }

    protected async openNextChange(): Promise<void> {
        const repository = this.scmService.selectedRepository;
        if (!repository) {
            return;
        }
        const selected = repository.selectedResource;
        if (selected) {
            const widget = await this.openResource(selected);
            if (widget) {
                const diffNavigator = this.diffNavigatorProvider(widget.editor);
                if (diffNavigator.canNavigate() && diffNavigator.hasNext()) {
                    diffNavigator.next();
                } else {
                    const next = repository.selectNextResource();
                    if (next) {
                        next.open();
                    }
                }
            } else {
                const next = repository.selectNextResource();
                if (next) {
                    next.open();
                }
            }
        } else if (repository && repository.resources.length) {
            repository.selectedResource = repository.resources[0];
            repository.selectedResource.open();
        }
    }

    protected async openResource(resource: ScmResource): Promise<EditorWidget | undefined> {
        try {
            await resource.open();
        } catch (e) {
            console.error('Failed to open a SCM resource', e);
            return undefined;
        }

        let standaloneEditor: EditorWidget | undefined;
        const resourcePath = resource.sourceUri.path.toString();
        for (const widget of this.editorManager.all) {
            const resourceUri = widget.getResourceUri();
            const editorResourcePath = resourceUri && resourceUri.path.toString();
            if (resourcePath === editorResourcePath) {
                if (widget.editor.uri.scheme === DiffUris.DIFF_SCHEME) {
                    // prefer diff editor
                    return widget;
                } else {
                    standaloneEditor = widget;
                }
            }
            if (widget.editor.uri.scheme === DiffUris.DIFF_SCHEME
                && String(widget.getResourceUri()) === resource.sourceUri.toString()) {
                return widget;
            }
        }
        // fallback to standalone editor
        return standaloneEditor;
    }

    protected selectPreviousResource(): ScmResource | undefined {
        const repository = this.scmService.selectedRepository;
        return repository && repository.selectPreviousResource();
    }

    protected selectNextResource(): ScmResource | undefined {
        const repository = this.scmService.selectedRepository;
        return repository && repository.selectNextResource();
    }

    protected openSelected(): void {
        const repository = this.scmService.selectedRepository;
        const resource = repository && repository.selectedResource;
        if (resource) {
            resource.open();
        }
    }

    storeState(): any {
        const repository = this.scmService.selectedRepository;
        return repository && repository.input;
    }

    restoreState(oldState: any): void {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            repository.input.fromJSON(oldState);
        }
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
    export interface Props {
        repository: ScmRepository;
        commands: CommandRegistry;
        menus: MenuModelRegistry;
        contextKeys: ScmContextKeyService;
        labelProvider: LabelProvider;
        contextMenuRenderer: ContextMenuRenderer;
        corePreferences?: CorePreferences;
    }

}

export abstract class ScmElement<P extends ScmElement.Props = ScmElement.Props> extends React.Component<P, ScmElement.State> {

    constructor(props: P) {
        super(props);
        this.state = {
            hover: false
        };
    }

    protected detectHover = (element: HTMLElement | null) => {
        if (element) {
            window.requestAnimationFrame(() => {
                const hover = element.matches(':hover');
                this.setState({ hover });
            });
        }
    }
    protected showHover = () => this.setState({ hover: true });
    protected hideHover = () => this.setState({ hover: false });

    protected renderContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        const { group, contextKeys, contextMenuRenderer } = this.props;
        const currentScmResourceGroup = contextKeys.scmResourceGroup.get();
        contextKeys.scmResourceGroup.set(group.id);
        try {
            contextMenuRenderer.render({
                menuPath: this.contextMenuPath,
                anchor: event.nativeEvent,
                args: this.contextMenuArgs
            });
        } finally {
            contextKeys.scmResourceGroup.set(currentScmResourceGroup);
        }
    }

    protected abstract get contextMenuPath(): MenuPath;
    protected abstract get contextMenuArgs(): any[];

}
export namespace ScmElement {
    export interface Props extends ScmWidget.Props {
        group: ScmResourceGroup
    }
    export interface State {
        hover: boolean
    }
}

export class ScmResourceComponent extends ScmElement<ScmResourceComponent.Props> {

    render(): JSX.Element | undefined {
        const { hover } = this.state;
        const { name, repository, resource, labelProvider, commands, menus, contextKeys } = this.props;
        const rootUri = resource.group.provider.rootUri;
        if (!rootUri) {
            return undefined;
        }
        const decorations = resource.decorations;
        const icon = decorations && decorations.icon || '';
        const color = decorations && decorations.color || '';
        const letter = decorations && decorations.letter || '';
        const tooltip = decorations && decorations.tooltip || '';
        const relativePath = new URI(rootUri).relative(resource.sourceUri.parent);
        const path = relativePath ? relativePath.toString() : labelProvider.getLongName(resource.sourceUri.parent);
        return <div key={String(resource.sourceUri)}
            className={`scmItem ${ScmWidget.Styles.NO_SELECT}${repository.selectedResource === resource ? ' ' + SELECTED_CLASS : ''}`}
            onContextMenu={this.renderContextMenu}
            onMouseEnter={this.showHover}
            onMouseLeave={this.hideHover}
            ref={this.detectHover}
            onClick={this.handleClick}
            onDoubleClick={this.handleDoubleClick} >
            <div className='noWrapInfo' >
                <span className={icon + ' file-icon'} />
                <span className='name'>{name}</span>
                <span className='path'>{path}</span>
            </div>
            <ScmInlineActions {...{
                hover,
                menu: menus.getMenu(ScmWidget.RESOURCE_INLINE_MENU),
                args: this.contextMenuArgs,
                commands,
                contextKeys,
                group: resource.group
            }}>
                <div title={tooltip} className='status' style={{ color }}>
                    {letter}
                </div>
            </ScmInlineActions>
        </div >;
    }

    protected open = () => this.props.resource.open();

    protected selectChange = () => this.props.repository.selectedResource = this.props.resource;

    protected readonly contextMenuPath = ScmWidget.RESOURCE_CONTEXT_MENU;
    protected get contextMenuArgs(): any[] {
        return [this.props.resource];  // TODO support multiselection
    }

    /**
     * Handle the single clicking of nodes present in the widget.
     */
    protected handleClick = () => {
        // Determine the behavior based on the preference value.
        const isSingle = this.props.corePreferences && this.props.corePreferences['workbench.list.openMode'] === 'singleClick';
        this.selectChange();
        if (isSingle) {
            this.open();
        }
    }

    /**
     * Handle the double clicking of nodes present in the widget.
     */
    protected handleDoubleClick = () => {
        // Determine the behavior based on the preference value.
        const isDouble = this.props.corePreferences && this.props.corePreferences['workbench.list.openMode'] === 'doubleClick';
        // Nodes should only be opened through double clicking if the correct preference is set.
        if (isDouble) {
            this.open();
        }
    }
}
export namespace ScmResourceComponent {
    export interface Props extends ScmElement.Props {
        name: string;
        resource: ScmResource;
    }
}

export class ScmResourceGroupsContainer extends React.Component<ScmResourceGroupsContainer.Props> {
    render(): JSX.Element {
        const { groups } = this.props.repository.provider;
        return <div className={ScmWidget.Styles.GROUPS_CONTAINER + ' ' + ScmWidget.Styles.NO_SELECT}
            style={this.props.style}
            id={this.props.id}
            tabIndex={2}
            onFocus={this.select}>
            {groups && this.props.repository.provider.groups.map(group => this.renderGroup(group))}
        </div>;
    }

    protected select = () => {
        const selectedResource = this.props.repository.selectedResource;
        if (!selectedResource && this.props.repository.resources.length) {
            this.props.repository.selectedResource = this.props.repository.resources[0];
        }
    }

    protected renderGroup(group: ScmResourceGroup): React.ReactNode {
        const visible = !!group.resources.length || !group.hideWhenEmpty;
        return visible && <ScmResourceGroupContainer
            key={group.id}
            repository={this.props.repository}
            group={group}
            contextMenuRenderer={this.props.contextMenuRenderer}
            commands={this.props.commands}
            menus={this.props.menus}
            contextKeys={this.props.contextKeys}
            labelProvider={this.props.labelProvider}
            corePreferences={this.props.corePreferences} />;
    }

    componentDidMount(): void {
        this.props.addScmListKeyListeners(this.props.id);
    }
}
export namespace ScmResourceGroupsContainer {
    export interface Props extends ScmWidget.Props {
        id: string;
        style?: React.CSSProperties;
        addScmListKeyListeners: (id: string) => void
    }
}

export class ScmResourceGroupContainer extends ScmElement {

    render(): JSX.Element {
        const { hover } = this.state;
        const { group, menus, commands, contextKeys } = this.props;
        return <div className='changesContainer'>
            <div className='theia-header scm-theia-header'
                onContextMenu={this.renderContextMenu}
                onMouseEnter={this.showHover}
                onMouseLeave={this.hideHover}
                ref={this.detectHover}>
                <div className='noWrapInfo'>{group.label}</div>
                <ScmInlineActions {...{
                    hover,
                    args: this.contextMenuArgs,
                    menu: menus.getMenu(ScmWidget.RESOURCE_GROUP_INLINE_MENU),
                    commands,
                    contextKeys,
                    group
                }}>
                    {this.renderChangeCount()}
                </ScmInlineActions>
            </div>
            <div>{group.resources.map(resource => this.renderScmResourceItem(resource))}</div>
        </div>;
    }

    protected renderChangeCount(): React.ReactNode {
        return <div className='notification-count-container scm-change-count'>
            <span className='notification-count'>{this.props.group.resources.length}</span>
        </div>;
    }

    protected renderScmResourceItem(resource: ScmResource): React.ReactNode {
        const name = this.props.labelProvider.getName(resource.sourceUri);
        return <ScmResourceComponent
            key={String(resource.sourceUri)}
            {...{
                ...this.props,
                name,
                resource
            }}
        />;
    }

    protected readonly contextMenuPath = ScmWidget.RESOURCE_GROUP_CONTEXT_MENU;
    protected get contextMenuArgs(): any[] {
        return [this.props.group];
    }
}

export class ScmInlineActions extends React.Component<ScmInlineActions.Props> {
    render(): React.ReactNode {
        const { hover, menu, args, commands, group, contextKeys, children } = this.props;
        return <div className='theia-scm-inline-actions-container'>
            <div className='theia-scm-inline-actions'>
                {hover && menu.children.map((node, index) => node instanceof ActionMenuNode && <ScmInlineAction key={index} {...{ node, args, commands, group, contextKeys }} />)}
            </div>
            {children}
        </div>;
    }
}
export namespace ScmInlineActions {
    export interface Props {
        hover: boolean;
        menu: CompositeMenuNode;
        commands: CommandRegistry;
        group: ScmResourceGroup;
        contextKeys: ScmContextKeyService;
        args: any[];
        children?: React.ReactNode;
    }
}

export class ScmInlineAction extends React.Component<ScmInlineAction.Props> {
    render(): React.ReactNode {
        const { node, args, commands, group, contextKeys } = this.props;
        const currentScmResourceGroup = contextKeys.scmResourceGroup.get();
        contextKeys.scmResourceGroup.set(group.id);
        try {
            if (!commands.isVisible(node.action.commandId, ...args) || !contextKeys.match(node.action.when)) {
                return false;
            }
            return <div className='theia-scm-inline-action'>
                <a className={node.icon} title={node.label} onClick={this.execute} />
            </div>;
        } finally {
            contextKeys.scmResourceGroup.set(currentScmResourceGroup);
        }
    }

    protected execute = (event: React.MouseEvent) => {
        event.stopPropagation();

        const { commands, node, args } = this.props;
        commands.executeCommand(node.action.commandId, ...args);
    }
}
export namespace ScmInlineAction {
    export interface Props {
        node: ActionMenuNode;
        commands: CommandRegistry;
        group: ScmResourceGroup;
        contextKeys: ScmContextKeyService;
        args: any[];
    }
}
