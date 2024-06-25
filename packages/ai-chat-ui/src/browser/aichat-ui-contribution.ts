// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
// import { ChatWidget } from './chat-widget';
import { ChatViewWidget } from './chat-view-widget';
export const AI_CHAT_TOGGLE_COMMAND_ID = 'aiChat:toggle';
@injectable()
export class AIChatContribution extends AbstractViewContribution<ChatViewWidget> {

    constructor() {
        super({
            widgetId: ChatViewWidget.ID,
            widgetName: ChatViewWidget.LABEL,
            defaultWidgetOptions: {
                area: 'left',
                rank: 100
            },
            toggleCommandId: AI_CHAT_TOGGLE_COMMAND_ID,
            toggleKeybinding: 'ctrlcmd+shift+e'
        });
    }
}
