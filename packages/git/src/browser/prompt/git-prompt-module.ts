// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ServiceContribution } from '@theia/core';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { GitPrompt } from '../../common/git-prompt';

export default new ContainerModule(bind => {
    bind(GitPrompt.Identifier).toConstantValue({
        ask: question => GitPrompt.Failure.create('Interactive Git prompt is not supported in the browser.')
    });
    bindPromptServer(bind);
});

export function bindPromptServer(bind: interfaces.Bind): void {
    bind(ServiceContribution)
        .toDynamicValue(ctx => ServiceContribution.fromEntries(
            [GitPrompt.WS_PATH, () => ctx.container.get(GitPrompt.Identifier)]
        ))
        .inSingletonScope();
}
