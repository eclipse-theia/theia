/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Disposable } from '../../common';

export class ReactRenderer implements Disposable {
    readonly host: HTMLElement;
    constructor(
        host?: HTMLElement
    ) {
        this.host = host || document.createElement('div');
    }

    dispose(): void {
        ReactDOM.unmountComponentAtNode(this.host);
    }

    render(): void {
        ReactDOM.render(<React.Fragment>{this.doRender()}</React.Fragment>, this.host);
    }

    protected doRender(): React.ReactNode {
        return undefined;
    }
}
