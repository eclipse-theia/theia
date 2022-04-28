// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { injectable } from 'inversify';
import { RenderableKeybindingStringSegment } from './keybinding-util';

export interface KeybindingProps {
    segments: RenderableKeybindingStringSegment[];
}

/**
 * A reusable widget to render keybindings
 */
@injectable()
export class KeybindingSegmentsWidget extends React.Component<KeybindingProps> {

    override render(): React.ReactNode {
        return this.props.segments.map((segment, index) => {
            if (segment.key) {
                return <span key={index} className='monaco-keybinding-key'>
                    <span>{segment.value}</span>
                </span>;
            } else {
                return <span key={index} className='monaco-keybinding-separator'>
                    {segment.value}
                </span>;
            }
        });
    }

}
