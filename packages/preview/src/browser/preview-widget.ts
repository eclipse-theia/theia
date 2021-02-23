/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import throttle = require('@theia/core/shared/lodash.throttle');
import { inject, injectable } from '@theia/core/shared/inversify';
import { Resource, MaybePromise } from '@theia/core';
import { Navigatable } from '@theia/core/lib/browser/navigatable';
import { BaseWidget, Message, addEventListener } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { Event, Emitter } from '@theia/core/lib/common';
import { PreviewHandler, PreviewHandlerProvider } from './preview-handler';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { EditorPreferences } from '@theia/editor/lib/browser';
import { Disposable } from '@theia/core/lib/common/disposable';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { Range, Location } from '@theia/core/shared/vscode-languageserver-types';

export const PREVIEW_WIDGET_CLASS = 'theia-preview-widget';

const DEFAULT_ICON = 'fa fa-eye';

let widgetCounter: number = 0;

export const PreviewWidgetOptions = Symbol('PreviewWidgetOptions');
export interface PreviewWidgetOptions {
    resource: Resource
}

@injectable()
export class PreviewWidget extends BaseWidget implements Navigatable {

    readonly uri: URI;
    protected readonly resource: Resource;
    protected previewHandler: PreviewHandler | undefined;
    protected firstUpdate: (() => void) | undefined = undefined;
    protected readonly onDidScrollEmitter = new Emitter<number>();
    protected readonly onDidDoubleClickEmitter = new Emitter<Location>();
    protected scrollBeyondLastLine: boolean;

    constructor(
        @inject(PreviewWidgetOptions) protected readonly options: PreviewWidgetOptions,
        @inject(PreviewHandlerProvider) protected readonly previewHandlerProvider: PreviewHandlerProvider,
        @inject(ThemeService) protected readonly themeService: ThemeService,
        @inject(MonacoWorkspace) protected readonly workspace: MonacoWorkspace,
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
                this.scrollBeyondLastLine = e.newValue;
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
        this.toDispose.push(this.workspace.onDidChangeTextDocument(params => updateIfAffected(params.model.uri)));
        this.toDispose.push(this.workspace.onDidCloseTextDocument(document => updateIfAffected(document.uri)));
        this.toDispose.push(this.themeService.onThemeChange(() => this.update()));
        this.firstUpdate = () => {
            this.revealFragment(this.uri);
        };
        this.update();
    }

    protected onBeforeAttach(msg: Message): void {
        super.onBeforeAttach(msg);
        this.toDispose.push(this.startScrollSync());
        this.toDispose.push(this.startDoubleClickListener());
    }

    protected preventScrollNotification: boolean = false;
    protected startScrollSync(): Disposable {
        return addEventListener(this.node, 'scroll', throttle((event: UIEvent) => {
            if (this.preventScrollNotification) {
                return;
            }
            const scrollTop = this.node.scrollTop;
            this.didScroll(scrollTop);
        }, 50));
    }

    protected startDoubleClickListener(): Disposable {
        return addEventListener(this.node, 'dblclick', (event: MouseEvent) => {
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

    getResourceUri(): URI | undefined {
        return this.uri;
    }
    createMoveToUri(resourceUri: URI): URI | undefined {
        return this.uri.withPath(resourceUri.path);
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        this.update();
    }

    onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.performUpdate();
    }

    protected forceUpdate(): void {
        this.previousContent = undefined;
        this.update();
    }

    protected previousContent: string | undefined = undefined;
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
            elementToReveal.scrollIntoView();
            window.setTimeout(() => {
                this.preventScrollNotification = false;
            }, 50);
        }
    }

    revealForSourceLine(sourceLine: number): void {
        this.internalRevealForSourceLine(sourceLine);
    }
    protected readonly internalRevealForSourceLine: (sourceLine: number) => void = throttle((sourceLine: number) => {
        if (!this.previewHandler || !this.previewHandler.findElementForSourceLine) {
            return;
        }
        const elementToReveal = this.previewHandler.findElementForSourceLine(this.node, sourceLine);
        if (elementToReveal) {
            this.preventScrollNotification = true;
            elementToReveal.scrollIntoView();
            window.setTimeout(() => {
                this.preventScrollNotification = false;
            }, 50);
        }
    }, 50);

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
        const line = this.previewHandler.getSourceLineForOffset(this.node, offsetTop) || 0;
        this.fireDidDoubleClickToSourceLine(line);
    }

}
