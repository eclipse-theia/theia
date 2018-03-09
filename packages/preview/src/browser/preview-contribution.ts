/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Widget } from "@phosphor/widgets";
import { FrontendApplicationContribution, WidgetOpenerOptions, WidgetOpenHandler } from "@theia/core/lib/browser";
import { EditorManager, TextEditor, EditorWidget, EditorContextMenu } from '@theia/editor/lib/browser';
import {
    ResourceProvider, DisposableCollection, CommandContribution, CommandRegistry, Command, MenuContribution, MenuModelRegistry,
    CommandHandler, Disposable, MessageService
} from "@theia/core/lib/common";
import URI from '@theia/core/lib/common/uri';
import { Position } from 'vscode-languageserver-types';
import { PreviewWidget } from './preview-widget';
import { PreviewHandlerProvider, } from './preview-handler';
import { PreviewUri } from "./preview-uri";
import { PreviewPreferences } from './preview-preferences';

export namespace PreviewCommands {
    export const OPEN: Command = {
        id: 'preview:open',
        label: 'Open Preview'
    };
}

export interface PreviewOpenerOptions extends WidgetOpenerOptions {
    originUri?: URI;
}

@injectable()
export class PreviewContribution extends WidgetOpenHandler<PreviewWidget> implements CommandContribution, MenuContribution, FrontendApplicationContribution {

    readonly id = PreviewUri.id;
    readonly label = 'Preview';

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(PreviewHandlerProvider)
    protected readonly previewHandlerProvider: PreviewHandlerProvider;

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(PreviewPreferences)
    protected readonly preferences: PreviewPreferences;

    protected readonly syncronizedUris = new Set<string>();

    protected readonly defaultOpenFromEditorOptions: PreviewOpenerOptions = {
        widgetOptions: { area: 'main', mode: 'split-right' },
        mode: 'reveal'
    };

    protected readonly defaultOpenOptions: PreviewOpenerOptions = {
        widgetOptions: { area: 'main', mode: 'tab-after' },
        mode: 'activate'
    };

    onStart() {
        this.onCreated(previewWidget => {
            this.registerOpenOnDoubleClick(previewWidget);
            this.registerEditorAndPreviewSync(previewWidget);
        });
        this.editorManager.onCreated(editorWidget => {
            this.registerEditorAndPreviewSync(editorWidget);
        });
    }

    protected async registerEditorAndPreviewSync(source: PreviewWidget | EditorWidget): Promise<void> {
        let uri: string;
        let editorWidget: EditorWidget | undefined;
        let previewWidget: PreviewWidget | undefined;
        if (source instanceof EditorWidget) {
            editorWidget = source;
            uri = editorWidget.editor.uri.toString();
            previewWidget = await this.getWidget(editorWidget.editor.uri);
        } else {
            previewWidget = source;
            uri = previewWidget.getUri().toString();
            editorWidget = await this.editorManager.getByUri(previewWidget.getUri());
        }
        if (!previewWidget || !editorWidget || !uri) {
            return;
        }
        if (this.syncronizedUris.has(uri)) {
            return;
        }
        const syncDisposables = new DisposableCollection();
        previewWidget.disposed.connect(() => syncDisposables.dispose());
        editorWidget.disposed.connect(() => syncDisposables.dispose());

        const editor = editorWidget.editor;
        syncDisposables.push(editor.onCursorPositionChanged(position => this.revealSourceLineInPreview(previewWidget!, position)));
        syncDisposables.push(this.synchronizeScrollToEditor(previewWidget, editor));

        this.syncronizedUris.add(uri);
        syncDisposables.push(Disposable.create(() => this.syncronizedUris.delete(uri)));
    }

    protected revealSourceLineInPreview(previewWidget: PreviewWidget, position: Position): void {
        previewWidget.revealForSourceLine(position.line);
    }

    protected synchronizeScrollToEditor(previewWidget: PreviewWidget, editor: TextEditor): Disposable {
        return previewWidget.onDidScroll(sourceLine => {
            const line = Math.floor(sourceLine);
            editor.revealRange({
                start: {
                    line,
                    character: 0
                },
                end: {
                    line: line + 1,
                    character: 0
                }
            }, { at: 'top' });
        });
    }

