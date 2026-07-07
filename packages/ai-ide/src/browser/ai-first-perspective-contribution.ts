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

import { injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core';
import { PerspectiveContribution, PerspectiveService } from '@theia/core/lib/browser/perspective-service';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';

const CHAT_VIEW_WIDGET_ID = 'chat-view-widget';
const EXPLORER_VIEW_CONTAINER_ID = 'explorer-view-container';
const SCM_VIEW_CONTAINER_ID = 'scm-view-container';

@injectable()
export class AIFirstPerspectiveContribution implements PerspectiveContribution {

    registerPerspectives(service: PerspectiveService): void {
        service.registerPerspective({
            id: 'ai-first',
            label: nls.localize('theia/ai-ide/perspective/aiFirst', 'AI First'),
            viewPlacements: new Map<string, ApplicationShell.Area>([
                [CHAT_VIEW_WIDGET_ID, 'main'],
                [EXPLORER_VIEW_CONTAINER_ID, 'right'],
                [SCM_VIEW_CONTAINER_ID, 'right']
            ])
        });
    }
}
