/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export const applicationPath = '/services/application';

export const ApplicationServer = Symbol('ApplicationServer');

export interface ApplicationServer {
    getExtensionsInfos(): Promise<ExtensionInfo[]>;
    getApplicationInfo(): Promise<ApplicationInfo | undefined>;
}

export interface ExtensionInfo {
    name: string;
    version: string;
}

export interface ApplicationInfo {
    name: string;
    version: string;
}
