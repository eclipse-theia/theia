// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// only type imports are allowed here since this runs in an iframe. All other code is not accessible
import type * as webviewCommunication from './webview-communication';
import type * as rendererApi from 'vscode-notebook-renderer';
import type { Disposable, Event } from '@theia/core';

declare const acquireVsCodeApi: () => ({
    getState(): { [key: string]: unknown };
    setState(data: { [key: string]: unknown }): void;
    postMessage: (msg: unknown) => void;
});

declare function __import(path: string): Promise<unknown>;

interface Listener<T> { fn: (evt: T) => void; thisArg: unknown };

interface EmitterLike<T> {
    fire(data: T): void;
    event: Event<T>;
}

interface RendererContext extends rendererApi.RendererContext<unknown> {
    readonly onDidChangeSettings: Event<RenderOptions>;
    readonly settings: RenderOptions;
}

interface NotebookRendererEntrypoint {
    readonly path: string;
    readonly extends?: string
};

export interface RenderOptions {
    readonly lineLimit: number;
    readonly outputScrolling: boolean;
    readonly outputWordWrap: boolean;
}

export interface PreloadContext {
    readonly isWorkspaceTrusted: boolean;
    readonly rendererData: readonly webviewCommunication.RendererMetadata[];
    readonly renderOptions: RenderOptions;
}

