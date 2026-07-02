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
// eslint-disable-next-line import/no-extraneous-dependencies
import { renderToStaticMarkup } from 'react-dom/server';
import { nls } from '@theia/core/lib/common/nls';

export interface BlockedResourcePlaceholderProps {
    resources: string[];
}

export const BlockedResourcePlaceholder = ({ resources }: BlockedResourcePlaceholderProps): React.ReactNode => {
    const firstResource = resources[0] ?? nls.localize('theia/ai-chat-ui/blockedResource/inlineContent', '(inline external content)');
    return <>
        <span className='theia-blocked-resource-icon codicon codicon-shield'></span>
        <span className='theia-blocked-resource-label'>
            {nls.localize('theia/ai-chat-ui/blockedResource/label', 'External resource blocked:')}{' '}
            <span className='theia-blocked-resource-url' title={firstResource}>{firstResource}</span>
        </span>
        {resources.length > 1 && <details className='theia-blocked-resource-details'>
            <summary>{nls.localize('theia/ai-chat-ui/blockedResource/resourcesToAllow', '{0} resources will be enabled', resources.length)}</summary>
            <ul>
                {resources.map(resource => <li key={resource} title={resource}>{resource}</li>)}
            </ul>
        </details>}
        <button type='button' className='theia-blocked-resource-allow'>{nls.localize('theia/ai-chat-ui/blockedResource/allow', 'Allow this blocked content')}</button>
    </>;
};

export const renderBlockedResourcePlaceholder = (resources: string[]): string => renderToStaticMarkup(<BlockedResourcePlaceholder resources={resources} />);
