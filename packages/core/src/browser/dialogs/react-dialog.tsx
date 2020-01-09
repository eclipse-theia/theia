/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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
import { injectable, inject } from 'inversify';
import { Disposable, DisposableCollection } from '../../common';
import { Message } from '../widgets';
import { AbstractDialog, DialogProps } from '../dialogs';

@injectable()
export abstract class ReactDialog<T> extends AbstractDialog<T> {
    protected readonly onRender = new DisposableCollection();

    constructor(
        @inject(DialogProps) protected readonly props: DialogProps
    ) {
        super(props);
        this.toDispose.push(Disposable.create(() => {
            ReactDOM.unmountComponentAtNode(this.contentNode);
        }));
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        ReactDOM.render(<>{this.render()}</>, this.contentNode, () => this.onRender.dispose());
    }

    /**
     * Render the React widget in the DOM.
     * - If the widget has been previously rendered,
     * any subsequent calls will perform an update and only
     * change the DOM if absolutely necessary.
     */
    protected abstract render(): React.ReactNode;
}
