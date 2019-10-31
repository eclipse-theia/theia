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
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/vscode/blob/ba40bd16433d5a817bfae15f3b4350e18f144af4/src/vs/workbench/contrib/webview/browser/baseWebviewElement.ts
// copied and modified from https://github.com/microsoft/vscode/blob/ba40bd16433d5a817bfae15f3b4350e18f144af4/src/vs/workbench/contrib/webview/browser/webviewElement.ts#

import * as mime from 'mime';
import { JSONExt } from '@phosphor/coreutils/lib/json';
import { injectable, inject, postConstruct } from 'inversify';
import { WebviewPanelOptions, WebviewPortMapping } from '@theia/plugin';
import { BaseWidget, Message } from '@theia/core/lib/browser/widgets/widget';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
// TODO: get rid of dependencies to the mini browser
import { MiniBrowserContentStyle } from '@theia/mini-browser/lib/browser/mini-browser-content-style';
import { ApplicationShellMouseTracker } from '@theia/core/lib/browser/shell/application-shell-mouse-tracker';
import { StatefulWidget } from '@theia/core/lib/browser/shell/shell-layout-restorer';
import { WebviewPanelViewState } from '../../../common/plugin-api-rpc';
import { IconUrl } from '../../../common/plugin-protocol';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { WebviewEnvironment } from './webview-environment';
import URI from '@theia/core/lib/common/uri';
import { FileSystem } from '@theia/filesystem/lib/common/filesystem';
import { Emitter } from '@theia/core/lib/common/event';
import { open, OpenerService } from '@theia/core/lib/browser/opener-service';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { Schemes } from '../../../common/uri-components';
import { PluginSharedStyle } from '../plugin-shared-style';
import { BuiltinThemeProvider } from '@theia/core/lib/browser/theming';
import { WebviewThemeDataProvider } from './webview-theme-data-provider';

// tslint:disable:no-any

export const enum WebviewMessageChannels {
    onmessage = 'onmessage',
    didClickLink = 'did-click-link',
    didFocus = 'did-focus',
    didBlur = 'did-blur',
    doUpdateState = 'do-update-state',
    doReload = 'do-reload',
    loadResource = 'load-resource',
    webviewReady = 'webview-ready',
    didKeydown = 'did-keydown'
}

export interface WebviewContentOptions {
    readonly allowScripts?: boolean;
    readonly localResourceRoots?: ReadonlyArray<string>;
    readonly portMapping?: ReadonlyArray<WebviewPortMapping>;
    readonly enableCommandUris?: boolean;
}

@injectable()
export class WebviewWidgetIdentifier {
    id: string;
}

export const WebviewWidgetExternalEndpoint = Symbol('WebviewWidgetExternalEndpoint');

@injectable()
export class WebviewWidget extends BaseWidget implements StatefulWidget {

    private static readonly standardSupportedLinkSchemes = new Set([
        Schemes.HTTP,
        Schemes.HTTPS,
        Schemes.MAILTO,
        Schemes.VSCODE
    ]);

    static FACTORY_ID = 'plugin-webview';

    protected element: HTMLIFrameElement | undefined;

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

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    @inject(PluginSharedStyle)
    protected readonly sharedStyle: PluginSharedStyle;

    @inject(WebviewThemeDataProvider)
    protected readonly themeDataProvider: WebviewThemeDataProvider;

    viewState: WebviewPanelViewState = {
        visible: false,
        active: false,
        position: 0
    };

    protected html = '';

    protected _contentOptions: WebviewContentOptions = {};
    get contentOptions(): WebviewContentOptions {
        return this._contentOptions;
    }

    protected _state: string | undefined;
    get state(): string | undefined {
        return this._state;
    }

    viewType: string;
    options: WebviewPanelOptions = {};

    protected readonly ready = new Deferred<void>();

    protected readonly onMessageEmitter = new Emitter<any>();
    readonly onMessage = this.onMessageEmitter.event;

