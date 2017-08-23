/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Uri from "vscode-uri";
import URI from "../common/uri";

export namespace FileUri {

    /**
     * Creates a new file URI from the filesystem path argument.
     * @param fsPath the filesystem path.
     */
    export function create(fsPath: string) {
        return new URI(Uri.file(fsPath));
    }

    /**
     * Returns with the platform specific FS path that is represented by the URI argument.
     *
     * @param uri the file URI that has to be resolved to a platform specific FS path.
     */
    export function fsPath(uri: URI | string): string {
        if (typeof uri === 'string') {
            return fsPath(new URI(uri));
        } else {
            return (uri as any).codeUri.fsPath;
        }
    }

}
