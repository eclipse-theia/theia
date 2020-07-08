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

import { injectable, inject, postConstruct } from 'inversify';
import { WidgetTabBarDecorator } from '@theia/core/lib/browser/shell/widget-tab-bar-decorator-service';
import { WidgetDecoration } from '@theia/core/lib/browser/widget-decoration';
import { Title, Widget } from '@theia/core/lib/browser';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { ProblemManager } from './problem-manager';

@injectable()
export class ProblemWidgetTabBarDecorator implements WidgetTabBarDecorator {

    readonly id = 'theia-problems-widget-tabbar-decorator';
    protected readonly emitter = new Emitter<void>();

    @inject(ProblemManager)
    protected readonly problemManager: ProblemManager;

    @postConstruct()
    protected init(): void {
        this.problemManager.onDidChangeMarkers(() => this.fireDidChangeDecorations());
    }

    decorate(title: Title<Widget>): WidgetDecoration.Data[] {
        if (title.owner.id === 'problems') {
            const stat = this.problemManager.getProblemStat();
            const markerCount = stat.errors + stat.infos + stat.warnings;
            return markerCount > 0 ?
                markerCount > 99 ? [{ badge: '99+' }] : [{ badge: markerCount.toString() }]
                : [];
        } else {
            return [];
        }
    }

    get onDidChangeDecorations(): Event<void> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(): void {
        this.emitter.fire(undefined);
    }
}
