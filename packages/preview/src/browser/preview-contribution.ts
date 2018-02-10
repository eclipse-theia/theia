/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplicationContribution, FrontendApplication, OpenHandler, OpenerOptions, ApplicationShell, WidgetManager } from "@theia/core/lib/browser";
import { EDITOR_CONTEXT_MENU, EditorManager, TextEditor, EditorWidget } from '@theia/editor/lib/browser';
import {
    ResourceProvider, DisposableCollection, CommandContribution, CommandRegistry, Command, MenuContribution, MenuModelRegistry,
    CommandHandler, Disposable, MessageService
} from "@theia/core/lib/common";
import URI from '@theia/core/lib/common/uri';
import { Position } from 'vscode-languageserver-types';
import { PreviewWidget, PREVIEW_WIDGET_FACTORY_ID, PreviewWidgetOptions } from './preview-widget';
import { PreviewWidgetManager } from './preview-widget-manager';
import { PreviewHandlerProvider, PREVIEW_OPENER_ID } from './preview-handler';
import { Widget } from "@phosphor/widgets";

export namespace PreviewCommands {
    export const OPEN: Command = {
        id: 'preview:open',
        label: 'Open Preview'
    };
}

export interface PreviewOpenerOptions extends OpenerOptions {
    originUri?: string;
    widgetOptions?: ApplicationShell.WidgetOptions;
    activate?: boolean;
}

@injectable()
export class PreviewContribution implements CommandContribution, MenuContribution, OpenHandler, FrontendApplicationContribution {

    readonly id = PREVIEW_OPENER_ID;
    readonly label = 'Preview';

    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(PreviewHandlerProvider)
    protected readonly previewHandlerProvider: PreviewHandlerProvider;

    @inject(PreviewWidgetManager)
    protected readonly previewWidgetManager: PreviewWidgetManager;

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected readonly syncronizedUris = new Set<string>();

    protected readonly defaultOpenFromEditorOptions: PreviewOpenerOptions = {
        widgetOptions: { area: 'main', mode: 'split-right' },
        activate: false
    };

    protected readonly defaultOpenOptions: PreviewOpenerOptions = {
        widgetOptions: { area: 'main', mode: 'tab-after' },
        activate: true
    };

    onStart() {
        this.previewWidgetManager.onWidgetCreated(previewWidget => {
            this.registerOpenOnDoubleClick(previewWidget);
            this.registerEditorAndPreviewSync(previewWidget);
        });
        this.editorManager.onActiveChanged(editorWidget => {
            if (editorWidget) {
                this.registerEditorAndPreviewSync(editorWidget);
            }
        });
    }

    protected async registerEditorAndPreviewSync(source: PreviewWidget | EditorWidget): Promise<void> {
        let uri: string;
        let editorWidget: EditorWidget | undefined;
        let previewWidget: PreviewWidget | undefined;
        if (source instanceof EditorWidget) {
            editorWidget = source as EditorWidget;
            uri = editorWidget.editor.uri.toString();
            previewWidget = this.previewWidgetManager.get(uri);
        } else {
            previewWidget = source as PreviewWidget;
            uri = previewWidget.getUri().toString();
            editorWidget = this.editorManager.all.find(widget => widget.editor.uri.toString() === uri);
        }
        if (!previewWidget || !editorWidget || !uri) {
            return;
        }
        if (this.syncronizedUris.has(uri)) {
            return;
        }
        const syncDisposables = new DisposableCollection();
        const editor = editorWidget.editor;
        const thatPreviewWidget = previewWidget;
        syncDisposables.push(editor.onCursorPositionChanged(position =>
            this.revealSourceLineInPreview(thatPreviewWidget, position))
        );
        syncDisposables.push(this.synchronizeScrollToEditor(previewWidget, editor));
        if (!previewWidget) {
            window.setTimeout(() => {
                this.revealSourceLineInPreview(thatPreviewWidget, editor.cursor);
            }, 100);
        }
        previewWidget.disposed.connect(() => {
            syncDisposables.dispose();
        });
        editorWidget.disposed.connect(() => {
            syncDisposables.dispose();
        });
        syncDisposables.push(Disposable.create(() => this.syncronizedUris.delete(uri)));
        this.syncronizedUris.add(uri);
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
        if (!previewWidget) {
            return;
        }
        const disposable = previewWidget.onDidDoubleClick(location => {
            const refWidget = this.findWidgetInMainAreaToAddAfter();
            const widgetOptions: ApplicationShell.WidgetOptions = (refWidget)
                ? { area: 'main', mode: 'tab-after', ref: refWidget }
                : { area: 'main', mode: 'split-left' };
            this.editorManager.open(new URI(location.uri), { widgetOptions })
                .then(widget => {
                    if (widget) {
                        widget.editor.revealPosition(location.range.start);
                        return widget.editor;
                    }
                }).then(editor => {
                    if (editor) {
                        editor.selection = location.range;
                    }
                });
        });
        previewWidget.disposed.connect(() => disposable.dispose());
    }

