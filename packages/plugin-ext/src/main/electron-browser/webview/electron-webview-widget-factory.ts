// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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

import { WebviewWidgetFactory } from '../../browser/webview/webview-widget-factory';
import { WebviewWidgetIdentifier, WebviewWidget } from '../../browser/webview/webview';
import { CustomEditorWidgetFactory } from '../../browser/custom-editors/custom-editor-widget-factory';
import { CustomEditorWidget } from '../../browser/custom-editors/custom-editor-widget';
import '@theia/core/lib/electron-common/electron-api';

export class ElectronWebviewWidgetFactory extends WebviewWidgetFactory {

    override async createWidget(identifier: WebviewWidgetIdentifier): Promise<WebviewWidget> {
        const widget = await super.createWidget(identifier);
        await this.attachElectronSecurityCookie(widget.externalEndpoint);
        return widget;
    }

    /**
     * Attach the ElectronSecurityToken to a cookie that will be sent with each webview request.
     *
     * @param endpoint cookie's target url
     */
    protected attachElectronSecurityCookie(endpoint: string): Promise<void> {
        return window.electronTheiaCore.attachSecurityToken(endpoint);
    }

}

export class ElectronCustomEditorWidgetFactory extends CustomEditorWidgetFactory {

    override async createWidget(identifier: WebviewWidgetIdentifier): Promise<CustomEditorWidget> {
        const widget = await super.createWidget(identifier);
        await this.attachElectronSecurityCookie(widget.externalEndpoint);
        return widget;
    }

    /**
     * Attach the ElectronSecurityToken to a cookie that will be sent with each webview request.
     *
     * @param endpoint cookie's target url
     */
    protected async attachElectronSecurityCookie(endpoint: string): Promise<void> {
        return window.electronTheiaCore.attachSecurityToken(endpoint);
    }

}
