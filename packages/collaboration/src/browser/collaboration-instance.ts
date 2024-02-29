// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import * as types from 'open-collaboration-protocol';
import * as Y from 'yjs';

import { Disposable, DisposableCollection, Emitter, Event, MessageService, URI, nls } from '@theia/core';
import { Container, inject, injectable, interfaces, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoTextModelService } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { CollaborationWorkspaceService } from './collaboration-workspace-service';
import { Range as MonacoRange } from '@theia/monaco-editor-core';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { EditorDecoration, EditorWidget } from '@theia/editor/lib/browser';
import { ISingleEditOperation } from '@theia/monaco-editor-core/esm/vs/editor/common/core/editOperation';
import { DecorationStyle, OpenerService } from '@theia/core/lib/browser';
import { CollaborationFileSystemProvider } from './collaboration-file-system-provider';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { CollaborationColorService } from './collaboration-color-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileChange, FileChangeType, FileOperation } from '@theia/filesystem/lib/common/files';

export const CollaborationInstanceFactory = Symbol('CollaborationInstanceFactory');
export type CollaborationInstanceFactory = (connection: CollaborationInstanceOptions) => CollaborationInstance;

export const CollaborationInstanceOptions = Symbol('CollaborationInstanceOptions');
export interface CollaborationInstanceOptions {
    role: 'host' | 'guest';
    connection: types.ProtocolBroadcastConnection;
}

export function createCollaborationInstanceContainer(parent: interfaces.Container, options: CollaborationInstanceOptions): Container {
    const child = new Container();
    child.parent = parent;
    child.bind(CollaborationInstance).toSelf().inTransientScope();
    child.bind(CollaborationInstanceOptions).toConstantValue(options);
    return child;
}

export class CollaborationPeer implements types.Peer, Disposable {
    id: string;
    name: string;
    email?: string | undefined;

    decorations = new Map<string, types.EditorSelection[]>();

    constructor(peer: types.Peer, protected disposable: Disposable) {
        this.id = peer.id;
        this.name = peer.name;
        this.email = peer.email;
    }

    dispose(): void {
        this.disposable.dispose();
    }
}

export const COLLABORATION_SELECTION = 'theia-collaboration-selection';
export const COLLABORATION_SELECTION_MARKER = 'theia-collaboration-selection-marker';
export const COLLABORATION_SELECTION_INVERTED = 'theia-collaboration-selection-inverted';

