/*
 * Copyright (C) 2018 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import * as editorconfig from 'editorconfig';
import { KnownProps } from "editorconfig";
import { EditorconfigService } from "../common/editorconfig-interface";
import { FileUri } from "@theia/core/lib/node";

@injectable()
export class EditorconfigServiceImpl implements EditorconfigService {

    getConfig(uri: string): Promise<KnownProps> {
        return editorconfig.parse(FileUri.fsPath(uri));
    }

}
