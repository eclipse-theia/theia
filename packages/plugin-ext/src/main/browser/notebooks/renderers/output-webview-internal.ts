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
    readonly staticPreloadsData: readonly string[];
}

interface KernelPreloadContext {
    readonly onDidReceiveKernelMessage: Event<unknown>;
    postKernelMessage(data: unknown): void;
}

interface KernelPreloadModule {
    activate(ctx: KernelPreloadContext): Promise<void> | void;
}

export async function outputWebviewPreload(ctx: PreloadContext): Promise<void> {
    const theia = acquireVsCodeApi();
    const renderFallbackErrorName = 'vscode.fallbackToNextRenderer';

    const container = document.createElement('div');
    container.id = 'container';
    container.classList.add('widgetarea');
    document.body.appendChild(container);

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

    const onDidReceiveKernelMessage = createEmitter<unknown>();

    function createKernelContext(): KernelPreloadContext {
        return Object.freeze({
            onDidReceiveKernelMessage: onDidReceiveKernelMessage.event,
            postKernelMessage: (data: unknown) => {
                theia.postMessage({ type: 'customKernelMessage', message: data });
            }
        });
    }

    async function runKernelPreload(url: string): Promise<void> {
        try {
            return activateModuleKernelPreload(url);
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    async function activateModuleKernelPreload(url: string): Promise<void> {
        const baseUri = window.location.href.replace(/\/webview\/index\.html.*/, '');
        const module: KernelPreloadModule = (await __import(`${baseUri}/${url}`)) as KernelPreloadModule;
        if (!module.activate) {
            console.error(`Notebook preload '${url}' was expected to be a module but it does not export an 'activate' function`);
            return;
        }
        return module.activate(createKernelContext());
    }

    class OutputCell {
        public readonly element: HTMLElement;
        private readonly outputElements: OutputContainer[] = [];

        constructor(public cellHandle: number, cellIndex?: number) {

            console.log('createNewCell', cellHandle, cellIndex);

            this.element = document.createElement('div');
            this.element.style.outline = '0';

            this.element.id = `cellHandle${cellHandle}`;
            this.element.classList.add('cell_container');

            if (cellIndex && cellIndex < container.children.length) {
                console.log('insertBefore', cellIndex, container.children.length);
                container.insertBefore(this.element, container.children[cellIndex]);
            } else {
                console.log('appendChild', container.children.length);
                container.appendChild(this.element);
            }
            this.element = this.element;

            theia.postMessage({ type: 'cellHeightRequest', cellHandle: cellHandle });
        }

        public dispose(): void {
            this.element.remove();
        }

        createOutputElement(index: number, output: webviewCommunication.Output, items: rendererApi.OutputItem[]): OutputContainer {
            let outputContainer = this.outputElements.find(o => o.outputId === output.id);
            if (!outputContainer) {
                outputContainer = new OutputContainer(output, items, this.element);
                this.element.appendChild(outputContainer.element);
                this.outputElements.splice(index, 0, outputContainer);
            }

            return outputContainer;
        }

        public clearOutputs(start: number, deleteCount: number): void {
            for (const output of this.outputElements.splice(start, deleteCount)) {
                output?.clear();
                output.element.remove();
            }
        }

        public show(outputId: string, top: number): void {
            const outputContainer = this.outputElements.find(o => o.outputId === outputId);
            if (!outputContainer) {
                return;
            }

            // this.element.style.visibility = '';
            // this.element.style.top = `${top}px`;
        }

        public hide(): void {
            this.element.style.visibility = 'hidden';
        }

        public updateCellHeight(height: number): void {
            this.element.style.paddingTop = `${height + 50}px`;
        }

        // public updateScroll(request: webviewCommunication.IContentWidgetTopRequest): void {
        //     this.element.style.top = `${request.cellTop}px`;

        //     const outputElement = this.outputElements.get(request.outputId);
        //     if (outputElement) {
        //         outputElement.updateScroll(request.outputOffset);

        //         if (request.forceDisplay && outputElement.element) {
        //             // TODO @rebornix @mjbvz, there is a misalignment here.
        //             // We set output visibility on cell container, other than output container or output node itself.
        //             outputElement.element.style.visibility = '';
        //         }
        //     }

        //     if (request.forceDisplay) {
        //         this.element.style.visibility = '';
        //     }
    }

    const cells: OutputCell[] = [];

    class OutputContainer {
        readonly outputId: string;
        readonly cellId: string;
        renderedItem?: rendererApi.OutputItem;
        allItems: rendererApi.OutputItem[];

        renderer: Renderer;

        element: HTMLElement;

        constructor(output: webviewCommunication.Output, items: rendererApi.OutputItem[], cellContainer: HTMLElement) {
            this.outputId = output.id;
            this.createHtmlElement(cellContainer);
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

        private createHtmlElement(cellContainer: HTMLElement): void {
            const outputContainer = document.createElement('div');
            outputContainer.classList.add('output-container');
            cellContainer.appendChild(outputContainer);
            this.element = document.createElement('div');
            this.element.id = this.outputId;
            this.element.classList.add('output');
            outputContainer.appendChild(this.element);
        }

    }

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

            // Preloads need to be loaded before loading renderers.
            await kernelPreloads.waitForAllCurrent();

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
                context.postMessage = message => {
                    theia.postMessage({ type: 'customRendererMessage', rendererId: this.data.id, message });
                };
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

        public async render(output: OutputContainer, preferredMimeType: string | undefined, preferredRendererId: string | undefined, signal: AbortSignal): Promise<void> {
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

    const kernelPreloads = new class {
        private readonly preloads = new Map<string /* uri */, Promise<unknown>>();

        /**
         * Returns a promise that resolves when the given preload is activated.
         */
        public waitFor(uri: string): Promise<unknown> {
            return this.preloads.get(uri) || Promise.resolve(new Error(`Preload not ready: ${uri}`));
        }

        /**
         * Loads a preload.
         * @param uri URI to load from
         * @param originalUri URI to show in an error message if the preload is invalid.
         */
        public load(uri: string): Promise<unknown> {
            const promise = Promise.all([
                runKernelPreload(uri),
                this.waitForAllCurrent(),
            ]);

            this.preloads.set(uri, promise);
            return promise;
        }

        /**
         * Returns a promise that waits for all currently-registered preloads to
         * activate before resolving.
         */
        public waitForAllCurrent(): Promise<unknown[]> {
            return Promise.all([...this.preloads.values()].map(p => p.catch(err => err)));
        }
    };

    await Promise.all(ctx.staticPreloadsData.map(preload => kernelPreloads.load(preload)));

    async function outputsChanged(changedEvent: webviewCommunication.OutputChangedMessage): Promise<void> {
        for (const cellChange of changedEvent.changes) {
            let cell = cells.find(c => c.cellHandle === cellChange.cellHandle);
            if (!cell) {
                cell = new OutputCell(cellChange.cellHandle);
                cells.push(cell);
            }

            cell.clearOutputs(cellChange.start, cellChange.deleteCount);

            for (const outputData of cellChange.newOutputs ?? []) {
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
                const output = cell.createOutputElement(cellChange.start, outputData, apiItems);

                await renderers.render(output, undefined, undefined, new AbortController().signal);

                theia.postMessage(<webviewCommunication.OnDidRenderOutput>{
                    type: 'didRenderOutput',
                    cellHandle: cell.cellHandle,
                    outputId: outputData.id,
                    outputHeight: document.getElementById(output.outputId)?.clientHeight ?? 0,
                    contentHeight: document.body.clientHeight
                });

            }
        }
    }

    function cellsChanged(changes: (webviewCommunication.CellsMoved | webviewCommunication.CellsSpliced)[]): void {
        for (const change of changes) {
            if (change.type === 'cellMoved') {
                const currentIndex = cells.findIndex(c => c.cellHandle === change.cellHandle);
                const cell = cells[currentIndex];
                cells.splice(change.toIndex, 0, cells.splice(currentIndex, 1)[0]);
                container.insertBefore(cell.element, container.children[change.toIndex]);
            } else if (change.type === 'cellsSpliced') {
                console.log('cellsSpliced', change);
                const deltedCells = cells.splice(change.start, change.deleteCount, ...change.newCells.map((cellHandle, i) => new OutputCell(cellHandle, change.start + i)));
                deltedCells.forEach(cell => cell.dispose());
            }
        }
    }

    function shouldHandleScroll(event: WheelEvent): boolean {
        for (let node = event.target as Node | null; node; node = node.parentNode) {
            if (!(node instanceof Element)) {
                return false;
            }

            // scroll up
            if (event.deltaY < 0 && node.scrollTop > 0) {
                // there is still some content to scroll
                return true;
            }

            // scroll down
            if (event.deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) {
                // per https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight
                // scrollTop is not rounded but scrollHeight and clientHeight are
                // so we need to check if the difference is less than some threshold
                if (node.scrollHeight - node.scrollTop - node.clientHeight < 2) {
                    continue;
                }

                // if the node is not scrollable, we can continue. We don't check the computed style always as it's expensive
                if (window.getComputedStyle(node).overflowY === 'hidden' || window.getComputedStyle(node).overflowY === 'visible') {
                    continue;
                }

                return true;
            }
        }

        return false;
    }

    const handleWheel = (event: WheelEvent & { wheelDeltaX?: number; wheelDeltaY?: number; wheelDelta?: number }) => {
        if (event.defaultPrevented || shouldHandleScroll(event)) {
            return;
        }
        theia.postMessage({
            type: 'did-scroll-wheel',
            deltaY: event.deltaY,
            deltaX: event.deltaX,
        });
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
            case 'cellsChanged':
                cellsChanged(event.data.changes);
                break;
            case 'customRendererMessage':
                renderers.getRenderer(event.data.rendererId)?.receiveMessage(event.data.message);
                break;
            case 'changePreferredMimetype':
                // TODO reimplement
                // const mimeType = event.data.mimeType;
                // outputs.forEach(output => {
                //     output.element.innerHTML = '';
                //     renderers.render(output, mimeType, undefined, new AbortController().signal);
                // });
                break;
            case 'customKernelMessage':
                onDidReceiveKernelMessage.fire(event.data.message);
                break;
            case 'preload':
                const resources = event.data.resources;
                for (const uri of resources) {
                    kernelPreloads.load(uri);
                }
                break;
            case 'notebookStyles':
                const documentStyle = window.document.documentElement.style;

                for (let i = documentStyle.length - 1; i >= 0; i--) {
                    const property = documentStyle[i];

                    // Don't remove properties that the webview might have added separately
                    if (property && property.startsWith('--notebook-')) {
                        documentStyle.removeProperty(property);
                    }
                }

                // Re-add new properties
                for (const [name, value] of Object.entries(event.data.styles)) {
                    documentStyle.setProperty(`--${name}`, value);
                }
                break;
            case 'cellHeightUpdate':
                const cellHandle = event.data.cellHandle;
                const cell = cells.find(c => c.cellHandle === cellHandle);
                if (cell) {
                    cell.updateCellHeight(event.data.height);
                }
                break;
        }
    });
    window.addEventListener('wheel', handleWheel);

    (document.head as HTMLHeadElement & { originalAppendChild: typeof document.head.appendChild }).originalAppendChild = document.head.appendChild;
    (document.head as HTMLHeadElement & { originalAppendChild: typeof document.head.appendChild }).appendChild = function appendChild<T extends Node>(node: T): T {
        if (node instanceof HTMLScriptElement && node.src.includes('webviewuuid')) {
            node.src = node.src.replace('webviewuuid', location.hostname.split('.')[0]);
        }
        return this.originalAppendChild(node);
    };

    const focusChange = (event: FocusEvent, focus: boolean) => {
        if (event.target instanceof HTMLInputElement) {
            theia.postMessage({ type: 'inputFocusChanged', focused: focus } as webviewCommunication.InputFocusChange);
        }
    };

    window.addEventListener('focusin', (event: FocusEvent) => focusChange(event, true));

    window.addEventListener('focusout', (event: FocusEvent) => focusChange(event, false));

    theia.postMessage(<webviewCommunication.WebviewInitialized>{ type: 'initialized' });
}
