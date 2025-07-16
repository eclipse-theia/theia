// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable, postConstruct, inject, named } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { RecursivePartial, Emitter, Event, CommandService, nls, ContributionProvider, Prioritizeable, Disposable } from '@theia/core/lib/common';
import {
    WidgetOpenerOptions, NavigatableWidgetOpenHandler, NavigatableWidgetOptions, PreferenceService, CommonCommands, getDefaultHandler, defaultHandlerPriority, DiffUris
} from '@theia/core/lib/browser';
import { EditorWidget } from './editor-widget';
import { Range, Position, Location, TextEditor } from './editor';
import { EditorWidgetFactory } from './editor-widget-factory';
import { NavigationLocationService } from './navigation/navigation-location-service';

export interface WidgetId {
    id: number;
    uri: string;
}

export interface EditorOpenerOptions extends WidgetOpenerOptions {
    selection?: RecursivePartial<Range>;
    preview?: boolean;
    counter?: number;
}

export const EditorSelectionResolver = Symbol('EditorSelectionResolver');
export interface EditorSelectionResolver {
    priority?: number;
    resolveSelection(widget: EditorWidget, options: EditorOpenerOptions, uri?: URI): Promise<RecursivePartial<Range> | undefined>;
}

@injectable()
export class EditorManager extends NavigatableWidgetOpenHandler<EditorWidget> {

    readonly id = EditorWidgetFactory.ID;

    readonly label = nls.localizeByDefault('Text Editor');

    protected readonly editorCounters = new Map<string, number>();

    protected readonly onActiveEditorChangedEmitter = new Emitter<EditorWidget | undefined>();
    /**
     * Emit when the active editor is changed.
     */
    readonly onActiveEditorChanged: Event<EditorWidget | undefined> = this.onActiveEditorChangedEmitter.event;

    protected readonly onCurrentEditorChangedEmitter = new Emitter<EditorWidget | undefined>();
    /**
     * Emit when the current editor is changed.
     */
    readonly onCurrentEditorChanged: Event<EditorWidget | undefined> = this.onCurrentEditorChangedEmitter.event;

    @inject(CommandService) protected readonly commands: CommandService;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;

    @inject(ContributionProvider) @named(EditorSelectionResolver)
    protected readonly resolverContributions: ContributionProvider<EditorSelectionResolver>;
    protected selectionResolvers: EditorSelectionResolver[] = [];

    @inject(NavigationLocationService)
    protected readonly navigationLocationService: NavigationLocationService;

    @postConstruct()
    protected override init(): void {
        super.init();

        this.selectionResolvers = Prioritizeable.prioritizeAllSync(
            this.resolverContributions.getContributions(),
            resolver => resolver.priority ?? 0
        ).map(p => p.value);

        this.shell.onDidChangeActiveWidget(() => this.updateActiveEditor());
        this.shell.onDidChangeCurrentWidget(() => this.updateCurrentEditor());
        this.shell.onDidDoubleClickMainArea(() =>
            this.commands.executeCommand(CommonCommands.NEW_UNTITLED_TEXT_FILE.id)
        );
        this.onCreated(widget => {
            widget.onDidChangeVisibility(() => {
                if (widget.isVisible) {
                    this.addRecentlyVisible(widget);
                }
                this.updateCurrentEditor();
            });
            this.checkCounterForWidget(widget);
            widget.disposed.connect(() => {
                this.removeFromCounter(widget);
                this.removeRecentlyVisible(widget);
                this.updateCurrentEditor();
            });
        });
        for (const widget of this.all) {
            if (widget.isVisible) {
                this.addRecentlyVisible(widget);
            }
        }

        this.updateCurrentEditor();
    }

    /**
     * Registers a dynamic selection resolver.
     * The resolver is added to the sorted list of selection resolvers and can later be disposed to remove it.
     *
     * @param resolver The selection resolver to register.
     * @returns A Disposable that unregisters the resolver when disposed.
     */
    public registerSelectionResolver(resolver: EditorSelectionResolver): Disposable {
        this.selectionResolvers.push(resolver);
        this.selectionResolvers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        return {
            dispose: () => {
                const index = this.selectionResolvers.indexOf(resolver);
                if (index !== -1) {
                    this.selectionResolvers.splice(index, 1);
                }
            }
        };
    }

