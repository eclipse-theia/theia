/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { ContextMenuRenderer, TreeProps } from "@theia/core/lib/browser";
import { FileTreeWidget } from "@theia/filesystem/lib/browser";
import { FileNavigatorModel } from "./navigator-model";

const enjson = require('./i18n/en.json');
const esjson = require('./i18n/es.json');
const frjson = require('./i18n/fr.json');
const Globalize = require("globalize");

// Load potential languages
Globalize.loadMessages(enjson);
Globalize.loadMessages(esjson);
Globalize.loadMessages(frjson);

export const FILE_STAT_NODE_CLASS = 'theia-FileStatNode';
export const DIR_NODE_CLASS = 'theia-DirNode';
export const FILE_STAT_ICON_CLASS = 'theia-FileStatIcon';

export const ID = 'files';
export const LABEL = Globalize.formatMessage("navigator/browser/widget/Files");
export const CLASS = 'theia-Files';

@injectable()
export class FileNavigatorWidget extends FileTreeWidget {

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileNavigatorModel) readonly model: FileNavigatorModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
        this.id = ID;
        this.title.label = LABEL;
        this.addClass(CLASS);
    }

}