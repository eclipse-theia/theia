/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Extension, ExtensionManager } from '../common';
import { injectable, inject } from 'inversify';
import { VirtualWidget, VirtualRenderer } from '@theia/core/lib/browser';
import { h } from "@phosphor/virtualdom/lib";
import { DisposableCollection, Disposable } from "@theia/core";
import { ExtensionDetailWidgetService } from './extension-detail-widget-service';

@injectable()
export class ExtensionWidget extends VirtualWidget {

    protected extensionStore: Extension[] = [];
    protected readonly updateTimeAfterTyping = 300;
    protected readonly toDisposeOnTypeSearchQuery = new DisposableCollection();

    constructor(
        @inject(ExtensionManager) protected readonly extensionManager: ExtensionManager,
        @inject(ExtensionDetailWidgetService) protected readonly detailWidgetService: ExtensionDetailWidgetService) {
        super();
        this.id = 'extensions';
        this.title.label = 'Extensions';
        this.addClass('theia-extensions');

        extensionManager.onDidChange(event => {
            this.fetchExtensions();
        });
    }

    protected onActivateRequest() {
        this.fetchExtensions();
    }

    protected fetchExtensions() {
        const htmlInputElement = (document.getElementById('extensionSearchField') as HTMLInputElement);
        const searchQuery = htmlInputElement ? htmlInputElement.value : '';
        this.extensionManager.list({
            query: searchQuery
        }).then(extensions => {
            this.extensionStore = extensions;
            this.update();
        });
    }

    protected render(): h.Child {
        const container = h.div({
            id: 'extensionManagerContainer'
        },
            this.renderSearchField(),
            this.renderExtensionList());

        return container;
    }

    protected renderSearchField(): h.Child {
        const searchField = h.input({
            id: 'extensionSearchField',
            type: 'text',
            placeholder: 'Search theia extensions',
            onkeyup: event => {
                this.toDisposeOnTypeSearchQuery.dispose();
                const timer = setTimeout(() => this.fetchExtensions(), this.updateTimeAfterTyping);
                this.toDisposeOnTypeSearchQuery.push(Disposable.create(() => clearTimeout(timer)));
            }
        });

        const innerContainer = h.div({
            id: 'extensionSearchFieldContainer',
            className: 'flexcontainer'
        }, [searchField]);

        const container = h.div({
            id: 'extensionSearchContainer',
            className: 'flexcontainer'
        }, [innerContainer]);

        return container;
    }

    protected renderExtensionList(): h.Child {
        const theList: h.Child[] = [];
        this.extensionStore.forEach(extension => {
            const container = this.renderExtension(extension);
            theList.push(container);
        });

        return h.div({
            id: 'extensionListContainer'
        },
            VirtualRenderer.flatten(theList));
    }

    private renderExtension(extension: Extension) {
        const name = h.div({
            className: 'extensionName noWrapInfo'
        }, extension.name);

        const version = h.div({
            className: 'extensionVersion'
        }, extension.version);

        const author = h.div({
            className: 'extensionAuthor noWrapInfo flexcontainer'
        }, extension.author);

        const description = h.div({
            className: 'extensionDescription noWrapInfo'
        }, extension.description);

        let btnLabel = 'Install';
        if (extension.installed) {
            if (extension.outdated) {
                btnLabel = 'Update';
            } else {
                btnLabel = 'Uninstall';
            }
        }

        const extensionButton = h.div({
            className: 'extensionButton' +
            (extension.installed ? ' installed' : '') + ' ' +
            (extension.outdated ? ' outdated' : ''),
            onclick: event => {
                if (extension.installed) {
                    if (extension.outdated) {
                        extension.update();
                    } else {
                        extension.uninstall();
                    }
                } else {
                    extension.install();
                }
            }
        }, btnLabel);

        const extensionButtonContainer = h.div({
            className: 'extensionButtonContainer flexcontainer'
        }, extensionButton);

        const leftColumn = this.renderColumn(
            'extensionInformationContainer',
            this.renderRow(name, version),
            this.renderRow(description),
            this.renderRow(author, extensionButtonContainer));

        const container = h.div({
            className: 'extensionContainer',
            onclick: event => {
                extension.resolve().then(rawExt => {
                    this.detailWidgetService.openOrFocusDetailWidget(rawExt);
                });
            }
        }, leftColumn);
        return container;
    }

    protected renderRow(...children: h.Child[]): h.Child {
        return h.div({
            className: 'row flexcontainer'
        }, VirtualRenderer.flatten(children));
    }

    protected renderColumn(additionalClass?: string, ...children: h.Child[]): h.Child {
        return h.div({
            className: 'column flexcontainer ' + additionalClass
        }, VirtualRenderer.flatten(children));
    }
}
