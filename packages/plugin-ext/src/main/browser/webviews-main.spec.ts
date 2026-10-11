// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// `webviews-main` transitively pulls in Lumino and several frontend modules that touch
// `document` and the frontend application config at module-load time.
const disableJSDOM = enableJSDOM();
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }
// xterm.js (pulled in transitively via the terminal package) calls HTMLCanvasElement.prototype.getContext
// at module-load time. JSDOM's default impl throws 'Not implemented' without the optional `canvas`
// package; replace it with a no-op so the module graph evaluates. The tests below never render a terminal.
const canvasProto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext?: unknown } } }).HTMLCanvasElement?.prototype;
if (canvasProto) {
    canvasProto.getContext = () => undefined;
}

import { expect } from 'chai';
import { WebviewsMainImpl } from './webviews-main';
import { WebviewWidget } from './webview/webview';

after(() => disableJSDOM());

interface FakeWebviewWidget {
    isDisposed: boolean;
    title: { label: string };
    html?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contentOptions?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iconUrl?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: any[];
}

function createWebviewWidget(): FakeWebviewWidget {
    const widget: FakeWebviewWidget = { isDisposed: false, title: { label: '' }, messages: [] };
    return Object.assign(widget, {
        setHTML: (value: string) => { widget.html = value; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setContentOptions: (options: any) => { widget.contentOptions = options; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setIconUrl: (iconUrl: any) => { widget.iconUrl = iconUrl; },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendMessage: (value: any) => { widget.messages.push(value); }
    });
}

/**
 * Bypasses the constructor's RPC/container wiring. The methods under test only resolve
 * the webview widget through the widget manager, so stubbing that is enough.
 */
function createWebviewsMain(widgets: Map<string, FakeWebviewWidget>): WebviewsMainImpl {
    const impl = Object.create(WebviewsMainImpl.prototype) as WebviewsMainImpl;
    (impl as unknown as Record<string, unknown>).widgetManager = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findWidget: async (factoryId: string, predicate: (options?: any) => boolean) => {
            if (factoryId !== WebviewWidget.FACTORY_ID) {
                return undefined;
            }
            for (const [id, widget] of widgets) {
                if (predicate({ id })) {
                    return widget;
                }
            }
            return undefined;
        },
        getWidget: async () => undefined
    };
    return impl;
}

describe('WebviewsMainImpl - late calls for a disposed webview', () => {

    const handle = 'webview-handle';
    let widgets: Map<string, FakeWebviewWidget>;
    let webviewsMain: WebviewsMainImpl;

    beforeEach(() => {
        widgets = new Map();
        webviewsMain = createWebviewsMain(widgets);
    });

    // The plugin host declares these methods as returning `void` and never attaches a rejection
    // handler, so throwing on an unknown handle would surface as an unhandled promise rejection.
    describe('with an unknown handle', () => {

        it('should not reject in $setHtml', async () => {
            await webviewsMain.$setHtml(handle, '<html></html>');
        });

        it('should not reject in $setOptions', async () => {
            await webviewsMain.$setOptions(handle, { enableScripts: true });
        });

        it('should not reject in $setTitle', async () => {
            await webviewsMain.$setTitle(handle, 'Title');
        });

        it('should not reject in $setIconPath', async () => {
            await webviewsMain.$setIconPath(handle, undefined);
        });

        it('should not reject in $reveal', async () => {
            await webviewsMain.$reveal(handle, {});
        });

        it('should resolve to false in $postMessage', async () => {
            expect(await webviewsMain.$postMessage(handle, 'message')).to.be.false;
        });
    });

    describe('with a known handle', () => {

        let widget: FakeWebviewWidget;

        beforeEach(() => {
            widget = createWebviewWidget();
            widgets.set(handle, widget);
        });

        it('should apply the html in $setHtml', async () => {
            await webviewsMain.$setHtml(handle, '<html></html>');
            expect(widget.html).to.equal('<html></html>');
        });

        it('should apply the content options in $setOptions', async () => {
            await webviewsMain.$setOptions(handle, { enableScripts: true, enableForms: false, enableCommandUris: ['a.command'] });
            expect(widget.contentOptions).to.deep.equal({
                allowScripts: true,
                allowForms: false,
                localResourceRoots: undefined,
                enableCommandUris: ['a.command']
            });
        });

        it('should apply the title in $setTitle', async () => {
            await webviewsMain.$setTitle(handle, 'Title');
            expect(widget.title.label).to.equal('Title');
        });

        it('should send the message in $postMessage', async () => {
            expect(await webviewsMain.$postMessage(handle, 'message')).to.be.true;
            expect(widget.messages).to.deep.equal(['message']);
        });
    });
});
