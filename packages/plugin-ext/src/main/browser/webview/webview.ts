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
import { BaseWidget, Message } from '@theia/core/lib/browser/widgets/widget';
import { IdGenerator } from '../../../common/id-generator';
import { Disposable, DisposableCollection } from '@theia/core';

// tslint:disable:no-any

export interface WebviewWidgetOptions {
    readonly allowScripts?: boolean;
}

export interface WebviewEvents {
    onMessage?(message: any): void;
    onKeyboardEvent?(e: KeyboardEvent): void;
    onLoad?(contentDocument: Document): void;
}

export class WebviewWidget extends BaseWidget {
    private static readonly ID = new IdGenerator('webview-widget-');
    protected readonly toDispose = new DisposableCollection();
    private iframe: HTMLIFrameElement;
    private state: { [key: string]: any } | undefined = undefined;
    private loadTimeout: number | undefined;

    constructor(title: string, private options: WebviewWidgetOptions, private eventDelegate: WebviewEvents) {
        super();
        this.node.tabIndex = 0;
        this.id = WebviewWidget.ID.nextId();
        this.title.closable = true;
        this.title.label = title;
        this.addClass(WebviewWidget.Styles.WEBVIEW);
    }

    protected handleMessage(message: any) {
        switch (message.command) {
            case 'onmessage':
                this.eventDelegate.onMessage!(message.data);
                break;
            case 'do-update-state':
                this.state = message.data;
        }
    }

    postMessage(message: any) {
        this.iframe.contentWindow!.postMessage(message, '*');
    }

    setOptions(options: WebviewWidgetOptions) {
        if (!this.iframe || this.options.allowScripts === options.allowScripts) {
            return;
        }
        this.updateSandboxAttribute(this.iframe, options.allowScripts);
        this.options = options;
        this.reloadFrame();
    }

    setIconClass(iconClass: string) {
        this.title.iconClass = iconClass;
    }

    setHTML(html: string) {
        const newDocument = new DOMParser().parseFromString(html, 'text/html');
        if (!newDocument || !newDocument.body) {
            return;
        }
        (<any>newDocument.querySelectorAll('a')).forEach((a: any) => {
            if (!a.title) {
                a.title = a.href;
            }
        });
        this.updateApiScript(newDocument);
        const previousPendingFrame = this.iframe;
        if (previousPendingFrame) {
            previousPendingFrame.setAttribute('id', '');
            this.node.removeChild(previousPendingFrame);
        }
        const newFrame = document.createElement('iframe');
        newFrame.setAttribute('id', 'pending-frame');
        newFrame.setAttribute('frameborder', '0');
        newFrame.style.cssText = 'display: block; margin: 0; overflow: hidden; position: absolute; width: 100%; height: 100%; visibility: hidden';
        this.node.appendChild(newFrame);
        this.iframe = newFrame;
        newFrame.contentDocument!.open('text/html', 'replace');

        const onLoad = (contentDocument: any, contentWindow: any) => {
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
            if (newFrame && newFrame.contentDocument === contentDocument) {
                (<any>contentWindow).postMessageExt = (e: any) => {
                    this.handleMessage(e);
                };
                newFrame.style.visibility = 'visible';
            }
        };

        clearTimeout(this.loadTimeout);
        this.loadTimeout = undefined;
        this.loadTimeout = window.setTimeout(() => {
            clearTimeout(this.loadTimeout);
            this.loadTimeout = undefined;
            onLoad(newFrame.contentDocument, newFrame.contentWindow);
        }, 200);

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
        this.node.focus();
    }

    private reloadFrame() {
        if (!this.iframe || !this.iframe.contentDocument || !this.iframe.contentDocument.documentElement) {
            return;
        }
        this.setHTML(this.iframe.contentDocument.documentElement.innerHTML);
    }

    private updateSandboxAttribute(element: HTMLElement, isAllowScript?: boolean) {
        if (!element) {
            return;
        }
        const allowScripts = isAllowScript !== undefined ? isAllowScript : this.options.allowScripts;
        element.setAttribute('sandbox', allowScripts ? 'allow-scripts allow-forms allow-same-origin' : 'allow-same-origin');
    }

    private updateApiScript(contentDocument: Document, isAllowScript?: boolean) {
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
}

export namespace WebviewWidget {
    export namespace Styles {

        export const WEBVIEW = 'theia-webview';

    }
}
