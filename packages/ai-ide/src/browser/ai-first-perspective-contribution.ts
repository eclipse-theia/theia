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
import { PerspectiveContribution, PerspectiveChromeOptions, PerspectiveService } from '@theia/core/lib/browser/perspective-service';
import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser';
import { SCM_VIEW_CONTAINER_ID } from '@theia/scm/lib/browser/scm-contribution';
import { ChatViewWidget } from '@theia/ai-chat-ui/lib/browser/chat-view-widget';
import { AISessionsWidget } from './ai-sessions-widget';

export const AI_FIRST_PERSPECTIVE_ID = 'ai-first';

@injectable()
export class AIFirstPerspectiveContribution implements PerspectiveContribution {

    registerPerspectives(service: PerspectiveService): void {
        const chromeOptions: PerspectiveChromeOptions = {
            collapseAreas: ['bottom']
        };
        service.registerPerspective({
            id: AI_FIRST_PERSPECTIVE_ID,
            label: nls.localize('theia/ai-ide/perspective/aiFirst', 'AI First'),
            viewPlacements: new Map<string, ApplicationShell.Area>([
                [ChatViewWidget.ID, 'main'],
                [EXPLORER_VIEW_CONTAINER_ID, 'right'],
                [SCM_VIEW_CONTAINER_ID, 'right'],
                [AISessionsWidget.ID, 'left']
            ]),
            primaryViews: { right: EXPLORER_VIEW_CONTAINER_ID },
            chromeOptions
        });
    }
}
