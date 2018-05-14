/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { Resource, MaybePromise } from '@theia/core';
import { BaseWidget, Message } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { Event, Emitter } from '@theia/core/lib/common';
import { Workspace, Location, Range } from "@theia/languages/lib/common";
import { PreviewHandler, PreviewHandlerProvider } from './preview-handler';
import { throttle } from 'throttle-debounce';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { EditorPreferences } from "@theia/editor/lib/browser";

export const PREVIEW_WIDGET_CLASS = 'theia-preview-widget';

const DEFAULT_ICON = 'fa fa-eye';

let widgetCounter: number = 0;

export const PreviewWidgetOptions = Symbol('PreviewWidgetOptions');
export interface PreviewWidgetOptions {
    resource: Resource
}

@injectable()
export class PreviewWidget extends BaseWidget {

    protected readonly uri: URI;
    protected readonly resource: Resource;
    protected previewHandler: PreviewHandler | undefined;
    protected firstUpdate: (() => void) | undefined = undefined;
    protected readonly onDidScrollEmitter = new Emitter<number>();
    protected readonly onDidDoubleClickEmitter = new Emitter<Location>();
    protected scrollBeyondLastLine: boolean;

    constructor(
        @inject(PreviewWidgetOptions) protected readonly options: PreviewWidgetOptions,
        @inject(PreviewHandlerProvider) protected readonly previewHandlerProvider: PreviewHandlerProvider,
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences,
    ) {
        super();
        this.resource = this.options.resource;
        this.uri = this.resource.uri;
        this.id = 'preview-widget-' + widgetCounter++;
        this.title.closable = true;
        this.title.label = `Preview ${this.uri.path.base}`;
        this.title.caption = this.title.label;
        this.title.closable = true;

        this.toDispose.push(this.onDidScrollEmitter);
        this.toDispose.push(this.onDidDoubleClickEmitter);

        this.addClass(PREVIEW_WIDGET_CLASS);
        this.node.tabIndex = 0;
        const previewHandler = this.previewHandler = this.previewHandlerProvider.findContribution(this.uri)[0];
        if (!previewHandler) {
            return;
        }
        this.title.iconClass = previewHandler.iconClass || DEFAULT_ICON;
        this.initialize();
    }