    override getByUri(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget | undefined> {
        return this.getWidget(uri, options);
    }

    override getOrCreateByUri(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        return this.getOrCreateWidget(uri, options);
    }

    createByUri(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        const counter = this.createCounterForUri(uri);
        if (!options?.counter || options.counter < counter) {
            options = { ...options, counter };
        }
        return this.getOrCreateByUri(uri, options);
    }

    protected readonly recentlyVisibleIds: string[] = [];
    protected get recentlyVisible(): EditorWidget | undefined {
        const id = this.recentlyVisibleIds[0];
        return id && this.all.find(w => w.id === id) || undefined;
    }
    protected addRecentlyVisible(widget: EditorWidget): void {
        this.removeRecentlyVisible(widget);
        this.recentlyVisibleIds.unshift(widget.id);
    }
    protected removeRecentlyVisible(widget: EditorWidget): void {
        const index = this.recentlyVisibleIds.indexOf(widget.id);
        if (index !== -1) {
            this.recentlyVisibleIds.splice(index, 1);
        }
    }

    protected _activeEditor: EditorWidget | undefined;
    /**
     * The active editor.
     * If there is an active editor (one that has focus), active and current are the same.
     */
    get activeEditor(): EditorWidget | undefined {
        return this._activeEditor;
    }
    protected setActiveEditor(active: EditorWidget | undefined): void {
        if (this._activeEditor !== active) {
            this._activeEditor = active;
            this.onActiveEditorChangedEmitter.fire(this._activeEditor);
        }
    }
    protected updateActiveEditor(): void {
        const widget = this.shell.activeWidget;
        if (widget instanceof EditorWidget) {
            this.addRecentlyVisible(widget);
            this.setActiveEditor(widget);
        } else {
            this.setActiveEditor(undefined);
        }
    }

    protected _currentEditor: EditorWidget | undefined;
    /**
     * The most recently activated editor (which might not have the focus anymore, hence it is not active).
     * If no editor has focus, e.g. when a context menu is shown, the active editor is `undefined`, but current might be the editor that was active before the menu popped up.
     */
    get currentEditor(): EditorWidget | undefined {
        return this._currentEditor;
    }
    protected setCurrentEditor(current: EditorWidget | undefined): void {
        if (this._currentEditor !== current) {
            this._currentEditor = current;
            this.onCurrentEditorChangedEmitter.fire(this._currentEditor);
        }
    }
    protected updateCurrentEditor(): void {
        const widget = this.shell.currentWidget;
        if (widget instanceof EditorWidget) {
            this.setCurrentEditor(widget);
        } else if (!this._currentEditor || !this._currentEditor.isVisible || this.currentEditor !== this.recentlyVisible) {
            this.setCurrentEditor(this.recentlyVisible);
        }
    }

    canHandle(uri: URI, options?: WidgetOpenerOptions): number {
        if (DiffUris.isDiffUri(uri)) {
            const [/* left */, right] = DiffUris.decode(uri);
            uri = right;
        }
        if (getDefaultHandler(uri, this.preferenceService) === 'default') {
            return defaultHandlerPriority;
        }
        return 100;
    }

    override async open(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        this.navigationLocationService.startNavigation();
        try {
            if (options?.counter === undefined) {
                const insertionOptions = this.shell.getInsertionOptions(options?.widgetOptions);
                // Definitely creating a new tabbar - no widget can match.
                if (insertionOptions.addOptions.mode?.startsWith('split')) {
                    return await super.open(uri, { counter: this.createCounterForUri(uri), ...options });
                }
                // Check the target tabbar for an existing widget.
                const tabbar = insertionOptions.addOptions.ref && this.shell.getTabBarFor(insertionOptions.addOptions.ref);
                if (tabbar) {
                    const currentUri = uri.toString();
                    for (const title of tabbar.titles) {
                        if (title.owner instanceof EditorWidget) {
                            const { uri: otherWidgetUri, id } = this.extractIdFromWidget(title.owner);
                            if (otherWidgetUri === currentUri) {
                                return await super.open(uri, { counter: id, ...options });
                            }
                        }
                    }
                }
                // If the user has opted to prefer to open an existing editor even if it's on a different tab, check if we have anything about the URI.
                if (this.preferenceService.get('workbench.editor.revealIfOpen', false)) {
                    const counter = this.getCounterForUri(uri);
                    if (counter !== undefined) {
                        return await super.open(uri, { counter, ...options });
                    }
                }
                // Open a new widget.
                return await super.open(uri, { counter: this.createCounterForUri(uri), ...options });
            }

            return await super.open(uri, options);

        } finally {
            this.navigationLocationService.endNavigation();
        }
    }

    /**
     * Opens an editor to the side of the current editor. Defaults to opening to the right.
     * To modify direction, pass options with `{widgetOptions: {mode: ...}}`
     */
    openToSide(uri: URI, options?: EditorOpenerOptions): Promise<EditorWidget> {
        const counter = this.createCounterForUri(uri);
        const splitOptions: EditorOpenerOptions = { widgetOptions: { mode: 'split-right' }, ...options, counter };
        return this.open(uri, splitOptions);
    }

    protected override async doOpen(widget: EditorWidget, uri: URI, options?: EditorOpenerOptions): Promise<void> {
        await super.doOpen(widget, uri, options);
        await this.revealSelection(widget, uri, options);
    }

    protected async revealSelection(widget: EditorWidget, uri: URI, options?: EditorOpenerOptions): Promise<void> {
        let inputSelection = options?.selection;
        if (!inputSelection) {
            inputSelection = await this.resolveSelection(widget, options ?? {}, uri);
        }
        // this logic could be moved into a 'EditorSelectionResolver'
        if (!inputSelection && uri) {
            // support file:///some/file.js#73,84
            // support file:///some/file.js#L73
            const match = /^L?(\d+)(?:,(\d+))?/.exec(uri.fragment);
            if (match) {
                inputSelection = {
                    start: {
                        line: parseInt(match[1]) - 1,
                        character: match[2] ? parseInt(match[2]) - 1 : 0
                    }
                };
            }
        }
        if (inputSelection) {
            const selection = this.getSelection(widget, inputSelection);
            const editor = widget.editor;
            if (Position.is(selection)) {
                editor.cursor = selection;
                editor.revealPosition(selection);
            } else if (Range.is(selection)) {
                editor.cursor = selection.end;
                editor.selection = { ...selection, direction: 'ltr' };
                editor.revealRange(selection);
            }
        }
    }

    protected async resolveSelection(widget: EditorWidget, options: EditorOpenerOptions, uri?: URI): Promise<RecursivePartial<Range> | undefined> {
        if (options.selection) {
            return options.selection;
        }
        for (const resolver of this.selectionResolvers) {
            try {
                const selection = await resolver.resolveSelection(widget, options, uri);
                if (selection) {
                    return selection;
                }
            } catch (error) {
                console.error(error);
            }
        }
        return undefined;
    }

    protected getSelection(widget: EditorWidget, selection: RecursivePartial<Range>): Range | Position | undefined {
        const { start, end } = selection;
        if (Position.is(start)) {
            if (Position.is(end)) {
                return widget.editor.document.toValidRange({ start, end });
            }
            return widget.editor.document.toValidPosition(start);
        }
        const line = start && start.line !== undefined && start.line >= 0 ? start.line : undefined;
        if (line === undefined) {
            return undefined;
        }
        const character = start && start.character !== undefined && start.character >= 0 ? start.character : widget.editor.document.getLineMaxColumn(line);
        const endLine = end && end.line !== undefined && end.line >= 0 ? end.line : undefined;
        if (endLine === undefined) {
            return { line, character };
        }
        const endCharacter = end && end.character !== undefined && end.character >= 0 ? end.character : widget.editor.document.getLineMaxColumn(endLine);
        return {
            start: { line, character },
            end: { line: endLine, character: endCharacter }
        };
    }

    protected removeFromCounter(widget: EditorWidget): void {
        const { id, uri } = this.extractIdFromWidget(widget);
        if (uri && !Number.isNaN(id)) {
            let max = -Infinity;
            this.all.forEach(editor => {
                const candidateID = this.extractIdFromWidget(editor);
                if ((candidateID.uri === uri) && (candidateID.id > max)) {
                    max = candidateID.id!;
                }
            });

            if (max > -Infinity) {
                this.editorCounters.set(uri, max);
            } else {
                this.editorCounters.delete(uri);
            }
        }
    }

    protected extractIdFromWidget(widget: EditorWidget): WidgetId {
        const uri = widget.editor.uri.toString();
        const id = Number(widget.id.slice(widget.id.lastIndexOf(':') + 1));
        return { id, uri };
    }

    protected checkCounterForWidget(widget: EditorWidget): void {
        const { id, uri } = this.extractIdFromWidget(widget);
        const numericalId = Number(id);
        if (uri && !Number.isNaN(numericalId)) {
            const highestKnownId = this.editorCounters.get(uri) ?? -Infinity;
            if (numericalId > highestKnownId) {
                this.editorCounters.set(uri, numericalId);
            }
        }
    }

    protected createCounterForUri(uri: URI): number {
        const identifier = uri.toString();
        const next = (this.editorCounters.get(identifier) ?? 0) + 1;
        return next;
    }

    protected getCounterForUri(uri: URI): number | undefined {
        const idWithoutCounter = EditorWidgetFactory.createID(uri);
        const counterOfMostRecentlyVisibleEditor = this.recentlyVisibleIds.find(id => id.startsWith(idWithoutCounter))?.slice(idWithoutCounter.length + 1);
        return counterOfMostRecentlyVisibleEditor === undefined ? undefined : parseInt(counterOfMostRecentlyVisibleEditor);
    }

    protected getOrCreateCounterForUri(uri: URI): number {
        return this.getCounterForUri(uri) ?? this.createCounterForUri(uri);
    }

    protected override createWidgetOptions(uri: URI, options?: EditorOpenerOptions): NavigatableWidgetOptions {
        const navigatableOptions = super.createWidgetOptions(uri, options);
        navigatableOptions.counter = options?.counter ?? this.getOrCreateCounterForUri(uri);
        return navigatableOptions;
    }
}

/**
 * Provides direct access to the underlying text editor.
 */
@injectable()
export abstract class EditorAccess {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    /**
     * The URI of the underlying document from the editor.
     */
    get uri(): string | undefined {
        const editor = this.editor;
        if (editor) {
            return editor.uri.toString();
        }
        return undefined;
    }

