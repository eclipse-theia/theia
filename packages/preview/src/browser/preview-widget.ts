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
import { ResourceProvider, Event, Emitter } from '@theia/core/lib/common';
import { Workspace, Location, Range } from "@theia/languages/lib/common";
import { PreviewHandler, PreviewHandlerProvider } from './preview-handler';
import { throttle } from 'throttle-debounce';
import { ThemeService } from '@theia/core/lib/browser/theming';

export const PREVIEW_WIDGET_CLASS = 'theia-preview-widget';

export const PREVIEW_WIDGET_FACTORY_ID = 'preview-widget';

const DEFAULT_ICON = 'fa fa-eye';

let widgetCounter: number = 0;

export const PreviewWidgetOptions = Symbol('PreviewWidgetOptions');
export interface PreviewWidgetOptions {
    uri: string
}

@injectable()
export class PreviewWidget extends BaseWidget {

    protected uri: URI;
    protected resource: Resource | undefined;
    protected previewHandler: PreviewHandler | undefined;
    protected firstUpdate: (() => void) | undefined = undefined;
    protected readonly onDidScrollEmitter = new Emitter<number>();
    protected readonly onDidDoubleClickEmitter = new Emitter<Location>();

    constructor(
        @inject(PreviewWidgetOptions) protected readonly options: PreviewWidgetOptions,
        @inject(PreviewHandlerProvider) protected readonly previewHandlerProvider: PreviewHandlerProvider,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(Workspace) protected readonly workspace: Workspace,
    ) {
        super();
        this.uri = new URI(options.uri);
        this.id = 'preview-widget-' + widgetCounter++;
        this.title.closable = true;
        this.title.label = `Preview ${this.uri.path.base}`;
        this.title.caption = this.title.label;
        this.title.closable = true;

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
        const trimmedUri = this.uri.withoutFragment();
        const resource = this.resource = await this.resourceProvider(trimmedUri);
        this.toDispose.push(resource);
        if (resource.onDidChangeContents) {
            this.toDispose.push(resource.onDidChangeContents(() => this.update()));
        }
        const updateIfAffected = (affectedUri?: string) => {
            if (!affectedUri || affectedUri === trimmedUri.toString()) {
                this.update();
            }
        };
        this.toDispose.push(this.workspace.onDidOpenTextDocument(document => updateIfAffected(document.uri)));
        this.toDispose.push(this.workspace.onDidChangeTextDocument(params => updateIfAffected(params.textDocument.uri)));
        this.toDispose.push(this.workspace.onDidCloseTextDocument(document => updateIfAffected(document.uri)));
        this.toDispose.push(ThemeService.get().onThemeChange(() => this.update()));
        this.startScrollSync();
        this.startDoubleClickListener();
        this.firstUpdate = () => {
            this.revealFragment(this.uri);
        };
        this.update();
    }

    protected preventScrollNotification: boolean = false;
    protected startScrollSync(): void {
        this.node.addEventListener('scroll', throttle(50, (event: UIEvent) => {
            if (this.preventScrollNotification) {
                return;
            }
            const scrollTop = this.node.scrollTop;
            this.didScroll(scrollTop);
        }));
    }

    protected startDoubleClickListener(): void {
        this.node.addEventListener('dblclick', (event: MouseEvent) => {
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

    protected async performUpdate(): Promise<void> {
        if (!this.resource) {
            return;
        }
        const uri = this.resource.uri;
        const document = this.workspace.textDocuments.find(d => d.uri === uri.toString());
        const content: MaybePromise<string> = document ? document.getText() : this.resource.readContents();
        const contentElement = await this.render(await content, uri);
        this.node.innerHTML = '';
        if (contentElement) {
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
