/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { WorkspaceFolder, WorkspaceFoldersChangeEvent } from "@theia/plugin";
import { Event, Emitter } from "@theia/core/lib/common/event";
import { WorkspaceExt } from "../api/plugin-api";
import { Path } from "@theia/core/lib/common/path";

export class WorkspaceExtImpl implements WorkspaceExt {

    private workspaceFoldersChangedEmitter = new Emitter<WorkspaceFoldersChangeEvent>();
    public readonly onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent> = this.workspaceFoldersChangedEmitter.event;

    private folders: WorkspaceFolder[] | undefined;

    constructor() {
    }

    get workspaceFolders(): WorkspaceFolder[] | undefined {
        return this.folders;
    }

    get name(): string | undefined {
        if (this.workspaceFolders) {
            return new Path(this.workspaceFolders[0].uri.path).base;
        }

        return undefined;
    }

    $onWorkspaceFoldersChanged(event: WorkspaceFoldersChangeEvent): void {
        this.folders = event.added;
        this.workspaceFoldersChangedEmitter.fire(event);
    }

}
