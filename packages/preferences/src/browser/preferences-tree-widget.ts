/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { inject } from 'inversify';
import { Message } from '@phosphor/messaging';
import { PreferencesMenuFactory } from './preferences-menu-factory';
import { PreferencesDecorator } from './preferences-decorator';
import { toArray } from '@phosphor/algorithm';
import { DockPanel, SplitPanel, Widget } from '@phosphor/widgets';
import {
    ApplicationShell,
    ContextMenuRenderer,
    ExpandableTreeNode,
    PreferenceProperty,
    PreferenceSchemaProvider,
    PreferenceScope,
    PreferenceService,
    Saveable,
    SelectableTreeNode,
    TreeModel,
    TreeNode,
    TreeProps,
    TreeWidget,
    WidgetManager
} from '@theia/core/lib/browser';
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { EditorWidget } from '@theia/editor/lib/browser';
import { DisposableCollection, Emitter, Event, MaybePromise, MessageService } from '@theia/core';
import { PREFERENCES_CONTAINER_WIDGET_ID, PREFERENCES_TREE_WIDGET_ID } from './preferences-contribution';
import { Deferred } from '@theia/core/lib/common/promise-util';

export class PreferencesContainer extends SplitPanel implements ApplicationShell.TrackableWidgetProvider, Saveable {

    protected treeWidget: TreeWidget;
    private currentEditor: EditorWidget;
    private editors: EditorWidget[];
    private deferredEditors = new Deferred<EditorWidget[]>();

    get dirty(): boolean {
        return this.editors.some(editor => editor.saveable.dirty);
    }
    autoSave: 'on' | 'off';
    readonly onDirtyChangedEmitter: Emitter<void>;
    readonly onDirtyChanged: Event<void>;
    readonly save: () => MaybePromise<void>;

    protected readonly toDispose = new DisposableCollection();

    constructor(protected readonly widgetManager: WidgetManager,
                protected readonly shell: ApplicationShell,
                protected readonly preferenceService: PreferenceService,
                protected readonly messageService: MessageService,
                protected readonly userPreferenceProvider: UserPreferenceProvider,
                protected readonly workspacePreferenceProvider: WorkspacePreferenceProvider) {
        super();

        this.id = PREFERENCES_CONTAINER_WIDGET_ID;
        this.title.label = 'Preferences';
        this.title.closable = true;
        this.title.iconClass = 'fa fa-sliders';

        this.editors = [];

        this.onDirtyChangedEmitter = new Emitter<void>();
        this.onDirtyChanged = this.onDirtyChangedEmitter.event;
        this.save = () => {
            this.editors.forEach(editor => editor.saveable.save());
        };

        this.toDispose.push(this.onDirtyChangedEmitter);
    }

    dispose(): void {
        if (this.isDisposed) {
            return;
        }
        super.dispose();
        this.toDispose.dispose();
    }

    getTrackableWidgets(): Promise<Widget[]> {
        return this.deferredEditors.promise;
    }

    protected async onAfterAttach(msg: Message) {
        this.treeWidget = await this.widgetManager.getOrCreateWidget(PREFERENCES_TREE_WIDGET_ID) as TreeWidget;
        (this.treeWidget as PreferencesTreeWidget).onPreferenceSelected(value => {
            const preferenceName = Object.keys(value)[0];
            const preferenceValue = value[preferenceName];
            if (this.dirty) {
                this.messageService.warn('Preferences editor(s) has/have unsaved changes');
            } else {
                this.preferenceService.set(preferenceName,
                    preferenceValue,
                    this.currentEditor.title.label === 'User Preferences'
                        ? PreferenceScope.User
                        : PreferenceScope.Workspace);
            }
        });

        const editorsContainer = new PreferencesEditorsContainer(this.widgetManager, this.userPreferenceProvider, this.workspacePreferenceProvider);
        editorsContainer.onInit(() => {
            toArray(editorsContainer.widgets()).forEach(editor => {
                const editorWidget = editor as EditorWidget;
                this.editors.push(editorWidget);
                const savable = editorWidget.saveable;
                savable.onDirtyChanged(() => {
                    this.onDirtyChangedEmitter.fire(undefined);
                });
            });
            this.deferredEditors.resolve(this.editors);
        });
        editorsContainer.onEditorChanged(editor => {
            if (this.currentEditor) {
                this.currentEditor.saveable.save();
            }
            this.currentEditor = editor;
        });

        this.addWidget(this.treeWidget);
        this.addWidget(editorsContainer);
        this.treeWidget.activate();
        super.onAfterAttach(msg);
    }

