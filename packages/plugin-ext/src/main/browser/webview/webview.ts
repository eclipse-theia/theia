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
import { BaseWidget } from '@theia/core/lib/browser/widgets/widget';
import { IdGenerator } from '../../../common/id-generator';
import { MiniBrowser } from '@theia/mini-browser/lib/browser/mini-browser';
import { DisposableCollection } from '@theia/core';

export interface WebviewWidgetOptions {
    readonly allowScripts?: boolean;
}

export interface WebviewEvents {
    onMessage?(message: any): void;
}

export class WebviewWidget extends BaseWidget {
    private static readonly ID = new IdGenerator('webview-widget-');

    protected readonly toDispose = new DisposableCollection();
    private iframe: HTMLIFrameElement;
    private state: string | undefined = undefined;
    private loadTimeout: number | undefined;
    // private pendingMessages
    constructor(title: string, private options: WebviewWidgetOptions, private eventDelegate: WebviewEvents) {
        super();
        this.id = WebviewWidget.ID.nextId();
        this.title.closable = true;
        // this.title.caption = this.title.label = this.props.name || 'Browser';
        this.title.label = title;
        // this.title.iconClass = this.props.iconClass || MiniBrowser.ICON;
        this.addClass(MiniBrowser.Styles.MINI_BROWSER);

    }

    protected onFrameLoad(): void {
        // this.hideLoadIndicator();
        // this.focus();
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

    setHTML(html: string) {
        html = html.replace('theia-resource:/', '/webview/');
        html = html.replace('vscode-resource:/', '/webview/');
        const newDocument = new DOMParser().parseFromString(html, 'text/html');

        (<any>newDocument.querySelectorAll('a')).forEach((a: any) => {
            if (!a.title) {
                a.title = a.href;
            }
        });

        if (this.options.allowScripts) {
            const defaultScript = newDocument.createElement('script');
            defaultScript.textContent = `
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
                delete window.parent;
                delete window.top;
                delete window.frameElement;
            `;

            if (newDocument.head.hasChildNodes()) {
                newDocument.head.insertBefore(defaultScript, newDocument.head.firstChild);
            } else {
                newDocument.head.appendChild(defaultScript);
            }
        }

        const previousPendingFrame = this.iframe;
        if (previousPendingFrame) {
            previousPendingFrame.setAttribute('id', '');
            this.node.removeChild(previousPendingFrame);
        }

        const newFrame = document.createElement('iframe');
        newFrame.setAttribute('id', 'pending-frame');
        newFrame.setAttribute('frameborder', '0');
        newFrame.setAttribute('sandbox', this.options.allowScripts ? 'allow-scripts allow-forms allow-same-origin' : 'allow-same-origin');
        newFrame.style.cssText = 'display: block; margin: 0; overflow: hidden; position: absolute; width: 100%; height: 100%; visibility: hidden';
        this.node.appendChild(newFrame);
        this.iframe = newFrame;

        newFrame.contentDocument!.open('text/html', 'replace');

        const onLoad = (contentDocument: any, contentWindow: any) => {
            if (contentDocument.body) {
                // // Workaround for https://github.com/Microsoft/vscode/issues/12865
                // // check new scrollTop and reset if neccessary
                // setInitialScrollPosition(contentDocument.body);

                // // Bubble out link clicks
                // contentDocument.body.addEventListener('click', handleInnerClick);
            }

            // const newFrame = getPendingFrame();
            if (newFrame && newFrame.contentDocument === contentDocument) {
                // const oldActiveFrame = getActiveFrame();
                // if (oldActiveFrame) {
                //     document.body.removeChild(oldActiveFrame);
                // }
                (<any>contentWindow).postMessageExt = (e: any) => {
                    this.handleMessage(e);
                };
                // newFrame.setAttribute('id', 'active-frame');
                newFrame.style.visibility = 'visible';
                newFrame.contentWindow!.focus();

                // contentWindow.addEventListener('scroll', handleInnerScroll);

                // pendingMessages.forEach((data) => {
                //     contentWindow.postMessage(data, '*');
                // });
                // pendingMessages = [];
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
        });

        newFrame.contentDocument!.write('<!DOCTYPE html>');
        newFrame.contentDocument!.write(newDocument.documentElement.innerHTML);
        newFrame.contentDocument!.close();

    }
}

export namespace WebviewWidget {
    export namespace Styles {

        export const WEBVIEW_FRAME = 'theia-webview-iframe';

    }
}
