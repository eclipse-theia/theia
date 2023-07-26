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

declare const acquireVsCodeApi: () => ({
    getState(): { [key: string]: unknown };
    setState(data: { [key: string]: unknown }): void;
    postMessage: (msg: unknown) => void;
});

declare function __import(path: string): Promise<unknown>;

interface RendererContext extends rendererApi.RendererContext<unknown> {
    readonly onDidChangeSettings: unknown; // Event<RenderOptions>;
    readonly settings: RenderOptions;
}

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

    interface NotebookRendererEntrypoint {
        readonly path: string;
        readonly extends?: string
    };

    class Renderer {

        entrypoint: NotebookRendererEntrypoint;

        private rendererApi?: rendererApi.RendererApi;

        constructor(
            public readonly data: webviewCommunication.RendererMetadata
        ) {
        }

        // matchesMimeTypeOnly(mimeType: string): boolean {
        //     if (this.entrypoint.extends) { // We're extending another renderer
        //         return false;
        //     }

        //     return this.mimeTypeGlobs.some(pattern => pattern(mimeType)) || this.mimeTypes.some(pattern => pattern === mimeType);
        // }

        async getOrLoad(): Promise<rendererApi.RendererApi | undefined> {
            if (this.rendererApi) {
                return this.rendererApi;
            }

            const rendererModule = await __import(this.data.entrypoint.uri) as { activate: rendererApi.ActivationFunction };
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
                get onDidChangeSettings(): () => unknown { return () => undefined; }
            };

            if (this.data.requiresMessaging) {
                // context.onDidReceiveMessage = this.onMessageEvent.event;
                // context.postMessage = message => postNotebookMessage('customRendererMessage', { rendererId: this.data.id, message });
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

        // public clearAll() {
        //     outputRunner.cancelAll();
        //     for (const renderer of this.renderers.values()) {
        //         renderer.disposeOutputItem();
        //     }
        // }

        // public clearOutput(rendererId: string, outputId: string) {
        //     outputRunner.cancelOutput(outputId);
        //     this.renderers.get(rendererId)?.disposeOutputItem(outputId);
        // }

        public async render(item: rendererApi.OutputItem, allOutputItems: rendererApi.OutputItem[],
            preferredRendererId: string | undefined, element: HTMLElement, signal: AbortSignal): Promise<void> {
            const primaryRenderer = this.findRenderer(preferredRendererId, item);
            if (!primaryRenderer) {
                this.showRenderError(item, element, 'No renderer found for output type.');
                return;
            }

            // Try primary renderer first
            if (!(await this.doRender(item, element, primaryRenderer, signal)).continue) {
                theia.postMessage(<webviewCommunication.OnDidRenderOutput>{ type: 'didRenderOutput', contentHeight: document.body.clientHeight });
                return;
            }

            // Primary renderer failed in an expected way. Fallback to render the next mime types
            for (const additionalItem of allOutputItems) {
                if (additionalItem.mime === item.mime) {
                    continue;
                }

                if (signal.aborted) {
                    return;
                }

                if (additionalItem) {
                    const renderer = this.findRenderer(undefined, additionalItem);
                    if (renderer) {
                        if (!(await this.doRender(additionalItem, element, renderer, signal)).continue) {
                            theia.postMessage(<webviewCommunication.OnDidRenderOutput>{ type: 'didRenderOutput', contentHeight: document.body.clientHeight });
                            return; // We rendered successfully
                        }
                    }
                }
            }

            // All renderers have failed and there is nothing left to fallback to
            this.showRenderError(item, element, 'No fallback renderers found or all fallback renderers failed.');
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

    function outputChanged(changedEvent: webviewCommunication.OutputChangedMessage): void {
        for (const outputId of changedEvent.deletedOutputIds ?? []) {
            const element = document.getElementById(outputId);
            if (element) {
                element.remove();
            }
        }

        for (const output of changedEvent.newOutputs ?? []) {
            const apiItems: rendererApi.OutputItem[] = output.items.map((item, index) => ({
                id: `${output.id}-${index}`,
                mime: item.mime,
                metadata: output.metadata,
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

            const element = document.createElement('div');
            element.id = output.id;
            document.body.appendChild(element);

            renderers.render(apiItems[0], apiItems, undefined, element, new AbortController().signal);
        }
    }

    window.addEventListener('message', async rawEvent => {
        const event = rawEvent as ({ data: webviewCommunication.ToWebviewMessage });

        switch (event.data.type) {
            case 'updateRenderers':
                renderers.updateRendererData(event.data.rendererData);
                break;
            case 'outputChanged':
                outputChanged(event.data);
                break;
            case 'customRendererMessage':
                break;
        }
    });

    theia.postMessage(<webviewCommunication.WebviewInitialized>{ type: 'initialized' });
}
