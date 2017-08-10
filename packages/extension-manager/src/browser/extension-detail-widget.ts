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

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);

        const el = document.getElementById(this.id + "Doc");
        if (el !== null) {
            el.innerHTML = this.resolvedExtension.documentation;
        }
    }

    protected render(): h.Child {
        const r = this.resolvedExtension;

        const name = h.h2({ className: 'extensionName' }, r.name);
        const extversion = h.div({ className: 'extensionVersion' }, r.version);
        const author = h.div({ className: 'extensionAuthor' }, r.author);
        const titleInfo = h.div({ className: 'extensionSubtitle flexcontainer' }, author, extversion);
        const titleContainer = h.div({ className: 'extensionTitleContainer flexcontainer' },
            name, titleInfo);

        const description = h.div({ className: 'extensionDescription' }, r.description);

        const buttonContainer = h.div({ className: 'extensionButtonContainer flexcontainer' },
            VirtualRenderer.flatten(this.createButtons(this.resolvedExtension)));

        const headerContainer = h.div({ className: 'extensionHeaderContainer flexcontainer' },
            titleContainer, description, buttonContainer);

        const documentation = h.div({ className: 'extensionDocumentation', id: this.id + "Doc" }, '');
        const docContainer = h.div({ className: 'extensionDocContainer flexcontainer' }, documentation);

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