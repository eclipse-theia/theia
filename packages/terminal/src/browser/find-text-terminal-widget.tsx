/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from 'inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

export const WidgetIDPrefix = 'FindTerminal-'
export const FIND_TERMINAL_TEXT_WIDGET_ID = 'find-terminal-text-widget';
import '../../src/browser/find-text.css';

@injectable()
export class FindTextTerminalWidget extends ReactWidget {

    //todo add hover: find text in the output.

    constructor() {
        super();
    }

    protected render(): React.ReactNode {
        console.log('render find text terminal widget.');

        this.node.classList.add('find-terminal-widget-text-parent');
        return <div className='find-terminal-widget-text'>{this.renderFindTextWidget()}</div>
    }

    // todo replace buttons next and previous with help svg images...
    protected renderFindTextWidget(): React.ReactNode {
        return <div className='find-text-box'>
                <input className='find-terminal-widget-text input' type='text' placeholder='Find'></input>
                <button className='find-terminal-widget-text button'>&#171;</button>
                <button className='find-terminal-widget-text button'>&#187;</button>
            </div>
    }
}
