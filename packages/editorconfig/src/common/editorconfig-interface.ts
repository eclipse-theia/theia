/*
 * Copyright (C) 2018 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { KnownProps } from "editorconfig";

export const editorconfigServicePath = '/services/editorconfig';

export const EditorconfigService = Symbol("EditorconfigService");
export interface EditorconfigService {

    /**
     * Finds an apropriate editorconfgig properties for a file.
     */
    getConfig(uri: string): Promise<KnownProps>;

}
