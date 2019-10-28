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
import { BaseWidget, Message } from '@theia/core/lib/browser/widgets/widget';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
// TODO: get rid of dependencies to the mini browser
import { MiniBrowserContentStyle } from '@theia/mini-browser/lib/browser/mini-browser-content-style';
import { ApplicationShellMouseTracker } from '@theia/core/lib/browser/shell/application-shell-mouse-tracker';

// tslint:disable:no-any

export interface WebviewWidgetOptions {
    readonly allowScripts?: boolean;
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

@injectable()
export class WebviewWidget extends BaseWidget {

    static FACTORY_ID = 'plugin-webview';

    private iframe: HTMLIFrameElement;
    private state: { [key: string]: any } | undefined = undefined;
    private loadTimeout: number | undefined;
    private scrollY: number;
    private readyToReceiveMessage: boolean = false;
    // tslint:disable-next-line:max-line-length
    // XXX This is a hack to be able to tack the mouse events when drag and dropping the widgets. On `mousedown` we put a transparent div over the `iframe` to avoid losing the mouse tacking.
    protected readonly transparentOverlay: HTMLElement;

    @inject(WebviewWidgetIdentifier)
    protected readonly identifier: WebviewWidgetIdentifier;

    @inject(ApplicationShellMouseTracker)
    protected readonly mouseTracker: ApplicationShellMouseTracker;

    private options: WebviewWidgetOptions = {};
    eventDelegate: WebviewEvents = {};

    constructor() {
        super();
        this.node.tabIndex = 0;
        this.title.closable = true;
        this.addClass(WebviewWidget.Styles.WEBVIEW);
        this.scrollY = 0;

        this.transparentOverlay = document.createElement('div');
        this.transparentOverlay.classList.add(MiniBrowserContentStyle.TRANSPARENT_OVERLAY);
        this.transparentOverlay.style.display = 'none';
        this.node.appendChild(this.transparentOverlay);

        this.toDispose.push(this.mouseTracker.onMousedown(() => {
            if (this.iframe.style.display !== 'none') {
                this.transparentOverlay.style.display = 'block';
            }
        }));
        this.toDispose.push(this.mouseTracker.onMouseup(() => {
            if (this.iframe.style.display !== 'none') {
                this.transparentOverlay.style.display = 'none';
            }
        }));
    }

    @postConstruct()
    protected init(): void {
        this.id = WebviewWidget.FACTORY_ID + ':' + this.identifier.id;
    }

    protected handleMessage(message: any): void {
        switch (message.command) {
            case 'onmessage':
                this.eventDelegate.onMessage!(message.data);
                break;
            case 'do-update-state':
                this.state = message.data;
        }
    }

    async postMessage(message: any): Promise<void> {
        // wait message can be delivered
        await this.waitReadyToReceiveMessage();
        this.iframe.contentWindow!.postMessage(message, '*');
    }

    setOptions(options: WebviewWidgetOptions): void {
        if (this.options.allowScripts === options.allowScripts) {
            return;
        }
        this.options = options;
        if (!this.iframe) {
            return;
        }
        this.updateSandboxAttribute(this.iframe, options.allowScripts);
        this.reloadFrame();
    }

    setIconClass(iconClass: string): void {
        this.title.iconClass = iconClass;
    }

    protected readonly toDisposeOnHTML = new DisposableCollection();

    setHTML(html: string): void {
        const newDocument = new DOMParser().parseFromString(html, 'text/html');
        if (!newDocument || !newDocument.body) {
            return;
        }

        this.toDisposeOnHTML.dispose();
        this.toDispose.push(this.toDisposeOnHTML);

        (<any>newDocument.querySelectorAll('a')).forEach((a: any) => {
            if (!a.title) {
                a.title = a.href;
            }
        });

        (window as any)[`postMessageExt${this.id}`] = (e: any) => {
            this.handleMessage(e);
        };
        this.toDisposeOnHTML.push(Disposable.create(() =>
            delete (window as any)[`postMessageExt${this.id}`]
        ));
        this.updateApiScript(newDocument);

        const newFrame = document.createElement('iframe');
        newFrame.setAttribute('id', 'pending-frame');
        newFrame.setAttribute('frameborder', '0');
        newFrame.style.cssText = 'display: block; margin: 0; overflow: hidden; position: absolute; width: 100%; height: 100%; visibility: hidden';
        this.node.appendChild(newFrame);
        this.iframe = newFrame;
        this.toDisposeOnHTML.push(Disposable.create(() => {
            newFrame.setAttribute('id', '');
            this.node.removeChild(newFrame);
        }));

        newFrame.contentDocument!.open('text/html', 'replace');

        const onLoad = (contentDocument: any, contentWindow: any) => {
            if (newFrame && newFrame.contentDocument === contentDocument) {
                newFrame.style.visibility = 'visible';
            }
            if (contentDocument.body) {
                if (this.eventDelegate && this.eventDelegate.onKeyboardEvent) {
                    const eventNames = ['keydown', 'keypress', 'click'];
                    // Delegate events from the `iframe` to the application.
                    eventNames.forEach((eventName: string) => {
                        contentDocument.addEventListener(eventName, this.eventDelegate.onKeyboardEvent!, true);
                        this.toDispose.push(Disposable.create(() => contentDocument.removeEventListener(eventName, this.eventDelegate.onKeyboardEvent!)));
                    });
                }
                if (this.eventDelegate && this.eventDelegate.onLoad) {
                    this.eventDelegate.onLoad(<Document>contentDocument);
                }
            }
        };

        this.loadTimeout = window.setTimeout(() => {
            clearTimeout(this.loadTimeout);
            this.loadTimeout = undefined;
            onLoad(newFrame.contentDocument, newFrame.contentWindow);
        }, 200);
        this.toDisposeOnHTML.push(Disposable.create(() => {
            if (typeof this.loadTimeout === 'number') {
                clearTimeout(this.loadTimeout);
                this.loadTimeout = undefined;
            }
        }));

        newFrame.contentWindow!.addEventListener('load', e => {
            if (this.loadTimeout) {
                clearTimeout(this.loadTimeout);
                this.loadTimeout = undefined;
                onLoad(e.target, newFrame.contentWindow);
            }
        }, { once: true });
        newFrame.contentDocument!.write(newDocument!.documentElement!.innerHTML);
        newFrame.contentDocument!.close();

        this.updateSandboxAttribute(newFrame);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        // restore scrolling if there was one
        if (this.scrollY > 0) {
            this.iframe.contentWindow!.scrollTo({ top: this.scrollY });
        }
        this.node.focus();
        // unblock messages
        this.readyToReceiveMessage = true;
    }

