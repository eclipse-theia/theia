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

import {
    FrontendApplicationContribution,
    AbstractViewContribution
} from '@theia/core/lib/browser';
import { injectable } from 'inversify';
import { DebugExplorerWidget } from './debug-explorer-widget';

export const DEBUG_EXPLORER_WIDGET_FACTORY_ID = 'debug-explorer';

@injectable()
export class DebugExplorerViewContribution extends AbstractViewContribution<DebugExplorerWidget> implements FrontendApplicationContribution {
    constructor() {
        super({
            widgetId: DEBUG_EXPLORER_WIDGET_FACTORY_ID,
            widgetName: 'Debug Explorer',
            defaultWidgetOptions: {
                area: 'left',
                rank: 200
            },
            toggleCommandId: 'debugExplorerView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+d'
        });
    }

    initialize(): void { }
}