    /**
     * The selection location from the text editor.
     */
    get selection(): Location | undefined {
        const editor = this.editor;
        if (editor) {
            const uri = editor.uri.toString();
            const range = editor.selection;
            return {
                range,
                uri
            };
        }
        return undefined;
    }

    /**
     * The unique identifier of the language the current editor belongs to.
     */
    get languageId(): string | undefined {
        const editor = this.editor;
        if (editor) {
            return editor.document.languageId;
        }
        return undefined;
    }

    /**
     * The text editor.
     */
    get editor(): TextEditor | undefined {
        const editorWidget = this.editorWidget();
        if (editorWidget) {
            return editorWidget.editor;
        }
        return undefined;
    }

    /**
     * The editor widget, or `undefined` if not applicable.
     */
    protected abstract editorWidget(): EditorWidget | undefined;

}

/**
 * Provides direct access to the currently active text editor.
 */
@injectable()
export class CurrentEditorAccess extends EditorAccess {

    protected editorWidget(): EditorWidget | undefined {
        return this.editorManager.currentEditor;
    }

}

/**
 * Provides access to the active text editor.
 */
@injectable()
export class ActiveEditorAccess extends EditorAccess {

    protected editorWidget(): EditorWidget | undefined {
        return this.editorManager.activeEditor;
    }

}

export namespace EditorAccess {
    export const CURRENT = 'current-editor-access';
    export const ACTIVE = 'active-editor-access';
}