    // block messages
    protected onBeforeShow(msg: Message): void {
        this.readyToReceiveMessage = false;
    }

    protected onBeforeHide(msg: Message): void {
        // persist scrolling
        if (this.iframe.contentWindow) {
            this.scrollY = this.iframe.contentWindow.scrollY;
        }
        super.onBeforeHide(msg);
    }

    public reloadFrame(): void {
        if (!this.iframe || !this.iframe.contentDocument || !this.iframe.contentDocument.documentElement) {
            return;
        }
        this.setHTML(this.iframe.contentDocument.documentElement.innerHTML);
    }

    private updateSandboxAttribute(element: HTMLElement, isAllowScript?: boolean): void {
        if (!element) {
            return;
        }
        const allowScripts = isAllowScript !== undefined ? isAllowScript : this.options.allowScripts;
        element.setAttribute('sandbox', allowScripts ? 'allow-scripts allow-forms allow-same-origin' : 'allow-same-origin');
    }

    private updateApiScript(contentDocument: Document, isAllowScript?: boolean): void {
        if (!contentDocument) {
            return;
        }
        const allowScripts = isAllowScript !== undefined ? isAllowScript : this.options.allowScripts;
        const scriptId = 'webview-widget-codeApi';
        if (!allowScripts) {
            const script = contentDocument.getElementById(scriptId);
            if (!script) {
                return;
            }
            script!.parentElement!.removeChild(script!);
            return;
        }

        const codeApiScript = contentDocument.createElement('script');
        codeApiScript.id = scriptId;
        codeApiScript.textContent = `
        window.postMessageExt = window.parent['postMessageExt${this.id}'];
        const acquireVsCodeApi = (function() {
                let acquired = false;
                let state = ${this.state ? `JSON.parse(${JSON.stringify(this.state)})` : undefined};
                return () => {
                    if (acquired) {
                        throw new Error('An instance of the VS Code API has already been acquired');
                    }
                    acquired = true;
                    return Object.freeze({
                        postMessage: function(msg) {
                            return window.postMessageExt({ command: 'onmessage', data: msg }, '*');
                        },
                        setState: function(newState) {
                            state = newState;
                            window.postMessageExt({ command: 'do-update-state', data: JSON.stringify(newState) }, '*');
                            return newState;
                        },
                        getState: function() {
                            return state;
                        }
                    });
                };
            })();
            const acquireTheiaApi = (function() {
                let acquired = false;
                let state = ${this.state ? `JSON.parse(${JSON.stringify(this.state)})` : undefined};
                return () => {
                    if (acquired) {
                        throw new Error('An instance of the VS Code API has already been acquired');
                    }
                    acquired = true;
                    return Object.freeze({
                        postMessage: function(msg) {
                            return window.postMessageExt({ command: 'onmessage', data: msg }, '*');
                        },
                        setState: function(newState) {
                            state = newState;
                            window.postMessageExt({ command: 'do-update-state', data: JSON.stringify(newState) }, '*');
                            return newState;
                        },
                        getState: function() {
                            return state;
                        }
                    });
                };
            })();
            delete window.parent;
            delete window.top;
            delete window.frameElement;
         `;
        const parent = contentDocument.head ? contentDocument.head : contentDocument.body;
        if (parent.hasChildNodes()) {
            parent.insertBefore(codeApiScript, parent.firstChild);
        } else {
            parent.appendChild(codeApiScript);
        }
    }

    /**
     * Check if given object is ready to receive message and if it is ready, resolve promise
     */
    waitReceiveMessage(object: WebviewWidget, resolve: any): void {
        if (object.readyToReceiveMessage) {
            resolve(true);
        } else {
            setTimeout(this.waitReceiveMessage, 100, object, resolve);
        }
    }

    /**
     * Block until we're able to receive message
     */
    public async waitReadyToReceiveMessage(): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            this.waitReceiveMessage(this, resolve);
        });
    }
}

export namespace WebviewWidget {
    export namespace Styles {

        export const WEBVIEW = 'theia-webview';

    }
}
