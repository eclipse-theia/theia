/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from 'inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { EditorCommands } from './editor-command';
import { EditorWidget } from './editor-widget';
import { EditorManager } from './editor-manager';
import { TextEditor, Position, Range, TextDocumentChangeEvent } from './editor';
import { NavigationLocation } from './navigation/navigation-location';
import { NavigationLocationService } from './navigation/navigation-location-service';

@injectable()
export class EditorNavigationContribution implements Disposable, FrontendApplicationContribution {

    private static ID = 'editor-navigation-contribution';

    protected readonly toDispose = new DisposableCollection();
    protected readonly toDisposePerCurrentEditor = new DisposableCollection();

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(NavigationLocationService)
    protected readonly locationStack: NavigationLocationService;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @postConstruct()
    protected init(): void {
        this.toDispose.pushAll([
            // TODO listen on file resource changes, if a file gets deleted, remove the corresponding navigation locations (if any).
            // This would require introducing the FS dependency in the editor extension.
            this.editorManager.onCurrentEditorChanged(this.onCurrentEditorChanged.bind(this))
        ]);
        this.commandRegistry.registerHandler(EditorCommands.BACK.id, {
            execute: () => this.locationStack.back(),
            isEnabled: () => this.locationStack.canGoBack()
        });
        this.commandRegistry.registerHandler(EditorCommands.FORWARD.id, {
            execute: () => this.locationStack.forward(),
            isEnabled: () => this.locationStack.canGoForward()
        });
    }

    async onStart(): Promise<void> {
        await this.restoreState();
    }

    onStop(): void {
        this.storeState();
        this.dispose();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected onCurrentEditorChanged(editorWidget: EditorWidget | undefined): void {
        this.toDisposePerCurrentEditor.dispose();
        if (editorWidget) {
            const { editor } = editorWidget;
            this.toDisposePerCurrentEditor.pushAll([
                // Instead of registering an `onCursorPositionChanged` listener, we treat the zero length selection as a cursor position change.
                // Otherwise we would have two events for a single cursor change interaction.
                editor.onSelectionChanged(selection => this.onSelectionChanged(editor, selection)),
                editor.onDocumentContentChanged(event => this.onDocumentContentChanged(editor, event))
            ]);
        }
    }

    protected onCursorPositionChanged(editor: TextEditor, position: Position): void {
        this.locationStack.register(NavigationLocation.create(editor, position));
    }

    protected onSelectionChanged(editor: TextEditor, selection: Range): void {
        if (this.isZeroLengthRange(selection)) {
            this.onCursorPositionChanged(editor, selection.start);
        } else {
            this.locationStack.register(NavigationLocation.create(editor, selection));
        }
    }

    protected onDocumentContentChanged(editor: TextEditor, event: TextDocumentChangeEvent): void {
        if (event.contentChanges.length > 0) {
            this.locationStack.register(NavigationLocation.create(editor, event.contentChanges[0]));
        }
    }

    /**
     * `true` if the `range` argument has zero length. In other words, the `start` and the `end` positions are the same. Otherwise, `false`.
     */
    protected isZeroLengthRange(range: Range): boolean {
        const { start, end } = range;
        return start.line === end.line && start.character === end.character;
    }

    protected async storeState(): Promise<void> {
        this.storageService.setData(EditorNavigationContribution.ID, {
            locations: this.locationStack.locations().map(NavigationLocation.toObject)
        });
    }

    protected async restoreState(): Promise<void> {
        const raw: { locations?: ArrayLike<object> } | undefined = await this.storageService.getData(EditorNavigationContribution.ID);
        if (raw && raw.locations) {
            const locations: NavigationLocation[] = [];
            for (let i = 0; i < raw.locations.length; i++) {
                const location = NavigationLocation.fromObject(raw.locations[i]);
                if (location) {
                    locations.push(location);
                } else {
                    this.logger.warn(`Could not restore the state of the editor navigation history.`);
                    return;
                }
            }
            this.locationStack.register(...locations);
        }
    }

}