    @postConstruct()
    protected init(): void {
        this.node.tabIndex = 0;
        this.id = WebviewWidget.FACTORY_ID + ':' + this.identifier.id;
        this.title.closable = true;
        this.addClass(WebviewWidget.Styles.WEBVIEW);

        this.toDispose.push(this.onMessageEmitter);

        this.transparentOverlay = document.createElement('div');
        this.transparentOverlay.classList.add(MiniBrowserContentStyle.TRANSPARENT_OVERLAY);
        this.transparentOverlay.style.display = 'none';
        this.node.appendChild(this.transparentOverlay);

        this.toDispose.push(this.mouseTracker.onMousedown(() => {
            if (this.element && this.element.style.display !== 'none') {
                this.transparentOverlay.style.display = 'block';
            }
        }));
        this.toDispose.push(this.mouseTracker.onMouseup(() => {
            if (this.element && this.element.style.display !== 'none') {
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
        this.toDispose.push(Disposable.create(() => {
            if (this.element) {
                this.element.remove();
                this.element = undefined;
            }
        }));

        const subscription = this.on(WebviewMessageChannels.webviewReady, () => {
            subscription.dispose();
            this.ready.resolve();
        });
        this.toDispose.push(subscription);
        this.toDispose.push(this.on(WebviewMessageChannels.onmessage, (data: any) => this.onMessageEmitter.fire(data)));
        this.toDispose.push(this.on(WebviewMessageChannels.didClickLink, (uri: string) => this.openLink(new URI(uri))));
        this.toDispose.push(this.on(WebviewMessageChannels.doUpdateState, (state: any) => {
            this._state = state;
        }));
        this.toDispose.push(this.on(WebviewMessageChannels.didFocus, () =>
            // emulate the webview focus without actually changing focus
            this.node.dispatchEvent(new FocusEvent('focus'))
        ));
        this.toDispose.push(this.on(WebviewMessageChannels.didBlur, () => {
            /* no-op: webview loses focus only if another element gains focus in the main window */
        }));
        this.toDispose.push(this.on(WebviewMessageChannels.doReload, () => this.reload()));
        this.toDispose.push(this.on(WebviewMessageChannels.loadResource, (entry: any) => {
            const rawPath = entry.path;
            const normalizedPath = decodeURIComponent(rawPath);
            const uri = new URI(normalizedPath.replace(/^\/(\w+)\/(.+)$/, (_, scheme, path) => scheme + ':/' + path));
            this.loadResource(rawPath, uri);
        }));
        this.toDispose.push(this.on(WebviewMessageChannels.didKeydown, (data: KeyboardEvent) => {
            // Electron: workaround for https://github.com/electron/electron/issues/14258
            // We have to detect keyboard events in the <webview> and dispatch them to our
            // keybinding service because these events do not bubble to the parent window anymore.
            this.dispatchKeyDown(data);
        }));

        this.style();
        this.toDispose.push(this.themeDataProvider.onDidChangeThemeData(() => this.style()));
    }

    setContentOptions(contentOptions: WebviewContentOptions): void {
        if (JSONExt.deepEqual(<any>this.contentOptions, <any>contentOptions)) {
            return;
        }
        this._contentOptions = contentOptions;
        this.doUpdateContent();
    }

    protected iconUrl: IconUrl | undefined;
    protected readonly toDisposeOnIcon = new DisposableCollection();
    setIconUrl(iconUrl: IconUrl | undefined): void {
        if ((this.iconUrl && iconUrl && JSONExt.deepEqual(this.iconUrl, iconUrl)) || (this.iconUrl === iconUrl)) {
            return;
        }
        this.toDisposeOnIcon.dispose();
        this.toDispose.push(this.toDisposeOnIcon);
        this.iconUrl = iconUrl;
        if (iconUrl) {
            const darkIconUrl = typeof iconUrl === 'object' ? iconUrl.dark : iconUrl;
            const lightIconUrl = typeof iconUrl === 'object' ? iconUrl.light : iconUrl;
            const iconClass = `webview-${this.identifier.id}-file-icon`;
            this.toDisposeOnIcon.push(this.sharedStyle.insertRule(
                `.theia-webview-icon.${iconClass}::before`,
                theme => `background-image: url(${theme.id === BuiltinThemeProvider.lightTheme.id ? lightIconUrl : darkIconUrl});`
            ));
            this.title.iconClass = `theia-webview-icon ${iconClass}`;
        } else {
            this.title.iconClass = '';
        }
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
        this.node.focus();
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

    protected style(): void {
        const { styles, activeTheme } = this.themeDataProvider.getThemeData();
        this.doSend('styles', { styles, activeTheme });
    }

    protected dispatchKeyDown(event: KeyboardEventInit): void {
        // Create a fake KeyboardEvent from the data provided
        const emulatedKeyboardEvent = new KeyboardEvent('keydown', event);
        // Force override the target
        Object.defineProperty(emulatedKeyboardEvent, 'target', {
            get: () => this.element,
        });
        // And re-dispatch
        this.keybindings.run(emulatedKeyboardEvent);
    }

    protected openLink(link: URI): void {
        if (this.isSupportedLink(link)) {
            open(this.openerService, link);
        }
    }

    protected isSupportedLink(link: URI): boolean {
        if (WebviewWidget.standardSupportedLinkSchemes.has(link.scheme)) {
            return true;
        }
        return !!this.contentOptions.enableCommandUris && link.scheme === Schemes.COMMAND;
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
                        mime: mime.getType(normalizedUri.path.toString()) || 'application/octet-stream',
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
            iconUrl: this.iconUrl,
            options: this.options,
            contentOptions: this.contentOptions,
            state: this.state
        };
    }

    restoreState(oldState: WebviewWidget.State): void {
        const { viewType, title, iconUrl, options, contentOptions, state } = oldState;
        this.viewType = viewType;
        this.title.label = title;
        this.setIconUrl(iconUrl);
        this.options = options;
        this._contentOptions = contentOptions;
        this._state = state;
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
        iconUrl?: IconUrl
        options: WebviewPanelOptions
        contentOptions: WebviewContentOptions
        state?: string
    }
}