    protected registerOpenOnDoubleClick(previewWidget: PreviewWidget): void {
        const disposable = previewWidget.onDidDoubleClick(async location => {
            const ref = this.findWidgetInMainAreaToAddAfter();
            const { editor } = await this.editorManager.open(new URI(location.uri), {
                widgetOptions: ref ?
                    { area: 'main', mode: 'tab-after', ref } :
                    { area: 'main', mode: 'split-left' }
            });
            editor.revealPosition(location.range.start);
            editor.selection = location.range;
        });
        previewWidget.disposed.connect(() => disposable.dispose());
    }

    async canHandle(uri: URI): Promise<number> {
        if (!this.previewHandlerProvider.canHandle(uri)) {
            return 0;
        }
        const editorPriority = await this.editorManager.canHandle(uri);
        if (editorPriority === 0) {
            return 200;
        }
        if (PreviewUri.match(uri)) {
            return editorPriority * 2;
        }
        return editorPriority * (this.openByDefault ? 2 : 0.5);
    }

    protected get openByDefault(): boolean {
        return this.preferences["preview.openByDefault"];
    }

    async open(uri: URI, options?: PreviewOpenerOptions): Promise<PreviewWidget> {
        const resolvedOptions = await this.resolveOpenerOptions(options);
        return super.open(uri, resolvedOptions);
    }
    protected createWidgetOptions(uri: URI, options?: PreviewOpenerOptions): string {
        return PreviewUri.decode(uri).withoutFragment().toString();
    }

    protected async resolveOpenerOptions(options?: PreviewOpenerOptions): Promise<PreviewOpenerOptions> {
        if (!options) {
            const ref = this.findWidgetInMainAreaToAddAfter();
            if (ref) {
                return { ...this.defaultOpenOptions, widgetOptions: { area: 'main', mode: 'tab-after', ref } };
            }
            return this.defaultOpenOptions;
        }
        if (options.originUri) {
            const ref = await this.getWidget(options.originUri);
            if (ref) {
                return { ...this.defaultOpenOptions, widgetOptions: { area: 'main', mode: 'tab-after', ref } };
            }
        }
        return { ...this.defaultOpenOptions, ...options };
    }

    protected findWidgetInMainAreaToAddAfter(): Widget | undefined {
        const mainTabBars = this.shell.mainAreaTabBars;
        const defaultTabBar = this.shell.getTabBarFor('main');
        if (mainTabBars.length > 1 && defaultTabBar) {
            const currentTabArea = this.shell.currentTabArea;
            const currentTabBar = (currentTabArea === 'main') ? this.shell.currentTabBar || defaultTabBar : defaultTabBar;
            const currentIndex = mainTabBars.indexOf(currentTabBar);
            const targetIndex = (mainTabBars.length === currentIndex + 1) ? currentIndex - 1 : currentIndex + 1;
            const targetTabBar = mainTabBars[targetIndex];
            const currentTitle = targetTabBar.currentTitle;
            if (currentTitle) {
                return currentTitle.owner;
            }
        }
        return undefined;
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(PreviewCommands.OPEN, <CommandHandler>{
            execute: () => this.openForEditor(),
            isEnabled: () => this.canHandleEditorUri(),
            isVisible: () => this.canHandleEditorUri(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, {
            commandId: PreviewCommands.OPEN.id,
            label: PreviewCommands.OPEN.label,
        });
    }

    protected canHandleEditorUri(): boolean {
        const uri = this.getCurrentEditorUri();
        return !!uri && this.previewHandlerProvider.canHandle(uri);
    }
    protected getCurrentEditorUri(): URI | undefined {
        const current = this.editorManager.currentEditor;
        return current && current.editor.uri;
    }

    protected async openForEditor(): Promise<void> {
        const uri = this.getCurrentEditorUri();
        if (!uri) {
            return;
        }
        const ref = this.findWidgetInMainAreaToAddAfter();
        await this.open(uri, {
            ... this.defaultOpenFromEditorOptions,
            widgetOptions: ref ?
                { area: 'main', mode: 'tab-after', ref } :
                { area: 'main', mode: 'split-right' }
        });
    }

}
