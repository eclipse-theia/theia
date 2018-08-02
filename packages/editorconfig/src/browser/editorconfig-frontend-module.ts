/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc.
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

import { ContainerModule } from 'inversify';
import { FrontendApplicationContribution, FrontendApplication, WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { EditorconfigDocumentManager } from './editorconfig-document-manager';
import { EditorconfigService, editorconfigServicePath } from '../common/editorconfig-interface';
import { MaybePromise } from '@theia/core';

export default new ContainerModule((bind, unbind) => {
    bind(EditorconfigService).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<EditorconfigService>(editorconfigServicePath);
    }).inSingletonScope();

    bind(EditorconfigDocumentManager).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toDynamicValue(ctx => ({
        onStart(app: FrontendApplication): MaybePromise<void> {
            ctx.container.get<EditorconfigDocumentManager>(EditorconfigDocumentManager);
        }
    }));
});