@injectable()
export class CollaborationInstance implements Disposable {

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(CollaborationWorkspaceService)
    protected readonly workspaceService: CollaborationWorkspaceService;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MonacoTextModelService)
    protected readonly monacoModelService: MonacoTextModelService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(CollaborationInstanceOptions)
    protected readonly options: CollaborationInstanceOptions;

    @inject(CollaborationColorService)
    protected readonly collaborationColorService: CollaborationColorService;

    protected identity = new Deferred<types.Peer>();
    protected peers = new Map<string, CollaborationPeer>();
    protected ownSelections = new Map<string, types.EditorSelection[]>();
    protected isUpdating = false;
    protected yjs = new Y.Doc();
    protected colorIndex = 0;
    protected editorDecorations = new Map<EditorWidget, string[]>();
    protected fileSystem?: CollaborationFileSystemProvider;
    protected permissions: types.Permissions = {
        readonly: false
    };

    protected onDidCloseEmitter = new Emitter<void>();

    get onDidClose(): Event<void> {
        return this.onDidCloseEmitter.event;
    }

    protected toDispose = new DisposableCollection();
    protected _readonly = false;

    get readonly(): boolean {
        return this._readonly;
    }

    set readonly(value: boolean) {
        if (value !== this.readonly) {
            if (this.options.role === 'guest' && this.fileSystem) {
                this.fileSystem.readonly = value;
            } else if (this.options.role === 'host') {
                this.options.connection.room.updatePermissions({
                    ...(this.permissions ?? {}),
                    readonly: value
                });
            }
            if (this.permissions) {
                this.permissions.readonly = value;
            }
            this._readonly = value;
        }
    }

    get isHost(): boolean {
        return this.options.role === 'host';
    }

    @postConstruct()
    protected init(): void {
        const connection = this.options.connection;
        connection.onDisconnect(() => this.dispose());
        this.toDispose.push(Disposable.create(() => this.yjs.destroy()));
        this.toDispose.push(connection);
        this.toDispose.push(this.onDidCloseEmitter);

        this.registerProtocolEvents(connection);
        this.registerEditorEvents(connection);
        this.registerFileSystemEvents(connection);

        if (this.isHost) {
            this.registerFileSystemChanges();
        }
    }

    protected registerProtocolEvents(connection: types.ProtocolBroadcastConnection): void {
        connection.peer.onJoinRequest(async user => {
            const allow = nls.localizeByDefault('Allow');
            const deny = nls.localizeByDefault('Deny');
            const result = await this.messageService.info(
                nls.localize('theia/collaboration/userWantsToJoin', "User '{0}' wants to join the collaboration room", user.name + (user.email ? ` (${user.email})` : '')),
                allow,
                deny
            );
            return result === allow;
        });
        connection.room.onJoin((_, peer) => {
            this.addPeer(peer);
        });
        connection.room.onLeave((_, peer) => {
            this.peers.get(peer.id)?.dispose();
        });
        connection.room.onClose(() => {
            this.dispose();
        });
        connection.room.onPermissions((_, permissions) => {
            if (this.fileSystem) {
                this.fileSystem.readonly = permissions.readonly;
            }
        });
        connection.peer.onInfo(peer => {
            this.identity.resolve(peer);
        });
        connection.peer.onInit(async () => {
            const roots = await this.workspaceService.roots;
            const response: types.InitResponse = {
                protocol: '0.0.1',
                host: await this.identity.promise,
                guests: Array.from(this.peers.values()),
                capabilities: {},
                permissions: this.permissions,
                workspace: {
                    name: this.workspaceService.workspace?.name ?? nls.localize('theia/collaboration/collaboration', 'Collaboration'),
                    folders: roots.map(e => e.name)
                }
            };
            return response;
        });
    }

    protected registerEditorEvents(connection: types.ProtocolBroadcastConnection): void {
        connection.editor.onTextChanged(async (_, update) => {
            const uri = this.getResourceUri(update.path);
            if (uri) {
                const model = await this.getModel(uri, this.isHost);
                if (model) {
                    for (const content of update.content) {
                        const startIndex = model.textEditorModel.getOffsetAt({
                            column: content.range.start.character + 1,
                            lineNumber: content.range.start.line + 1
                        });
                        const endIndex = model.textEditorModel.getOffsetAt({
                            column: content.range.end.character + 1,
                            lineNumber: content.range.end.line + 1
                        });
                        const text = this.yjs.getText(model.uri);
                        if (startIndex !== endIndex) {
                            text.delete(startIndex, endIndex - startIndex);
                        }
                        if (content.text.length > 0) {
                            text.insert(startIndex, content.text);
                        }
                    }
                }
            }
        });
        for (const model of this.monacoModelService.models) {
            this.registerModelUpdate(model);
        }
        this.toDispose.push(this.monacoModelService.onDidCreate(newModel => {
            this.registerModelUpdate(newModel);
        }));
        this.toDispose.push(this.editorManager.onCreated(widget => {
            this.registerPresenceUpdate(widget);
        }));
        this.getOpenEditors().forEach(widget => {
            this.registerPresenceUpdate(widget);
        });

        connection.editor.onPresenceUpdated((peerId, presence) => {
            this.updatePresence(peerId, presence.path, presence.selection);
        });

        connection.editor.onPresenceRequest(async requestParams => {
            const presences: types.EditorPeerPresence[] = [];
            const identity = await this.identity.promise;
            const ownSelection = this.ownSelections.get(requestParams.path);
            if (ownSelection) {
                presences.push({
                    peerId: identity.id,
                    selection: ownSelection
                });
            }
            for (const peer of this.peers.values()) {
                const selection = peer.decorations.get(requestParams.path);
                if (selection) {
                    presences.push({
                        peerId: peer.id,
                        selection
                    });
                }
            }
            return {
                path: requestParams.path,
                presences
            };
        });

        connection.editor.onOpen(async path => {
            const uri = this.getResourceUri(path);
            if (uri) {
                await this.openUri(uri);
            } else {
                throw new Error('Could find file: ' + path);
            }
            return undefined;
        });
    }

    protected registerFileSystemEvents(connection: types.ProtocolBroadcastConnection): void {
        connection.fs.onReadFile(async path => {
            const uri = this.getResourceUri(path);
            if (uri) {
                const model = await this.getModel(uri, false);
                if (model) {
                    // If the file is open, return the current content
                    return model.textEditorModel.getValue();
                } else {
                    const content = await this.fileService.readFile(uri);
                    return content.value.toString();
                }
            } else {
                throw new Error('Could find file: ' + path);
            }
        });
        connection.fs.onReaddir(async path => {
            const uri = this.getResourceUri(path);
            if (uri) {
                const resolved = await this.fileService.resolve(uri);
                if (resolved.children) {
                    const dir: Record<string, types.FileType> = {};
                    for (const child of resolved.children) {
                        dir[child.name] = child.isDirectory ? types.FileType.Directory : types.FileType.File;
                    }
                    return dir;
                } else {
                    return {};
                }
            } else {
                throw new Error('Could find directory: ' + path);
            }
        });
        connection.fs.onStat(async path => {
            const uri = this.getResourceUri(path);
            if (uri) {
                const content = await this.fileService.resolve(uri, {
                    resolveMetadata: true
                });
                return {
                    type: content.isDirectory ? types.FileType.Directory : types.FileType.File,
                    ctime: content.ctime,
                    mtime: content.mtime,
                    size: content.size,
                    permissions: content.isReadonly ? types.FilePermission.Readonly : undefined
                };
            } else {
                throw new Error('Could find file: ' + path);
            }
        });
        connection.fs.onWriteFile(async (path, content) => {
            const uri = this.getResourceUri(path);
            if (uri) {
                await this.fileService.createFile(uri, BinaryBuffer.fromString(content));
            } else {
                throw new Error('Could find file: ' + path);
            }
        });
        connection.fs.onMkdir(async path => {
            const uri = this.getResourceUri(path);
            if (uri) {
                await this.fileService.createFolder(uri);
            } else {
                throw new Error('Could find path: ' + path);
            }
        });
        connection.fs.onDelete(async path => {
            const uri = this.getResourceUri(path);
            if (uri) {
                await this.fileService.delete(uri);
            } else {
                throw new Error('Could find entry: ' + path);
            }
        });
        connection.fs.onRename(async (from, to) => {
            const fromUri = this.getResourceUri(from);
            const toUri = this.getResourceUri(to);
            if (fromUri && toUri) {
                await this.fileService.move(fromUri, toUri);
            } else {
                throw new Error('Could find entries: ' + from + ' -> ' + to);
            }
        });
        connection.fs.onChange(async (_, event) => {
            // Only guests need to handle file system changes
            if (!this.isHost && this.fileSystem) {
                const changes: FileChange[] = [];
                for (const change of event.changes) {
                    const uri = this.getResourceUri(change.path);
                    if (uri) {
                        changes.push({
                            type: change.type === types.FileChangeEventType.Create
                                ? FileChangeType.ADDED
                                : change.type === types.FileChangeEventType.Update
                                    ? FileChangeType.UPDATED
                                    : FileChangeType.DELETED,
                            resource: uri
                        });
                    }
                }
                this.fileSystem.triggerEvent(changes);
            }
        });
    }

    protected updatePresence(peerId: string, path: string, selections: types.EditorSelection[]): void {
        const peer = this.peers.get(peerId);
        const uri = this.getResourceUri(path);
        if (peer && uri) {
            peer.decorations.set(path, selections);
            const decorations: EditorDecoration[] = [];
            for (const peerDecoration of this.getPeerDecorations(path)) {
                decorations.push(...peerDecoration.selection.map(selection => {
                    const forward = selection.direction === types.EditorSelectionDirection.Forward;
                    const inverted = (forward && selection.range.end.line === 0) || (!forward && selection.range.start.line === 0);
                    const contentClassNames: string[] = [COLLABORATION_SELECTION_MARKER, `${COLLABORATION_SELECTION_MARKER}-${peerDecoration.peer}`];
                    if (inverted) {
                        contentClassNames.push(COLLABORATION_SELECTION_INVERTED);
                    }
                    const item: EditorDecoration = {
                        range: selection.range,
                        options: {
                            className: `${COLLABORATION_SELECTION} ${COLLABORATION_SELECTION}-${peerDecoration.peer}`,
                            beforeContentClassName: !forward ? contentClassNames.join(' ') : undefined,
                            afterContentClassName: forward ? contentClassNames.join(' ') : undefined,
                        }
                    };
                    return item;
                }));
            }
            for (const editor of this.getOpenEditors(uri)) {
                const old = this.editorDecorations.get(editor) ?? [];
                this.editorDecorations.set(editor, editor.editor.deltaDecorations({
                    newDecorations: decorations,
                    oldDecorations: old
                }));
            }
        }
    }

    protected registerFileSystemChanges(): void {
        // Event listener for disk based events
        this.fileService.onDidFilesChange(event => {
            const changes: types.FileChange[] = [];
            for (const change of event.changes) {
                const path = this.getProtocolPath(change.resource);
                if (path) {
                    let type: types.FileChangeEventType | undefined;
                    if (change.type === FileChangeType.ADDED) {
                        type = types.FileChangeEventType.Create;
                    } else if (change.type === FileChangeType.DELETED) {
                        type = types.FileChangeEventType.Delete;
                    }
                    // Updates to files on disk are not sent
                    if (type !== undefined) {
                        changes.push({
                            path,
                            type
                        });
                    }
                }
            }
            if (changes.length) {
                this.options.connection.fs.change({ changes });
            }
        });
        // Event listener for user based events
        this.fileService.onDidRunOperation(operation => {
            const path = this.getProtocolPath(operation.resource);
            if (!path) {
                return;
            }
            let type = types.FileChangeEventType.Update;
            if (operation.isOperation(FileOperation.CREATE) || operation.isOperation(FileOperation.COPY)) {
                type = types.FileChangeEventType.Create;
            } else if (operation.isOperation(FileOperation.DELETE)) {
                type = types.FileChangeEventType.Delete;
            }
            this.options.connection.fs.change({
                changes: [{
                    path,
                    type
                }]
            });
        });
    }

    protected async registerPresenceUpdate(widget: EditorWidget): Promise<void> {
        const uri = widget.getResourceUri();
        if (uri) {
            const path = this.getProtocolPath(uri);
            if (path) {
                this.options.connection.editor.open(path);
                let currentSelection = widget.editor.selection;
                // Update presence information immediately when the widget opens
                this.options.connection.editor.presenceUpdated({
                    path,
                    selection: [{
                        range: currentSelection,
                        direction: types.EditorSelectionDirection.Forward
                    }]
                });
                this.ownSelections.set(path, [{
                    range: currentSelection,
                    direction: types.EditorSelectionDirection.Forward
                }]);
                // Update presence information when the selection changes
                const selectionChange = widget.editor.onSelectionChanged(range => {
                    if (!this.rangeEqual(currentSelection, range)) {
                        const selection = [{
                            range,
                            direction: this.calculateSelectionDirection(currentSelection, range)
                        }];
                        this.options.connection.editor.presenceUpdated({
                            path,
                            selection
                        });
                        this.ownSelections.set(path, selection);
                        currentSelection = range;
                    }
                });
                const widgetDispose = widget.onDidDispose(() => {
                    widgetDispose.dispose();
                    // Remove presence information when the editor closes
                    this.options.connection.editor.presenceUpdated({ path, selection: [] });
                });
                this.toDispose.push(selectionChange);
                this.toDispose.push(widgetDispose);
                if (!this.isHost) {
                    const identity = await this.identity.promise;
                    // If not the host, request presence information for all peers for this editor
                    const presence = await this.options.connection.editor.presenceRequest({ path });
                    for (const peerPresence of presence.presences) {
                        if (peerPresence.peerId !== identity.id) {
                            this.updatePresence(peerPresence.peerId, presence.path, peerPresence.selection);
                        }
                    }
                }
            }
        }
    }

    protected rangeEqual(a: Range, b: Range): boolean {
        return a.start.line === b.start.line
            && a.start.character === b.start.character
            && a.end.line === b.end.line
            && a.end.character === b.end.character;
    }

    protected calculateSelectionDirection(previous: Range, selection: Range): types.EditorSelectionDirection {
        if (previous.end.line === selection.end.line && previous.end.character === selection.end.character) {
            return types.EditorSelectionDirection.Backward;
        } else {
            return types.EditorSelectionDirection.Forward;
        }
    }

    async initialize(): Promise<void> {
        const response = await this.options.connection.peer.init({
            protocol: '0.0.1'
        });
        this.permissions = response.permissions;
        this.readonly = response.permissions.readonly;
        for (const peer of [...response.guests, response.host]) {
            this.addPeer(peer);
        }
        this.fileSystem = new CollaborationFileSystemProvider(this.options.connection);
        this.fileSystem.readonly = this.readonly;
        this.toDispose.push(this.fileService.registerProvider(CollaborationFileSystemProvider.SCHEME, this.fileSystem));
        const workspaceDisposable = await this.workspaceService.setHostWorkspace(response.workspace, this.options.connection);
        this.toDispose.push(workspaceDisposable);
    }

    protected addPeer(peer: types.Peer): void {
        const collection = new DisposableCollection();
        collection.push(this.createPeerStyleSheet(peer));
        collection.push(Disposable.create(() => this.peers.delete(peer.id)));
        const disposablePeer = new CollaborationPeer(peer, collection);
        this.peers.set(peer.id, disposablePeer);
    }

    protected getPeerDecorations(path: string): { peer: string, selection: types.EditorSelection[] }[] {
        const items: { peer: string, selection: types.EditorSelection[] }[] = [];
        for (const peer of this.peers.values()) {
            const selection = peer.decorations.get(path);
            if (selection) {
                items.push({
                    peer: peer.id,
                    selection
                });
            }
        }
        return items;
    }

    protected createPeerStyleSheet(peer: types.Peer): Disposable {
        const style = DecorationStyle.createStyleElement(peer.id);
        const colors = this.collaborationColorService.getColors();
        const sheet = style.sheet!;
        const color = colors[this.colorIndex++ % colors.length];
        const colorString = `rgb(${color.r}, ${color.g}, ${color.b})`;
        sheet.insertRule(`
            .${COLLABORATION_SELECTION}-${peer.id} {
                opacity: 0.2;
                background: ${colorString};
            }
        `);
        sheet.insertRule(`
            .${COLLABORATION_SELECTION_MARKER}-${peer.id} {
                background: ${colorString};
                border-color: ${colorString};
            }`
        );
        sheet.insertRule(`
            .${COLLABORATION_SELECTION_MARKER}-${peer.id}::after {
                content: "${peer.name}";
                background: ${colorString};
                color: ${this.collaborationColorService.requiresDarkFont(color)
                ? this.collaborationColorService.dark
                : this.collaborationColorService.light};
                z-index: ${(100 + this.colorIndex).toFixed()}
            }`
        );
        return Disposable.create(() => style.remove());
    }

    protected getOpenEditors(uri?: URI): EditorWidget[] {
        const widgets = this.shell.widgets;
        let editors = widgets.filter(e => e instanceof EditorWidget) as EditorWidget[];
        if (uri) {
            const uriString = uri.toString();
            editors = editors.filter(e => e.getResourceUri()?.toString() === uriString);
        }
        return editors;
    }

    protected registerModelUpdate(model: MonacoEditorModel): void {
        model.onDidChangeContent(e => {
            if (this.isUpdating) {
                return;
            }
            const path = this.getProtocolPath(new URI(model.uri));
            if (!path) {
                return;
            }
            const content: types.EditorContentUpdate[] = [];
            for (const change of e.contentChanges) {
                if ('range' in change) {
                    content.push({
                        range: change.range,
                        text: change.text
                    });
                } else {
                    console.log('Received change without range information');
                }
            }
            this.options.connection.editor.textChanged({
                path: path,
                content
            });
        });
        const text = this.yjs.getText(model.uri);
        text.insert(0, model.getText());
        text.observe(textEvent => {
            // Disable updating as the edit operation should not be sent to other peers
            this.isUpdating = true;
            let index = 0;
            const operations: ISingleEditOperation[] = [];
            textEvent.delta.forEach(delta => {
                if (delta.retain !== undefined) {
                    index += delta.retain;
                } else if (delta.insert !== undefined) {
                    const pos = model.textEditorModel.getPositionAt(index);
                    const range = new MonacoRange(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
                    const insert = delta.insert as string;
                    operations.push({ range, text: insert });
                    index += insert.length;
                } else if (delta.delete !== undefined) {
                    const pos = model.textEditorModel.getPositionAt(index);
                    const endPos = model.textEditorModel.getPositionAt(index + delta.delete);
                    const range = new MonacoRange(pos.lineNumber, pos.column, endPos.lineNumber, endPos.column);
                    operations.push({ range, text: '' });
                }
            });
            // Push as edit operation so that it is added to the undo/redo stack
            // eslint-disable-next-line no-null/no-null
            model.textEditorModel.pushEditOperations(null, operations, () => null);
            this.isUpdating = false;
        });
    }

    protected async getModel(uri: URI, create: boolean): Promise<MonacoEditorModel | undefined> {
        const existing = this.monacoModelService.models.find(e => e.uri === uri.toString());
        if (existing) {
            return existing;
        } else if (create) {
            try {
                await this.openUri(uri);
                const reference = await this.monacoModelService.createModelReference(uri);
                return reference.object;
            } catch {
                return undefined;
            }
        } else {
            return undefined;
        }
    }

    protected async openUri(uri: URI): Promise<void> {
        const opener = await this.openerService.getOpener(uri);
        await opener.open(uri, {
            mode: 'none'
        });
    }

    protected getProtocolPath(uri: URI): string | undefined {
        const path = uri.path.toString();
        const roots = this.workspaceService.tryGetRoots();
        for (const root of roots) {
            const rootUri = root.resource.path.toString() + '/';
            if (path.startsWith(rootUri)) {
                return root.name + '/' + path.substring(rootUri.length);
            }
        }
        return undefined;
    }

    protected getResourceUri(path: string): URI | undefined {
        const parts = path.split('/');
        const root = parts[0];
        const rest = parts.slice(1);
        const stat = this.workspaceService.tryGetRoots().find(e => e.name === root);
        if (stat) {
            const uriPath = stat.resource.path.join(...rest);
            const uri = stat.resource.withPath(uriPath);
            return uri;
        } else {
            return undefined;
        }
    }

    dispose(): void {
        for (const peer of this.peers.values()) {
            peer.dispose();
        }
        this.onDidCloseEmitter.fire();
        this.toDispose.dispose();
    }
}
