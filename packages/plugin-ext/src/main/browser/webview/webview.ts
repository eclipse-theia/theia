/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject, postConstruct } from 'inversify';
import { ArrayExt } from '@phosphor/algorithm/lib/array';
import { WebviewPanelOptions, WebviewPortMapping, Uri } from '@theia/plugin';
import { BaseWidget, Message } from '@theia/core/lib/browser/widgets/widget';
import { Disposable } from '@theia/core/lib/common/disposable';
// TODO: get rid of dependencies to the mini browser
import { MiniBrowserContentStyle } from '@theia/mini-browser/lib/browser/mini-browser-content-style';
import { ApplicationShellMouseTracker } from '@theia/core/lib/browser/shell/application-shell-mouse-tracker';
import { StatefulWidget } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { WebviewPanelViewState } from '../../../common/plugin-api-rpc';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WebviewEnvironment } from './webview-environment';
import URI from '@theia/core/lib/common/uri';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';

// tslint:disable:no-any

export const enum WebviewMessageChannels {
    loadResource = 'load-resource',
    webviewReady = 'webview-ready'
}

export interface WebviewContentOptions {
    readonly allowScripts?: boolean;
    readonly localResourceRoots?: ReadonlyArray<Uri>;
    readonly portMapping?: ReadonlyArray<WebviewPortMapping>;
    readonly enableCommandUris?: boolean;
}

export interface WebviewEvents {
    onMessage?(message: any): void;
    onKeyboardEvent?(e: KeyboardEvent): void;
    onLoad?(contentDocument: Document): void;
}

@injectable()
export class WebviewWidgetIdentifier {
    id: string;
}

export const WebviewWidgetExternalEndpoint = Symbol('WebviewWidgetExternalEndpoint');

@injectable()
export class WebviewWidget extends BaseWidget implements StatefulWidget {

    static FACTORY_ID = 'plugin-webview';

    protected element: HTMLIFrameElement;

    // tslint:disable-next-line:max-line-length
    // XXX This is a hack to be able to tack the mouse events when drag and dropping the widgets.
    // On `mousedown` we put a transparent div over the `iframe` to avoid losing the mouse tacking.
    protected transparentOverlay: HTMLElement;

    @inject(WebviewWidgetIdentifier)
    readonly identifier: WebviewWidgetIdentifier;

    @inject(WebviewWidgetExternalEndpoint)
    readonly externalEndpoint: string;

    @inject(ApplicationShellMouseTracker)
    protected readonly mouseTracker: ApplicationShellMouseTracker;

    @inject(WebviewEnvironment)
    protected readonly environment: WebviewEnvironment;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    viewState: WebviewPanelViewState = {
        visible: false,
        active: false,
        position: 0
    };

    protected html = '';
    protected contentOptions: WebviewContentOptions = {};
    state: any;

    viewType: string;
    options: WebviewPanelOptions = {};
    eventDelegate: WebviewEvents = {};

    protected readonly ready = new Deferred<void>();

    @postConstruct()
    protected init(): void {
        this.node.tabIndex = 0;
        this.id = WebviewWidget.FACTORY_ID + ':' + this.identifier.id;
        this.title.closable = true;
        this.addClass(WebviewWidget.Styles.WEBVIEW);

        this.transparentOverlay = document.createElement('div');
        this.transparentOverlay.classList.add(MiniBrowserContentStyle.TRANSPARENT_OVERLAY);
        this.transparentOverlay.style.display = 'none';
        this.node.appendChild(this.transparentOverlay);

        this.toDispose.push(this.mouseTracker.onMousedown(() => {
            if (this.element.style.display !== 'none') {
                this.transparentOverlay.style.display = 'block';
            }
        }));
        this.toDispose.push(this.mouseTracker.onMouseup(() => {
            if (this.element.style.display !== 'none') {
                this.transparentOverlay.style.display = 'none';
            }
        }));

        const element = document.createElement('iframe');
        element.className = 'webview';
        element.sandbox.add('allow-scripts', 'allow-same-origin');
        element.setAttribute('src', `${this.externalEndpoint}/index.html?id=${this.identifier.id}`);
        element.style.border = 'none';
        element.style.width = '100%';
        element.style.height = '100%';
        this.element = element;
        this.node.appendChild(this.element);

        const subscription = this.on(WebviewMessageChannels.webviewReady, () => {
            subscription.dispose();
            this.ready.resolve();
        });
        this.toDispose.push(subscription);
        this.toDispose.push(this.on(WebviewMessageChannels.loadResource, (entry: any) => {
            const rawPath = entry.path;
            const normalizedPath = decodeURIComponent(rawPath);
            const uri = new URI(normalizedPath.replace(/^\/(\w+)\/(.+)$/, (_, scheme, path) => scheme + ':/' + path));
            this.loadResource(rawPath, uri);
        }));
    }

