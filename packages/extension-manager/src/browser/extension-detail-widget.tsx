/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { Extension, ResolvedExtension } from '../common/extension-manager';
import { Message } from '@phosphor/messaging/lib';
import { DISABLED_CLASS } from '@theia/core/lib/browser';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

export class ExtensionDetailWidget extends ReactWidget {

    constructor(
        protected readonly resolvedExtension: ResolvedExtension
    ) {
        super();
        this.addClass('theia-extension-detail');
        this.node.tabIndex = 0;
        this.toDispose.push(resolvedExtension);
        this.toDispose.push(resolvedExtension.onDidChange(change => {
            if (change.name === this.resolvedExtension.name) {
                this.update();
            }
        }));
        this.update();
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.focus();
        this.update();
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);

        const el = document.getElementById(this.id + 'Doc');
        if (el !== null) {
            el.innerHTML = this.resolvedExtension.documentation;
        }
    }

    protected render(): React.ReactNode {
        const r = this.resolvedExtension;
        return <React.Fragment>
            <div className={this.createExtensionClassName()}>
                <div className='extensionTitleContainer'>
                    <h2 className='extensionName'>{r.name}</h2>
                    <div className='extensionSubtitle'>
                        <div className='extensionAuthor'>{r.author}</div>
                        <div className='extensionVersion'>{r.version}</div>
                    </div>
                </div>
                <div className='extensionDescription'>{r.description}</div>
                {this.createButtonContainer()}
            </div>
            <div className='extensionDocContainer flexcontainer'>
                <div className='extensionDocumentation' id={this.id + 'Doc'}></div>
            </div>
        </React.Fragment>;
    }

    protected createExtensionClassName(): string {
        const classNames = ['extensionHeaderContainer'];
        if (this.resolvedExtension.dependent) {
            classNames.push(DISABLED_CLASS);
        }
        return classNames.join(' ');
    }

    protected createButtonContainer(): React.ReactNode {
        if (this.resolvedExtension.dependent) {
            return 'installed via ' + this.resolvedExtension.dependent;
        }
        return <div className='extensionButtonContainer'>
            <div className='extensionButtonRow'>
                {this.createButtons(this.resolvedExtension)}
            </div>
        </div>;
    }

    protected createButtons(extension: Extension): React.ReactNode[] {
        const buttonArr = [];
        let btnLabel = 'Install';
        if (extension.installed) {
            btnLabel = 'Uninstall';
        }

        const faEl = <i className='fa fa-spinner fa-pulse fa-fw'></i>;
        const content = extension.busy ? faEl : btnLabel;

        buttonArr.push(<div
            className={'theia-button extensionButton' +
                (extension.busy ? ' working' : '') + ' ' +
                (extension.installed && !extension.busy ? ' installed' : '') + ' ' +
                (extension.outdated && !extension.busy ? ' outdated' : '')}
            onClick={event => {
                if (!extension.busy) {
                    if (extension.installed) {
                        extension.uninstall();
                    } else {
                        extension.install();
                    }
                    event.stopPropagation();
                }
            }}
        >{content}</div>);

        if (extension.outdated) {
            buttonArr.push(<div className={(extension.busy ? ' working' : '') + ' ' + 'theia-button extensionButton' + (extension.outdated && !extension.busy ? ' outdated' : '')}
                onClick={event => {
                    if (!extension.busy) {
                        extension.update();
                    }
                }}>{extension.busy ? faEl : 'Update'}</div>);
        }
        return buttonArr;
    }

}
