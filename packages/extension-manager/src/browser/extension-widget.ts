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

@injectable()
export class ExtensionWidget extends VirtualWidget {

    protected extensionStore: Extension[] = [];

    constructor( @inject(ExtensionManager) protected readonly extensionManager: ExtensionManager) {
        super();
        this.id = 'extensions';
        this.title.label = 'Extensions';
        this.addClass('theia-extensions');

        this.fetchExtensions();
    }

    protected fetchExtensions() {
        this.extensionManager.list({
            query: 'scope:theia'
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
            type: 'text'
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
            const name = h.div({
                className: 'extensionName noWrapInfo'
            }, extension.name);

            const version = h.div({
                className: 'extensionVersion'
            }, extension.version);

            const author = h.div({
                className: 'extensionAuthor noWrapInfo'
            }, extension.author);

            const description = h.div({
                className: 'extensionDescription noWrapInfo'
            }, extension.description)

            const leftColumn = this.renderColumn(
                'extensionInformationContainer',
                this.renderRow(name, version),
                this.renderRow(description),
                this.renderRow(author));

            let btnLabel = 'Install';
            if (extension.installed) {
                if (extension.outdated) {
                    btnLabel = 'Update';
                } else {
                    btnLabel = 'Uninstall';
                }
            }

            const rightColumn = this.renderColumn(
                'extensionButtonContainer',
                h.div({
                    className: 'extensionButton' +
                    (extension.installed ? ' installed' : '') + ' ' +
                    (extension.outdated ? ' outdated' : '')
                }, btnLabel)
            );

            const container = h.div({
                className: 'extensionContainer flexcontainer'
            }, leftColumn, rightColumn);


            theList.push(container);
        })

        return h.div({
            id: 'extensionListContainer',
            className: 'flexcontainer'
        },
            VirtualRenderer.flatten(theList));
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