export async function outputWebviewPreload(ctx: PreloadContext): Promise<void> {
    const theia = acquireVsCodeApi();
    const renderFallbackErrorName = 'vscode.fallbackToNextRenderer';

    function createEmitter<T>(listenerChange: (listeners: Set<Listener<T>>) => void = () => undefined): EmitterLike<T> {
        const listeners = new Set<Listener<T>>();
        return {
            fire(data: T): void {
                for (const listener of [...listeners]) {
                    listener.fn.call(listener.thisArg, data);
                }
            },
            event(fn, thisArg, disposables): Disposable {
                const listenerObj = { fn, thisArg };
                const disposable: Disposable = {
                    dispose: () => {
                        listeners.delete(listenerObj);
                        listenerChange(listeners);
                    },
                };

                listeners.add(listenerObj);
                listenerChange(listeners);

                if (disposables) {
                    if ('push' in disposables) {
                        disposables.push(disposable);
                    } else {
                        disposables.add(disposable);
                    }
                }
                return disposable;
            }
        };
    };

    const settingChange: EmitterLike<RenderOptions> = createEmitter<RenderOptions>();

    class Output {
        readonly outputId: string;
        renderedItem?: rendererApi.OutputItem;
        allItems: rendererApi.OutputItem[];

        renderer: Renderer;

        element: HTMLElement;

        constructor(output: webviewCommunication.Output, items: rendererApi.OutputItem[]) {
            this.element = document.createElement('div');
            // padding for scrollbars
            this.element.style.paddingBottom = '10px';
            this.element.style.paddingRight = '10px';
            this.element.id = output.id;
            document.body.appendChild(this.element);
            this.outputId = output.id;
            this.allItems = items;
        }

        findItemToRender(preferredMimetype?: string): rendererApi.OutputItem {
            if (preferredMimetype) {
                const itemToRender = this.allItems.find(item => item.mime === preferredMimetype);
                if (itemToRender) {
                    return itemToRender;
                }
            }
            return this.renderedItem ?? this.allItems[0];
        }

        clear(): void {
            this.renderer?.disposeOutputItem?.(this.renderedItem?.id);
            this.element.innerHTML = '';
        }
    }

    const outputs: Output[] = [];

    class Renderer {

        entrypoint: NotebookRendererEntrypoint;

        private rendererApi?: rendererApi.RendererApi;

        private onMessageEvent: EmitterLike<unknown> = createEmitter();

        constructor(
            public readonly data: webviewCommunication.RendererMetadata
        ) { }

        public receiveMessage(message: unknown): void {
            this.onMessageEvent.fire(message);
        }

        public disposeOutputItem(id?: string): void {
            this.rendererApi?.disposeOutputItem?.(id);
        }

        async getOrLoad(): Promise<rendererApi.RendererApi | undefined> {
            if (this.rendererApi) {
                return this.rendererApi;
            }
            const baseUri = window.location.href.replace(/\/webview\/index\.html.*/, '');
            const rendererModule = await __import(`${baseUri}/${this.data.entrypoint.uri}`) as { activate: rendererApi.ActivationFunction };
            this.rendererApi = await rendererModule.activate(this.createRendererContext());
            return this.rendererApi;
        }

        protected createRendererContext(): RendererContext {
            const context: RendererContext = {
                setState: newState => theia.setState({ ...theia.getState(), [this.data.id]: newState }),
                getState: <T>() => {
                    const state = theia.getState();
                    return typeof state === 'object' && state ? state[this.data.id] as T : undefined;
                },
                getRenderer: async (id: string) => {
                    const renderer = renderers.getRenderer(id);
                    if (!renderer) {
                        return undefined;
                    }
                    if (renderer.rendererApi) {
                        return renderer.rendererApi;
                    }
                    return renderer.getOrLoad();
                },
                workspace: {
                    get isTrusted(): boolean { return true; } // TODO use Workspace trust service
                },
                settings: {
                    get lineLimit(): number { return ctx.renderOptions.lineLimit; },
                    get outputScrolling(): boolean { return ctx.renderOptions.outputScrolling; },
                    get outputWordWrap(): boolean { return ctx.renderOptions.outputWordWrap; },
                },
                get onDidChangeSettings(): Event<RenderOptions> { return settingChange.event; },
            };

            if (this.data.requiresMessaging) {
                context.onDidReceiveMessage = this.onMessageEvent.event;
                context.postMessage = message => theia.postMessage({ type: 'customRendererMessage', rendererId: this.data.id, message });
            }

            return Object.freeze(context);
        }
    }

    const renderers = new class {
        private readonly renderers = new Map</* id */ string, Renderer>();

        constructor() {
            for (const renderer of ctx.rendererData) {
                this.addRenderer(renderer);
            }
        }

        public getRenderer(id: string): Renderer | undefined {
            return this.renderers.get(id);
        }

        private rendererEqual(a: webviewCommunication.RendererMetadata, b: webviewCommunication.RendererMetadata): boolean {
            if (a.id !== b.id || a.entrypoint.uri !== b.entrypoint.uri || a.entrypoint.extends !== b.entrypoint.extends || a.requiresMessaging !== b.requiresMessaging) {
                return false;
            }

            if (a.mimeTypes.length !== b.mimeTypes.length) {
                return false;
            }

            for (let i = 0; i < a.mimeTypes.length; i++) {
                if (a.mimeTypes[i] !== b.mimeTypes[i]) {
                    return false;
                }
            }

            return true;
        }

        public updateRendererData(rendererData: readonly webviewCommunication.RendererMetadata[]): void {
            const oldKeys = new Set(this.renderers.keys());
            const newKeys = new Set(rendererData.map(d => d.id));

            for (const renderer of rendererData) {
                const existing = this.renderers.get(renderer.id);
                if (existing && this.rendererEqual(existing.data, renderer)) {
                    continue;
                }

                this.addRenderer(renderer);
            }

            for (const key of oldKeys) {
                if (!newKeys.has(key)) {
                    this.renderers.delete(key);
                }
            }
        }

        private addRenderer(renderer: webviewCommunication.RendererMetadata): void {
            this.renderers.set(renderer.id, new Renderer(renderer));
        }

        public clearAll(): void {
            for (const renderer of this.renderers.values()) {
                renderer.disposeOutputItem();
            }
        }

        public clearOutput(rendererId: string, outputId: string): void {
            // outputRunner.cancelOutput(outputId);
            this.renderers.get(rendererId)?.disposeOutputItem(outputId);
        }

        public async render(output: Output, preferredMimeType: string | undefined, preferredRendererId: string | undefined, signal: AbortSignal): Promise<void> {
            const item = output.findItemToRender(preferredMimeType);
            const primaryRenderer = this.findRenderer(preferredRendererId, item);
            if (!primaryRenderer) {
                this.showRenderError(item, output.element, 'No renderer found for output type.');
                return;
            }

            // Try primary renderer first
            if (!(await this.doRender(item, output.element, primaryRenderer, signal)).continue) {
                output.renderer = primaryRenderer;
                this.onRenderCompleted();
                return;
            }

            // Primary renderer failed in an expected way. Fallback to render the next mime types
            for (const additionalItem of output.allItems) {
                if (additionalItem.mime === item.mime) {
                    continue;
                }

                if (signal.aborted) {
                    return;
                }

                if (additionalItem) {
                    const renderer = this.findRenderer(undefined, additionalItem);
                    if (renderer) {
                        if (!(await this.doRender(additionalItem, output.element, renderer, signal)).continue) {
                            output.renderer = renderer;
                            this.onRenderCompleted();
                            return; // We rendered successfully
                        }
                    }
                }
            }

            // All renderers have failed and there is nothing left to fallback to
            this.showRenderError(item, output.element, 'No fallback renderers found or all fallback renderers failed.');
        }

        private onRenderCompleted(): void {
            // we need to check for all images are loaded. Otherwise we can't determine the correct height of the output
            const images = Array.from(document.images);
            if (images.length > 0) {
                Promise.all(images.filter(img => !img.complete).map(img => new Promise(resolve => { img.onload = img.onerror = resolve; }))).then(() => {
                    theia.postMessage(<webviewCommunication.OnDidRenderOutput>{ type: 'didRenderOutput', contentHeight: document.body.clientHeight });
                    new ResizeObserver(() =>
                        theia.postMessage(<webviewCommunication.OnDidRenderOutput>{ type: 'didRenderOutput', contentHeight: document.body.clientHeight }))
                        .observe(document.body);
                });
            } else {
                theia.postMessage(<webviewCommunication.OnDidRenderOutput>{ type: 'didRenderOutput', contentHeight: document.body.clientHeight });
                new ResizeObserver(() =>
                    theia.postMessage(<webviewCommunication.OnDidRenderOutput>{ type: 'didRenderOutput', contentHeight: document.body.clientHeight }))
                    .observe(document.body);
            }

        }

        private async doRender(item: rendererApi.OutputItem, element: HTMLElement, renderer: Renderer, signal: AbortSignal): Promise<{ continue: boolean }> {
            try {
                (await renderer.getOrLoad())?.renderOutputItem(item, element, signal);
                return { continue: false }; // We rendered successfully
            } catch (e) {
                if (signal.aborted) {
                    return { continue: false };
                }

                if (e instanceof Error && e.name === renderFallbackErrorName) {
                    return { continue: true };
                } else {
                    throw e; // Bail and let callers handle unknown errors
                }
            }
        }

        private findRenderer(preferredRendererId: string | undefined, info: rendererApi.OutputItem): Renderer | undefined {
            let foundRenderer: Renderer | undefined;

            if (typeof preferredRendererId === 'string') {
                foundRenderer = Array.from(this.renderers.values())
                    .find(renderer => renderer.data.id === preferredRendererId);
            } else {
                const rendererList = Array.from(this.renderers.values())
                    .filter(renderer => renderer.data.mimeTypes.includes(info.mime) && !renderer.data.entrypoint.extends);

                if (rendererList.length) {
                    // De-prioritize built-in renderers
                    // rendererList.sort((a, b) => +a.data.isBuiltin - +b.data.isBuiltin);

                    // Use first renderer we find in sorted list
                    foundRenderer = rendererList[0];
                }
            }
            return foundRenderer;
        }

        private showRenderError(info: rendererApi.OutputItem, element: HTMLElement, errorMessage: string): void {
            const errorContainer = document.createElement('div');

            const error = document.createElement('div');
            error.className = 'no-renderer-error';
            error.innerText = errorMessage;

            const cellText = document.createElement('div');
            cellText.innerText = info.text();

            errorContainer.appendChild(error);
            errorContainer.appendChild(cellText);

            element.innerText = '';
            element.appendChild(errorContainer);
        }
    }();

    function clearOutput(output: Output): void {
        output.clear();
        output.element.remove();
    }

    function outputsChanged(changedEvent: webviewCommunication.OutputChangedMessage): void {
        for (const output of outputs.splice(changedEvent.deleteStart ?? 0, changedEvent.deleteCount ?? 0)) {
            clearOutput(output);
        }

        for (const outputData of changedEvent.newOutputs ?? []) {
            const apiItems: rendererApi.OutputItem[] = outputData.items.map((item, index) => ({
                id: `${outputData.id}-${index}`,
                mime: item.mime,
                metadata: outputData.metadata,
                data(): Uint8Array {
                    return item.data;
                },
                text(): string {
                    return new TextDecoder().decode(this.data());
                },
                json(): unknown {
                    return JSON.parse(this.text());
                },
                blob(): Blob {
                    return new Blob([this.data()], { type: this.mime });
                },

            }));

            const output = new Output(outputData, apiItems);
            outputs.push(output);

            renderers.render(output, undefined, undefined, new AbortController().signal);
        }
    }

    function scrollParent(event: WheelEvent): boolean {
        for (let node = event.target as Node | null; node; node = node.parentNode) {
            if (!(node instanceof Element)) {
                continue;
            }

            // scroll up
            if (event.deltaY < 0 && node.scrollTop > 0) {
                // there is still some content to scroll
                return false;
            }

            // scroll down
            if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
                // per https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight
                // scrollTop is not rounded but scrollHeight and clientHeight are
                // so we need to check if the difference is less than some threshold
                if (node.scrollHeight - node.scrollTop - node.clientHeight > 2) {
                    return false;
                }
            }
        }

        return true;
    }

    const handleWheel = (event: WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number; wheelDelta?: number }) => {
        if (scrollParent(event)) {
            theia.postMessage({
                type: 'did-scroll-wheel',
                deltaY: event.deltaY,
                deltaX: event.deltaX,
            });
        }
    };

    window.addEventListener('message', async rawEvent => {
        const event = rawEvent as ({ data: webviewCommunication.ToWebviewMessage });

        switch (event.data.type) {
            case 'updateRenderers':
                renderers.updateRendererData(event.data.rendererData);
                break;
            case 'outputChanged':
                outputsChanged(event.data);
                break;
            case 'customRendererMessage':
                renderers.getRenderer(event.data.rendererId)?.receiveMessage(event.data.message);
                break;
            case 'changePreferredMimetype':
                const outputId = event.data.outputId;
                const index = outputs.findIndex(output => output.outputId === outputId);
                outputs.splice(index, 1);
                clearOutput(outputs.splice(index, 1)[0]);
                renderers.render(outputs[index], event.data.mimeType, undefined, new AbortController().signal);
                break;
        }
    });
    window.addEventListener('wheel', handleWheel);

    theia.postMessage(<webviewCommunication.WebviewInitialized>{ type: 'initialized' });
}
