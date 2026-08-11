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

import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { OpenerService } from '@theia/core/lib/browser';
import { isToolCallContent, ToolCallResult } from '@theia/ai-core';
import { MarkdownRender } from './markdown-part-renderer';

/** Parses a tool call result that may be a JSON string, returning the original value on failure. */
export function tryParseToolCallResult(result: ToolCallResult): ToolCallResult {
    if (!result) {
        return undefined;
    }
    try {
        return typeof result === 'string' ? JSON.parse(result) : result;
    } catch (error) {
        return result;
    }
}

/**
 * Renders a tool call result (client or server tool). Shared between {@link ToolCallPartRenderer}
 * and the server tool renderer so both display results consistently.
 */
export function renderToolCallResult(rawResult: ToolCallResult, openerService: OpenerService): ReactNode {
    const result = tryParseToolCallResult(rawResult);
    if (!result) {
        return undefined;
    }
    // eslint-disable-next-line no-null/no-null
    if (typeof result !== 'object' || result === null) {
        return <pre>{String(result)}</pre>;
    }
    if (isToolCallContent(result)) {
        return <div className='theia-toolCall-response-content'>
            {result.content.map((content, idx) => {
                switch (content.type) {
                    case 'image': {
                        return <div key={`content-${idx}-${content.type}`} className='theia-toolCall-image-result'>
                            <img src={`data:${content.mimeType};base64,${content.base64data}`} />
                        </div>;
                    }
                    case 'text': {
                        return <div key={`content-${idx}-${content.type}`} className='theia-toolCall-text-result'>
                            <MarkdownRender text={content.text} openerService={openerService} />
                        </div>;
                    }
                    case 'error': {
                        return <div key={`content-${idx}-${content.type}`} className='theia-toolCall-error-result'><pre>{content.data}</pre></div>;
                    }
                    case 'audio':
                    default: {
                        return <div key={`content-${idx}-${content.type}`} className='theia-toolCall-default-result'><pre>{JSON.stringify(content, undefined, 2)}</pre></div>;
                    }
                }
            })}
        </div>;
    }
    return <pre>{JSON.stringify(result, undefined, 2)}</pre>;
}
