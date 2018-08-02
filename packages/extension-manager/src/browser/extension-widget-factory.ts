/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { WidgetFactory, FrontendApplication } from '@theia/core/lib/browser';
import { ExtensionManager } from '../common';
import { ExtensionUri } from './extension-uri';
import { ExtensionDetailWidget } from './extension-detail-widget';

export class ExtensionWidgetOptions {
    readonly name: string;
}

@injectable()
export class ExtensionWidgetFactory implements WidgetFactory {

    readonly id = ExtensionUri.scheme;

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(ExtensionManager) protected readonly extensionManager: ExtensionManager
    ) { }

    async createWidget(options: ExtensionWidgetOptions): Promise<ExtensionDetailWidget> {
        const extension = await this.extensionManager.resolve(options.name);
        const widget = new ExtensionDetailWidget(extension);
        widget.id = 'extension:' + options.name;
        widget.title.closable = true;
        widget.title.label = options.name;
        widget.title.iconClass = 'fa fa-puzzle-piece';
        return widget;
    }

}
