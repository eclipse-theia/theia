/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export const ClipboardService = Symbol("ClipboardService")

export interface ClipboardService {

    getData(format: string, type?: "" | "selection" | undefined): any
    isEmpty: boolean
    setData(data: any, type?: "" | "selection" | undefined): void
}