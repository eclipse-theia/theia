/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Extension, ResolvedExtension } from '../common/extension-manager';
import { Message } from "@phosphor/messaging/lib";
import { VirtualWidget, VirtualRenderer } from "@theia/core/lib/browser";
import { h } from "@phosphor/virtualdom/lib";

export class ExtensionDetailWidget extends VirtualWidget {

    constructor(id: string, protected resolvedExtension: ResolvedExtension) {
        super();
        this.id = id;
        this.addClass('theia-extension-detail');
        this.title.closable = true;
        this.title.label = resolvedExtension.name;
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.update();
    }

    protected onCloseRequest(msg: Message): void {
        super.onCloseRequest(msg);
        this.dispose();
    }

    protected render(): h.Child {
        const d = h.div;
        const c = (cn: string) => ({ className: cn });
        const r = this.resolvedExtension;

        const name = h.h2(c('extensionName'), r.name);
        const extversion = d(c('extensionVersion'), r.version);
        const author = d(c('extensionAuthor'), r.author);
        const titleInfo = d(c('extensionSubtitle flexcontainer'), author, extversion);
        const titleContainer = d(c('extensionTitleContainer flexcontainer'),
            name, titleInfo);

        const description = d(c('extensionDescription'), r.description);

        const buttonContainer = d(c('extensionButtonContainer flexcontainer'),
            VirtualRenderer.flatten(this.createButtons(this.resolvedExtension)));

        const headerContainer = d(c('extensionHeaderContainer flexcontainer'),
            titleContainer, description, buttonContainer);

        const documentation = d(c('extensionDocumentation'), r.documentation);
        const docContainer = d(c('extensionDocContainer flexcontainer'), documentation);

        return [headerContainer, docContainer];
    }

    protected createButtons(extension: Extension): h.Child[] {
        const buttonArr = [];
        let btnLabel = 'Install';
        if (extension.installed) {
            btnLabel = 'Uninstall';
        }

        buttonArr.push(h.div({
            className: 'extensionButton' + (extension.installed ? ' installed' : ''),
            onclick: event => {
                if (extension.installed) {
                    extension.uninstall();
                } else {
                    extension.install();
                }
            }
        }, btnLabel));

        if (extension.outdated) {
            buttonArr.push(h.div({
                className: 'extensionButton outdated',
                onclick: event => {
                    extension.update();
                }
            }, 'Update'));
        }

        return buttonArr;
    }

}