    setContentOptions(contentOptions: WebviewContentOptions): void {
        if (WebviewWidget.compareWebviewContentOptions(this.contentOptions, contentOptions)) {
            return;
        }
        this.contentOptions = contentOptions;
        this.doUpdateContent();
    }

    setIconClass(iconClass: string): void {
        this.title.iconClass = iconClass;
    }

    setHTML(value: string): void {
        this.html = this.preprocessHtml(value);
        this.doUpdateContent();
    }

    protected preprocessHtml(value: string): string {
        return value
            .replace(/(["'])theia-resource:(\/\/([^\s\/'"]+?)(?=\/))?([^\s'"]+?)(["'])/gi, (_, startQuote, _1, scheme, path, endQuote) => {
                if (scheme) {
                    return `${startQuote}${this.externalEndpoint}/theia-resource/${scheme}${path}${endQuote}`;
                }
                return `${startQuote}${this.externalEndpoint}/theia-resource/file${path}${endQuote}`;
            });
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.focus();
    }

    focus(): void {
        if (this.element) {
            this.doSend('focus');
        }
    }

    reload(): void {
        this.doUpdateContent();
    }

    protected async loadResource(requestPath: string, uri: URI): Promise<void> {
        try {
            const normalizedUri = this.normalizeRequestUri(uri);

            if (this.contentOptions.localResourceRoots) {
                for (const root of this.contentOptions.localResourceRoots) {
                    if (!new URI(root).path.isEqualOrParent(normalizedUri.path)) {
                        continue;
                    }
                    const { content } = await this.fileSystem.resolveContent(normalizedUri.toString());
                    return this.doSend('did-load-resource', {
                        status: 200,
                        path: requestPath,
                        mime: 'text/plain', // TODO detect mimeType from URI extension
                        data: content
                    });
                }
            }
        } catch {
            // no-op
        }

        return this.doSend('did-load-resource', {
            status: 404,
            path: requestPath
        });
    }

    protected normalizeRequestUri(requestUri: URI): URI {
        if (requestUri.scheme !== 'theia-resource') {
            return requestUri;
        }

        // Modern vscode-resources uris put the scheme of the requested resource as the authority
        if (requestUri.authority) {
            return new URI(requestUri.authority + ':' + requestUri.path);
        }

        // Old style vscode-resource uris lose the scheme of the resource which means they are unable to
        // load a mix of local and remote content properly.
        return requestUri.withScheme('file');
    }

    sendMessage(data: any): void {
        this.doSend('message', data);
    }

    protected doUpdateContent(): void {
        this.doSend('content', {
            contents: this.html,
            options: this.contentOptions,
            state: this.state
        });
    }

    storeState(): WebviewWidget.State {
        return {
            viewType: this.viewType,
            title: this.title.label,
            options: this.options,
            contentOptions: this.contentOptions,
            state: this.state
        };
    }

    restoreState(oldState: WebviewWidget.State): void {
        const { viewType, title, options, contentOptions, state } = oldState;
        this.viewType = viewType;
        this.title.label = title;
        this.options = options;
        this.contentOptions = contentOptions;
        this.state = state;
    }

    protected async doSend(channel: string, data?: any): Promise<void> {
        try {
            await this.ready.promise;
            this.postMessage(channel, data);
        } catch (e) {
            console.error(e);
        }
    }

    protected postMessage(channel: string, data?: any): void {
        if (this.element) {
            this.element.contentWindow!.postMessage({ channel, args: data }, '*');
        }
    }

    protected on<T = unknown>(channel: WebviewMessageChannels, handler: (data: T) => void): Disposable {
        const listener = (e: any) => {
            if (!e || !e.data || e.data.target !== this.identifier.id) {
                return;
            }
            if (e.data.channel === channel) {
                handler(e.data.data);
            }
        };
        window.addEventListener('message', listener);
        return Disposable.create(() =>
            window.removeEventListener('message', listener)
        );
    }

}
export namespace WebviewWidget {
    export namespace Styles {
        export const WEBVIEW = 'theia-webview';
    }
    export interface State {
        viewType: string
        title: string
        options: WebviewPanelOptions
        // TODO serialize/revive URIs
        contentOptions: WebviewContentOptions
        state: any
        // TODO: preserve icon class
    }
    export function compareWebviewContentOptions(a: WebviewContentOptions, b: WebviewContentOptions): boolean {
        return a.enableCommandUris === b.enableCommandUris
            && a.allowScripts === b.allowScripts &&
            ArrayExt.shallowEqual(a.localResourceRoots || [], b.localResourceRoots || [], (uri, uri2) => uri.toString() === uri2.toString()) &&
            ArrayExt.shallowEqual(a.portMapping || [], b.portMapping || [], (m, m2) =>
                m.extensionHostPort === m2.extensionHostPort && m.webviewPort === m2.webviewPort
            );
    }
}
