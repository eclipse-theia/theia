// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { inject, injectable, interfaces } from 'inversify';
import { ViewContainer } from '../view-container';
import { WidgetDecoration } from '../widget-decoration';
import { Title, Widget } from '../widgets';
import { TabBarDecorator } from '../shell/tab-bar-decorator';
import { Disposable, Event } from '../../common';
import { Badge, BadgeService } from './badge-service';

@injectable()
export class TabBarBadgeDecorator implements TabBarDecorator {
    readonly id = 'theia-plugin-view-container-badge-decorator';

    @inject(BadgeService)
    protected readonly badgeService: BadgeService;

    onDidChangeDecorations(...[cb, thisArg, disposable]: Parameters<Event<void>>): Disposable { return this.badgeService.onDidChangeBadges(() => cb(), thisArg, disposable); }

    decorate({ owner }: Title<Widget>): WidgetDecoration.Data[] {
        let total = 0;
        const result: WidgetDecoration.Data[] = [];
        const aggregate = (badge?: Badge) => {
            if (badge?.value) {
                total += badge.value;
            }
            if (badge?.tooltip) {
                result.push({ tooltip: badge.tooltip });
            }
        };
        if (owner instanceof ViewContainer) {
            for (const { wrapped } of owner.getParts()) {
                aggregate(this.badgeService.getBadge(wrapped));
            }
        } else {
            aggregate(this.badgeService.getBadge(owner));
        }
        if (total !== 0) {
            result.push({ badge: total });
        }
        return result;
    }
}

export function bindBadgeDecoration(bind: interfaces.Bind): void {
    bind(BadgeService).toSelf().inSingletonScope();
    bind(TabBarBadgeDecorator).toSelf().inSingletonScope();
    bind(TabBarDecorator).toService(TabBarBadgeDecorator);
}