    protected onActivateRequest(msg: Message): void {
        this.treeWidget.activate();
        super.onActivateRequest(msg);
    }

    protected onCloseRequest(msg: Message) {
        this.widgets.forEach(widget => widget.close());
        super.onCloseRequest(msg);
        this.dispose();
    }
}

export class PreferencesEditorsContainer extends DockPanel {

    private readonly onInitEmitter: Emitter<void>;
    private readonly onEditorChangedEmitter: Emitter<EditorWidget>;

    readonly onInit: Event<void>;
    readonly onEditorChanged: Event<EditorWidget>;

    protected readonly toDispose: DisposableCollection;

    constructor(protected readonly widgetManager: WidgetManager,
                protected readonly userPreferenceProvider: UserPreferenceProvider,
                protected readonly workspacePreferenceProvider: WorkspacePreferenceProvider) {
        super();

        this.onInitEmitter = new Emitter<void>();
        this.onEditorChangedEmitter = new Emitter<EditorWidget>();
        this.onInit = this.onInitEmitter.event;
        this.onEditorChanged = this.onEditorChangedEmitter.event;

        this.toDispose = new DisposableCollection();
        this.toDispose.push(this.onEditorChangedEmitter);
        this.toDispose.push(this.onInitEmitter);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    onCloseRequest(msg: Message) {
        toArray(this.widgets()).forEach(widget => widget.close());
        super.onCloseRequest(msg);
    }

    onUpdateRequest(msg: Message) {
        this.onEditorChangedEmitter.fire(this.selectedWidgets().next() as EditorWidget);

        super.onUpdateRequest(msg);
    }

    protected async onAfterAttach(msg: Message): Promise<void> {
        const userPreferences = await await this.widgetManager.getOrCreateWidget(
            'code-editor-opener',
            this.userPreferenceProvider.getUri().withoutFragment().toString()
        ) as EditorWidget;
        userPreferences.title.label = 'User Preferences';
        this.addWidget(userPreferences);

        const workspacePreferences = await this.widgetManager.getOrCreateWidget(
            'code-editor-opener',
            await this.workspacePreferenceProvider.getUri()
        ) as EditorWidget;
        workspacePreferences.title.label = 'Workspace Preferences';
        this.addWidget(workspacePreferences);

        super.onAfterAttach(msg);
        this.onInitEmitter.fire(undefined);
    }
}

export class PreferencesTreeWidget extends TreeWidget {

    private preferencesGroupNames: string[] = [];
    private readonly properties: { [name: string]: PreferenceProperty };
    private readonly onPreferenceSelectedEmitter: Emitter<{[key: string]: string}>;
    readonly onPreferenceSelected: Event<{[key: string]: string}>;

    protected readonly toDispose: DisposableCollection;

    @inject(PreferencesMenuFactory) protected readonly preferencesMenuFactory: PreferencesMenuFactory;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(PreferencesDecorator) protected readonly decorator: PreferencesDecorator;

