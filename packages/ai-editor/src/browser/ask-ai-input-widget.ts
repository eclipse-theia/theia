// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatAgentLocation } from '@theia/ai-chat';
import { AskAIInputBaseArgs, AskAIInputBaseConfiguration, AskAIInputWidgetBase } from '@theia/ai-chat-ui/lib/browser/ask-ai-input-widget-base';
import { inject, injectable, optional } from '@theia/core/shared/inversify';

export const AskAIInputConfiguration = Symbol('AskAIInputConfiguration');
export interface AskAIInputConfiguration extends AskAIInputBaseConfiguration { }

export const AskAIInputArgs = Symbol('AskAIInputArgs');
export interface AskAIInputArgs extends AskAIInputBaseArgs { }

export const AskAIInputFactory = Symbol('AskAIInputFactory');
export type AskAIInputFactory = (args: AskAIInputArgs) => AskAIInputWidget;

@injectable()
export class AskAIInputWidget extends AskAIInputWidgetBase {
    public static override ID = 'ask-ai-input-widget';

    @inject(AskAIInputArgs) @optional()
    protected override readonly args: AskAIInputArgs | undefined;

    @inject(AskAIInputConfiguration) @optional()
    protected override readonly configuration: AskAIInputConfiguration | undefined;

    protected override readonly chatAgentLocation = ChatAgentLocation.Editor;
    protected override get widgetId(): string { return AskAIInputWidget.ID; }
}
