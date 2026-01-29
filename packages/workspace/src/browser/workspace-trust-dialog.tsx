// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { codicon } from '@theia/core/lib/browser';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import * as React from '@theia/core/shared/react';

export class WorkspaceTrustDialog extends ReactDialog<boolean> {
    protected confirmed = true;

    constructor(protected readonly folderPath: string) {
        super({
            title: '',
            maxWidth: 500
        });

        this.node.classList.add('workspace-trust-dialog');

        this.appendCloseButton(nls.localizeByDefault("No, I don't trust the authors"));
        this.appendAcceptButton(nls.localizeByDefault('Yes, I trust the authors'));
        this.controlPanel.removeChild(this.errorMessageNode);
    }

    get value(): boolean {
        return this.confirmed;
    }

    protected override handleEscape(): boolean | void {
        this.confirmed = false;
        this.accept();
    }

    override close(): void {
        this.confirmed = false;
        this.accept();
    }

    protected render(): React.ReactNode {
        return (
            <div className="workspace-trust-content">
                <div className="workspace-trust-header">
                    <i className={codicon('shield')}></i>
                    <div className="workspace-trust-title">
                        {nls.localizeByDefault('Do you trust the authors of the files in this folder?')}
                    </div>
                </div>
                <div className="workspace-trust-description">
                    {nls.localize(
                        'theia/workspace/trustDialogMessage',
                        `If you trust the authors, code in this folder may be executed.

                        If not, some features will be disabled.
                        
                        The workspace trust feature is currently under development in Theia; not all features are integrated with workspace trust yet.
                        Check the 'Restricted Mode' indicator in the status bar for details.`
                    )}
                </div>
                {this.folderPath && (
                    <div className="workspace-trust-folder">{this.folderPath}</div>
                )}
            </div>
        );
    }
}