    protected constructor(@inject(TreeModel) readonly model: TreeModel,
                          @inject(TreeProps) protected readonly treeProps: TreeProps,
                          @inject(ContextMenuRenderer) protected readonly contextMenuRenderer: ContextMenuRenderer,
                          @inject(PreferenceSchemaProvider) protected readonly preferenceSchemaProvider: PreferenceSchemaProvider) {
        super(treeProps, model, contextMenuRenderer);

        this.onPreferenceSelectedEmitter = new Emitter<{[key: string]: string}>();
        this.onPreferenceSelected = this.onPreferenceSelectedEmitter.event;
        this.toDispose = new DisposableCollection();
        this.toDispose.push(this.onPreferenceSelectedEmitter);

        this.id = PREFERENCES_TREE_WIDGET_ID;

        this.properties = this.preferenceSchemaProvider.getCombinedSchema().properties;
        for (const property in this.properties) {
            if (property) {
                const group: string = property.substring(0, property.indexOf('.'));
                if (this.preferencesGroupNames.indexOf(group) < 0) {
                    this.preferencesGroupNames.push(group);
                }
            }
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected onAfterAttach(msg: Message): void {
        this.initializeModel();
        super.onAfterAttach(msg);
    }

    protected handleContextMenuEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        super.handleContextMenuEvent(node, event);
        if ((<ExpandableTreeNode>node).expanded === undefined) {
            this.openContextMenu(node, event.nativeEvent.x, event.nativeEvent.y);
        }
    }

    protected handleClickEvent(node: TreeNode | undefined, event: React.MouseEvent<HTMLElement>): void {
        super.handleClickEvent(node, event);
        if ((<ExpandableTreeNode>node).expanded === undefined) {
            this.openContextMenu(node, event.nativeEvent.x, event.nativeEvent.y);
        }
    }

    protected handleEnter(event: KeyboardEvent): void {
        super.handleEnter(event);
        const node: TreeNode = this.model.selectedNodes[0];
        if ((<ExpandableTreeNode>node).expanded === undefined) {
            if (node) {
                const nodeElement = document.getElementById(node.id);
                if (nodeElement) {
                    const position = nodeElement.getBoundingClientRect();
                    this.openContextMenu(this.model.selectedNodes[0], position.left, position.bottom);
                }
            }
        }
    }

    private openContextMenu(node: TreeNode | undefined, positionX: number, positionY: number): void {
        if (node && SelectableTreeNode.is(node)) {
            const contextMenu = this.preferencesMenuFactory.createPreferenceContextMenu(
                node.id,
                this.preferenceService.get(node.id),
                this.properties[node.id],
                (property, value) => {
                    this.onPreferenceSelectedEmitter.fire({[property]: value});
                }
            );
            contextMenu.aboutToClose.connect(() => {
                this.activate();
            });
            contextMenu.activeItem = contextMenu.items[0];
            contextMenu.open(positionX, positionY);
        }
    }

    protected initializeModel(): void {
        type GroupNode = SelectableTreeNode & ExpandableTreeNode;
        const preferencesGroups: GroupNode [] = [];
        const root: ExpandableTreeNode = {
            id: 'root-node-id',
            name: 'Apply the preference to selected preferences file',
            parent: undefined,
            visible: true,
            children: preferencesGroups,
            expanded: true,
        };
        const nodes: { [id: string]: PreferenceProperty } [] = [];
        for (const group of this.preferencesGroupNames) {
            const propertyNodes: SelectableTreeNode[] = [];
            const properties: string[] = [];
            for (const property in this.properties) {
                if (property.startsWith(group)) {
                    properties.push(property);
                }
            }
            const preferencesGroup: GroupNode = {
                id: group + '-id',
                name: group.toLocaleUpperCase().substring(0, 1) + group.substring(1) + ' (' + properties.length + ')',
                visible: true,
                parent: root,
                children: propertyNodes,
                expanded: false,
                selected: false
            };
            properties.forEach(property => {
                const node: SelectableTreeNode = {
                    id: property,
                    name: property.substring(property.indexOf('.') + 1),
                    parent: preferencesGroup,
                    visible: true,
                    selected: false
                };
                propertyNodes.push(node);
                nodes.push({[property]: this.properties[property]});
            });
            preferencesGroups.push(preferencesGroup);
        }
        this.decorator.fireDidChangeDecorations(nodes);
        this.model.root = root;
    }
}
