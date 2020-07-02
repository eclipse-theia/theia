/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { injectable } from 'inversify';
import { WidgetTabBarDecorator } from '@theia/core/lib/browser/shell/widget-tab-bar-decorator';
import { WidgetDecoration } from '@theia/core/lib/browser/widget-decoration';
import { Title, Widget } from '@theia/core/lib/browser';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { SCM_VIEW_CONTAINER_ID } from '../scm-contribution';

@injectable()
export class ScmTabBarDecorator implements WidgetTabBarDecorator {

    readonly id = 'theia-scm-tabbar-decorator';
    protected readonly emitter = new Emitter<void>();

    decorate(title: Title<Widget>): WidgetDecoration.Data[] {
        return title.owner.id === SCM_VIEW_CONTAINER_ID
            ? [{ badge: 7 }]
            : [];
    }

    get onDidChangeDecorations(): Event<void> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(): void {
        this.emitter.fire(undefined);
    }
}