    canHandle(uri: URI, options?: OpenerOptions): number {
        let canHandle = (this.previewHandlerProvider.canHandle(uri)) ? 50 : 0;
        if (canHandle && uri.query.indexOf(this.id) >= 0) {
            canHandle = 200;
        }
        return canHandle;
    }

    async open(uri: URI, options?: PreviewOpenerOptions): Promise<PreviewWidget | undefined> {
        try {
            await this.resourceProvider(uri);
        } catch (error) {
            this.messageService.warn(`'${uri.path.base}' is missing.`);
            return;
        }
        const openerOptions = this.updateOpenerOptions(options);
        const previewWidget = <PreviewWidget>await this.widgetManager.getOrCreateWidget(
            PREVIEW_WIDGET_FACTORY_ID,
            <PreviewWidgetOptions>{ uri: uri.toString() });
        if (!previewWidget.isAttached) {
            this.app.shell.addWidget(previewWidget, openerOptions.widgetOptions || this.defaultOpenOptions.widgetOptions!);
        }
        if (openerOptions.activate) {
            this.app.shell.activateWidget(previewWidget.id);
        } else {
            const tabBar = this.app.shell.getTabBarFor(previewWidget);
            if (tabBar) {
                tabBar.currentIndex = tabBar.titles.findIndex(title => title.owner === previewWidget);
            }
        }
        return previewWidget;
    }

    protected updateOpenerOptions(options?: PreviewOpenerOptions): PreviewOpenerOptions {
        if (!options) {
            const refWidget = this.findWidgetInMainAreaToAddAfter();
            if (refWidget) {
                return { ...this.defaultOpenOptions, widgetOptions: { area: 'main', mode: 'tab-after', ref: refWidget } };
            }
            return this.defaultOpenOptions;
        }
        if (options.originUri) {
            const originPreviewWidget = this.previewWidgetManager.get(options.originUri);
            if (originPreviewWidget) {
                return { ...this.defaultOpenOptions, widgetOptions: { area: 'main', mode: 'tab-after', ref: originPreviewWidget } };
            }
        }
        return { ...this.defaultOpenOptions, ...options };
    }

    protected findWidgetInMainAreaToAddAfter(): Widget | undefined {
        const mainTabBars = this.app.shell.mainAreaTabBars;
        const defaultTabBar = this.app.shell.getTabBarFor('main');
        if (mainTabBars.length > 1 && defaultTabBar) {
            const currentTabArea = this.app.shell.currentTabArea;
            const currentTabBar = (currentTabArea === 'main') ? this.app.shell.currentTabBar || defaultTabBar : defaultTabBar;
            const currentIndex = mainTabBars.indexOf(currentTabBar);
            const targetIndex = (mainTabBars.length === currentIndex + 1) ? currentIndex - 1 : currentIndex + 1;
            const targetTabBar = mainTabBars[targetIndex];
            const currentTitle = targetTabBar.currentTitle;
            if (currentTitle) {
                const refWidget = currentTitle.owner;
                return refWidget;
            }
        }
        return;
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(PreviewCommands.OPEN, <CommandHandler>{
            execute: () => this.openForEditor(),
            isEnabled: () => this.canHandleEditorUri(),
            isVisible: () => this.canHandleEditorUri(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        const menuPath = [...EDITOR_CONTEXT_MENU, 'navigation'];
        menus.registerMenuAction(menuPath, {
            commandId: PreviewCommands.OPEN.id,
            label: PreviewCommands.OPEN.label,
        });
    }

    protected canHandleEditorUri(): boolean {
        const uri = this.getCurrentEditorUri();
        if (uri) {
            return this.previewHandlerProvider.canHandle(uri);
        }
        return false;
    }

    protected getCurrentEditorUri(): URI | undefined {
        const active = this.editorManager.current;
        if (active) {
            return active.editor.uri;
        }
        return undefined;
    }

    protected async openForEditor(): Promise<void> {
        const editorWidget = this.editorManager.current;
        if (!editorWidget) {
            return;
        }
        const editor = editorWidget.editor;
        const uri = editor.uri;
        const refWidget = this.findWidgetInMainAreaToAddAfter();
        const widgetOptions: ApplicationShell.WidgetOptions = (refWidget)
            ? { area: 'main', mode: 'tab-after', ref: refWidget }
            : { area: 'main', mode: 'split-right' };
        this.open(uri, { ... this.defaultOpenFromEditorOptions, widgetOptions });
    }

}
