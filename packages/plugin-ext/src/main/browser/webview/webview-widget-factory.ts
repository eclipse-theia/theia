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

import { interfaces } from '@theia/core/shared/inversify';
import { WebviewWidget, WebviewWidgetIdentifier, WebviewWidgetExternalEndpoint } from './webview';
import { WebviewEnvironment } from './webview-environment';
import { StorageService } from '@theia/core/lib/browser';
import { v4 } from 'uuid';

export class WebviewWidgetFactory {

    readonly id = WebviewWidget.FACTORY_ID;

    protected readonly container: interfaces.Container;

    constructor(container: interfaces.Container) {
        this.container = container;
    }

    async createWidget(identifier: WebviewWidgetIdentifier): Promise<WebviewWidget> {
        const externalEndpoint = await this.container.get(WebviewEnvironment).externalEndpoint();
        let endpoint = externalEndpoint.replace('{{uuid}}', identifier.viewId ? await this.getOrigin(this.container.get(StorageService), identifier.viewId) : identifier.id);
        if (endpoint[endpoint.length - 1] === '/') {
            endpoint = endpoint.slice(0, endpoint.length - 1);
        }
        const child = this.container.createChild();
        child.bind(WebviewWidgetIdentifier).toConstantValue(identifier);
        child.bind(WebviewWidgetExternalEndpoint).toConstantValue(endpoint);
        return child.get(WebviewWidget);
    }

    protected async getOrigin(storageService: StorageService, viewId: string): Promise<string> {
        const key = 'plugin-view-registry.origin.' + viewId;
        const origin = await storageService.getData<string>(key);
        if (!origin) {
            const newOrigin = v4();
            storageService.setData(key, newOrigin);
            return newOrigin;
        } else {
            return origin;
        }
    }

}
