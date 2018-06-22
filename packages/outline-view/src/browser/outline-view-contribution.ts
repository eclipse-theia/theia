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

import { injectable } from "inversify";
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { OutlineViewWidget } from './outline-view-widget';
import { FrontendApplicationContribution, FrontendApplication } from "@theia/core/lib/browser/frontend-application";

export const OUTLINE_WIDGET_FACTORY_ID = 'outline-view';

@injectable()
export class OutlineViewContribution extends AbstractViewContribution<OutlineViewWidget> implements FrontendApplicationContribution {

    constructor() {
        super({
            widgetId: OUTLINE_WIDGET_FACTORY_ID,
            widgetName: 'Outline',
            defaultWidgetOptions: {
                area: 'right',
                rank: 500
            },
            toggleCommandId: 'outlineView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+o'
        });
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView();
    }
}
