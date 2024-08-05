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

import { ChatResponsePartRenderer } from '../types';
import { injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent, ErrorResponseContent, isErrorChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';

@injectable()
export class ErrorPartRenderer implements ChatResponsePartRenderer<ErrorResponseContent> {
    canHandle(response: ChatResponseContent): number {
        if (isErrorChatResponseContent(response)) {
            return 10;
        }
        return -1;
    }
    render(response: ErrorResponseContent): ReactNode {
        return <div className='theia-ChatPart-Error'><span className='codicon codicon-error' /><span>{response.error.message}</span></div>;
    }

}
