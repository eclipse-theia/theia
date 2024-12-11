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

import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { injectable } from '@theia/core/shared/inversify';
import { ChatResponseContent } from '@theia/ai-chat/lib/common';
import { ReactNode } from '@theia/core/shared/react';
import * as React from '@theia/core/shared/react';

@injectable()
export class TextPartRenderer implements ChatResponsePartRenderer<ChatResponseContent> {
    canHandle(_reponse: ChatResponseContent): number {
        // this is the fallback renderer
        return 1;
    }
    render(response: ChatResponseContent): ReactNode {
        if (response && ChatResponseContent.hasAsString(response)) {
            return <span>{response.asString()}</span>;
        }
        return <span>Can't display response, please check your ChatResponsePartRenderers! {JSON.stringify(response)}</span>;
    }
}
