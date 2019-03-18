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

import { injectable, inject } from 'inversify';
import { Message } from '@phosphor/messaging';
import { DisposableCollection, Disposable } from '@theia/core';
import { OpenerService, open, DISABLED_CLASS } from '@theia/core/lib/browser';
import { Extension, ExtensionManager } from '../common';
import { ExtensionUri } from './extension-uri';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';

@injectable()
export class ExtensionWidget extends ReactWidget {

    static SEARCH_DELAY = 200;

    protected extensions: Extension[] = [];
    protected readonly toDisposeOnFetch = new DisposableCollection();
    protected readonly toDisposeOnSearch = new DisposableCollection();
    protected ready = false;

    constructor(
        @inject(ExtensionManager) protected readonly extensionManager: ExtensionManager,
        @inject(OpenerService) protected readonly openerService: OpenerService
    ) {
        super();
        this.id = 'extensions';
        this.title.label = 'Extensions';
        this.title.caption = 'Extensions';
        this.title.iconClass = 'extensions-tab-icon';
        this.addClass('theia-extensions');

        this.update();
        this.fetchExtensions();
        this.toDispose.push(extensionManager.onDidChange(() => this.update()));
    }

    protected onActivateRequest(msg: Message) {
        super.onActivateRequest(msg);
        this.fetchExtensions();
        const searchField = this.findSearchField();
        if (searchField) {
            searchField.focus();
        } else {
            this.node.focus();
        }
    }

    protected fetchExtensions(): void {
        const searchField = this.findSearchField();
        const query = searchField ? searchField.value.trim() : '';
        this.extensionManager.list({ query }).then(extensions => {
            this.toDisposeOnFetch.dispose();
            this.toDisposeOnFetch.pushAll(extensions);
            if (this.isDisposed) {
                this.toDisposeOnFetch.dispose();
                return;
            }
            this.toDispose.push(this.toDisposeOnFetch);
            this.extensions = query ? extensions : extensions.filter(e => !e.dependent);
            this.ready = true;
            this.update();
        });
    }

    protected render(): React.ReactNode {
        if (this.ready) {
            return <React.Fragment>{this.renderSearchField()}{this.renderExtensionList()}</React.Fragment>;
        } else {
            return <div className='spinnerContainer'>
                <div className='fa fa-spinner fa-pulse fa-3x fa-fw'></div>
            </div>;
        }
    }

    protected searchFieldKeyUp = () => {
        this.toDisposeOnSearch.dispose();
        const delay = setTimeout(() => this.fetchExtensions(), ExtensionWidget.SEARCH_DELAY);
        this.toDisposeOnSearch.push(Disposable.create(() => clearTimeout(delay)));
        this.toDispose.push(this.toDisposeOnSearch);
    }

    protected renderSearchField(): React.ReactNode {
        return <div id='extensionSearchContainer' className='flexcontainer'>
            <div id='extensionSearchFieldContainer' className='flexcontainer'>
                <input id='extensionSearchField' type='text' placeholder='Search theia extensions' onKeyUp={this.searchFieldKeyUp}></input >
            </div>
        </div>;
    }

    protected findSearchField(): HTMLInputElement | null {
        return document.getElementById('extensionSearchField') as HTMLInputElement;
    }

    protected renderExtensionList(): React.ReactNode {
        const theList: React.ReactNode[] = [];
        this.extensions.forEach(extension => {
            const container = this.renderExtension(extension);
            theList.push(container);
        });

        return <div id='extensionListContainer'>{theList}</div>;
    }

    protected extensionClick = (extension: Extension) => open(this.openerService, ExtensionUri.toUri(extension.name));

    private renderExtension(extension: Extension) {
        const extensionButtonContainer = !extension.dependent ?
            <div className='extensionButtonContainer flexcontainer'> {this.createButton(extension)}</div> : 'installed via ' + extension.dependent;

        return <div key={extension.name} className={this.createExtensionClassName(extension)} onClick={() => this.extensionClick(extension)} title={this.getTooltip(extension)}>
            <div className={'column flexcontainer extensionInformationContainer'}>
                <div className='row flexcontainer'>
                    <div className='extensionName noWrapInfo'>{extension.name}</div>
                    <div className='extensionVersion'>{extension.version}</div>
                </div>
                <div className='row flexcontainer'>
                    <div className='extensionDescription noWrapInfo'>{extension.description}</div>
                </div>
                <div className='row flexcontainer'>
                    <div className='extensionAuthor noWrapInfo flexcontainer'>{extension.author}</div>
                    {extensionButtonContainer}
                </div>
            </div>
        </div>;
    }

    protected createExtensionClassName(extension: Extension): string {
        const classNames = ['extensionHeaderContainer'];
        if (extension.dependent) {
            classNames.push(DISABLED_CLASS);
        }
        return classNames.join(' ');
    }

    protected installButtonClick = (extension: Extension) => {
        if (!extension.busy) {
            if (extension.installed) {
                if (extension.outdated) {
                    extension.update();
                } else {
                    extension.uninstall();
                }
            } else {
                extension.install();
            }
            this.update();
        }
    }

    protected createButton(extension: Extension): React.ReactNode {
        let btnLabel = 'Install';
        if (extension.installed) {
            if (extension.outdated) {
                btnLabel = 'Update';
            } else {
                btnLabel = 'Uninstall';
            }
        }

        const className = 'theia-button extensionButton' +
            (extension.busy ? ' working' : '') + ' ' +
            (extension.installed && !extension.busy ? ' installed' : '') + ' ' +
            (extension.outdated && !extension.busy ? ' outdated' : '');

        return <div className={className}
            onClick={event => {
                this.installButtonClick(extension);
                event.stopPropagation();
            }}>
            {extension.busy ? <i className='fa fa-spinner fa-pulse fa-fw' /> : btnLabel}
        </div >;
    }

    protected getTooltip(extension: Extension): string {
        return `${extension.name}\n${extension.description}`;
    }
}
