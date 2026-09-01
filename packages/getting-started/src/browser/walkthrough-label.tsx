// *****************************************************************************
// Copyright (C) 2026 Renesas Electronics Corporation and others.
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

import { codicon } from '@theia/core/lib/browser/widgets/widget';
import * as React from '@theia/core/shared/react';

export interface WalkthroughLabelProps {
    label: string;
}

/**
 * https://github.com/microsoft/vscode/blob/1.134.0/src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts#L1474-L1483
 */
export function WalkthroughLabel({ label }: WalkthroughLabelProps): React.ReactElement {
    const parts = label.split(/(\$\([a-z0-9-]+\))/i);
    return <>
        {parts.map((part, index) => {
            const match = /^\$\(([a-z0-9-]+)\)$/i.exec(part);
            return match ? <i key={index} className={codicon(match[1])} /> : part;
        })}
    </>;
}
