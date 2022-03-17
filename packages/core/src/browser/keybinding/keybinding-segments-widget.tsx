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

import React = require('react');
import { injectable } from 'inversify';
import { KeybindingRenderingItem } from '../watermark';

export interface KeybindingProps {
    keybinding: KeybindingRenderingItem;
}

/**
 * A reusable widget to render keybindings
 */
@injectable()
export class KeybindingSegmentsWidget extends React.Component<KeybindingProps> {

    override render(): React.ReactNode {
        if (!this.props.keybinding.keybinding) {
            return undefined;
        }

        return this.props.keybinding.keySegments.map((segment, index) => {
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