    async initialize(): Promise<void> {
        this.scrollBeyondLastLine = !!this.editorPreferences['editor.scrollBeyondLastLine'];
        this.toDispose.push(this.editorPreferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'editor.scrollBeyondLastLine') {
                this.scrollBeyondLastLine = !!e.newValue;
                this.forceUpdate();
            }
        }));
        this.toDispose.push(this.resource);
        if (this.resource.onDidChangeContents) {
            this.toDispose.push(this.resource.onDidChangeContents(() => this.update()));
        }
        const updateIfAffected = (affectedUri?: string) => {
            if (!affectedUri || affectedUri === this.uri.toString()) {
                this.update();
            }
        };
        this.toDispose.push(this.workspace.onDidOpenTextDocument(document => updateIfAffected(document.uri)));
        this.toDispose.push(this.workspace.onDidChangeTextDocument(params => updateIfAffected(params.textDocument.uri)));
        this.toDispose.push(this.workspace.onDidCloseTextDocument(document => updateIfAffected(document.uri)));
        this.toDispose.push(ThemeService.get().onThemeChange(() => this.update()));
        this.firstUpdate = () => {
            this.revealFragment(this.uri);
        };
        this.update();
    }

    protected onBeforeAttach(msg: Message): void {
        super.onBeforeAttach(msg);
        this.startScrollSync();
        this.startDoubleClickListener();
    }

    protected preventScrollNotification: boolean = false;
    protected startScrollSync(): void {
        this.addEventListener(this.node, 'scroll', throttle(50, (event: UIEvent) => {
            if (this.preventScrollNotification) {
                return;
            }
            const scrollTop = this.node.scrollTop;
            this.didScroll(scrollTop);
        }));
    }

    protected startDoubleClickListener(): void {
        this.addEventListener(this.node, 'dblclick', (event: MouseEvent) => {
            if (!(event.target instanceof HTMLElement)) {
                return;
            }
            const target = event.target as HTMLElement;
            let node: HTMLElement | null = target;
            while (node && node instanceof HTMLElement) {
                if (node.tagName === 'A') {
                    return;
                }
                node = node.parentElement;
            }
            const offsetParent = target.offsetParent as HTMLElement;
            const offset = offsetParent.classList.contains(PREVIEW_WIDGET_CLASS) ? target.offsetTop : offsetParent.offsetTop;
            this.didDoubleClick(offset);
        });
    }

    getUri(): URI {
        return this.uri;
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        if (this.node.children.length > 0) {
            (this.node.children.item(0) as HTMLElement).focus();
        } else {
            this.node.focus();
        }
        this.update();
    }

    onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.performUpdate();
    }

    protected forceUpdate() {
        this.previousContent = '';
        this.update();
    }

    protected previousContent: string = '';
    protected async performUpdate(): Promise<void> {
        if (!this.resource) {
            return;
        }
        const uri = this.resource.uri;
        const document = this.workspace.textDocuments.find(d => d.uri === uri.toString());
        const content: MaybePromise<string> = document ? document.getText() : await this.resource.readContents();
        if (content === this.previousContent) {
            return;
        }
        this.previousContent = content;
        const contentElement = await this.render(content, uri);
        this.node.innerHTML = '';
        if (contentElement) {
            if (this.scrollBeyondLastLine) {
                contentElement.classList.add('scrollBeyondLastLine');
            }
            this.node.appendChild(contentElement);
            if (this.firstUpdate) {
                this.firstUpdate();
                this.firstUpdate = undefined;
            }
        }
    }

    protected async render(content: string, originUri: URI): Promise<HTMLElement | undefined> {
        if (!this.previewHandler || !this.resource) {
            return undefined;
        }
        return this.previewHandler.renderContent({ content, originUri });
    }

    protected revealFragment(uri: URI): void {
        if (uri.fragment === '' || !this.previewHandler || !this.previewHandler.findElementForFragment) {
            return;
        }
        const elementToReveal = this.previewHandler.findElementForFragment(this.node, uri.fragment);
        if (elementToReveal) {
            this.preventScrollNotification = true;
            elementToReveal.scrollIntoView({ behavior: 'instant' });
            window.setTimeout(() => {
                this.preventScrollNotification = false;
            }, 50);
        }
    }

    revealForSourceLine(sourceLine: number): void {
        this.internalRevealForSourceLine(sourceLine);
    }
    protected readonly internalRevealForSourceLine: (sourceLine: number) => void = throttle(50, (sourceLine: number) => {
        if (!this.previewHandler || !this.previewHandler.findElementForSourceLine) {
            return;
        }
        const elementToReveal = this.previewHandler.findElementForSourceLine(this.node, sourceLine);
        if (elementToReveal) {
            this.preventScrollNotification = true;
            elementToReveal.scrollIntoView({ behavior: 'instant' });
            window.setTimeout(() => {
                this.preventScrollNotification = false;
            }, 50);
        }
    });

    get onDidScroll(): Event<number> {
        return this.onDidScrollEmitter.event;
    }

    protected fireDidScrollToSourceLine(line: number): void {
        this.onDidScrollEmitter.fire(line);
    }

    protected didScroll(scrollTop: number): void {
        if (!this.previewHandler || !this.previewHandler.getSourceLineForOffset) {
            return;
        }
        const offset = scrollTop;
        const line = this.previewHandler.getSourceLineForOffset(this.node, offset);
        if (line) {
            this.fireDidScrollToSourceLine(line);
        }
    }

    get onDidDoubleClick(): Event<Location> {
        return this.onDidDoubleClickEmitter.event;
    }

    protected fireDidDoubleClickToSourceLine(line: number): void {
        if (!this.resource) {
            return;
        }
        this.onDidDoubleClickEmitter.fire({
            uri: this.resource.uri.toString(),
            range: Range.create({ line, character: 0 }, { line, character: 0 })
        });
    }

    protected didDoubleClick(offsetTop: number): void {
        if (!this.previewHandler || !this.previewHandler.getSourceLineForOffset) {
            return;
        }
        const line = this.previewHandler.getSourceLineForOffset(this.node, offsetTop);
        if (line) {
            this.fireDidDoubleClickToSourceLine(line);
        }
    }

}
