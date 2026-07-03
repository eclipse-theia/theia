// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PromptService } from '@theia/ai-core/lib/common';
import { OPEN_EDITORS_HINT_FRAGMENT_ID } from '../common/open-editors-hint-fragment-id';

export { OPEN_EDITORS_HINT_FRAGMENT_ID };

@injectable()
export class OpenEditorsHintContribution implements FrontendApplicationContribution {

    @inject(PromptService)
    protected readonly promptService: PromptService;

    onStart(): void {
        this.promptService.addBuiltInPromptFragment({
            id: OPEN_EDITORS_HINT_FRAGMENT_ID,
            template: `## Open Editors
The following files are currently open in the user's editor. This is provided as contextual information only \
— these files may or may not be relevant to the current request. Do not assume they are related unless the user explicitly refers to them.

{{openEditors}}`
        });
    }
}
