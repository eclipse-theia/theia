/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { interfaces, Container } from 'inversify';
import { WidgetFactory, OpenHandler } from '@theia/core/lib/browser';
import { HgScmProvider } from '../hg-scm-provider';
import { HgCommitDetailWidget, HgCommitDetails, HgCommitDetailWidgetOptions } from './hg-commit-detail-widget';
import { HgCommitDetailOpenHandler } from './hg-commit-detail-open-handler';

import '../../../src/browser/style/hg-icons.css';

export function bindHgHistoryModule(bind: interfaces.Bind): void {

    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: HgScmProvider.HG_COMMIT_DETAIL,
        createWidget: (options: HgCommitDetails) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(HgCommitDetailWidget).toSelf();
            child.bind(HgCommitDetailWidgetOptions).toConstantValue(options);
            return child.get(HgCommitDetailWidget);
        }
    }));

    bind(HgCommitDetailOpenHandler).toSelf();
    bind(OpenHandler).toService(HgCommitDetailOpenHandler);

}
