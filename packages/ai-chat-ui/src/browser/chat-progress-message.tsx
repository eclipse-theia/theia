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

import { ChatProgressMessage } from '@theia/ai-chat';
import * as React from '@theia/core/shared/react';

export type ProgressMessageProps = Omit<ChatProgressMessage, 'kind' | 'id' | 'show'>;

export const ProgressMessage = (c: ProgressMessageProps) => (
    <div className='theia-ResponseNode-ProgressMessage'>
        <Indicator {...c} /> {c.content}
    </div>
);

export const Indicator = (progressMessage: ProgressMessageProps) => (
    <span className='theia-ResponseNode-ProgressMessage-Indicator'>
        {progressMessage.status === 'inProgress' &&
            <i className={'fa fa-spinner fa-spin ' + progressMessage.status}></i>
        }
        {progressMessage.status === 'completed' &&
            <i className={'fa fa-check ' + progressMessage.status}></i>
        }
        {progressMessage.status === 'failed' &&
            <i className={'fa fa-warning ' + progressMessage.status}></i>
        }
    </span>
);
