// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { nls } from '@theia/core';
import { ReactRenderer } from '@theia/core/lib/browser';
import { inject, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { FileDialogTree } from './file-dialog-tree';

const TOGGLE_HIDDEN_PANEL_CLASS = 'theia-ToggleHiddenPanel';
const TOGGLE_HIDDEN_CONTAINER_CLASS = 'theia-ToggleHiddenInputContainer';
const CHECKBOX_CLASS = 'theia-ToggleHiddenInputCheckbox';

export const HiddenFilesToggleRendererFactory = Symbol('HiddenFilesToggleRendererFactory');
export interface HiddenFilesToggleRendererFactory {
    (fileDialogTree: FileDialogTree): FileDialogHiddenFilesToggleRenderer;
}
export class FileDialogHiddenFilesToggleRenderer extends ReactRenderer {
    @inject(FileDialogTree) fileDialogTree: FileDialogTree;

    @postConstruct()
    protected init(): void {
        this.host.classList.add(TOGGLE_HIDDEN_PANEL_CLASS);
        this.render();
    }

    protected readonly handleCheckboxChanged = (e: React.ChangeEvent<HTMLInputElement>): void => this.onCheckboxChanged(e);
    protected override doRender(): React.ReactNode {
        return (
            <div className={TOGGLE_HIDDEN_CONTAINER_CLASS}>
                {nls.localize('theia/fileDialog/showHidden', 'Show hidden files')}
                <input
                    type='checkbox'
                    className={CHECKBOX_CLASS}
                    onChange={this.handleCheckboxChanged}
                />
            </div>
        );
    }

    protected onCheckboxChanged(e: React.ChangeEvent<HTMLInputElement>): void {
        const { checked } = e.target;
        this.fileDialogTree.showHidden = checked;
        e.stopPropagation();
    }
}
