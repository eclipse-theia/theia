/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonValidator } from "./json-validator";
import { ILogger } from '@theia/core/lib/common';
import { inject } from "inversify";
import * as ajv from 'ajv';

export const PrefSchema = Symbol("PrefSchema");

export class PrefJsonValidator implements JsonValidator {

    protected validate: ajv.ValidateFunction;

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(PrefSchema) protected readonly schema: Object
    ) {
        try {
            ajv().compile(schema);
        } catch (error) {
            this.logger.error("Invalid json schema: ", error);
        }
    }

    validateJson(toValidate: string): boolean {
        if (this.validate(toValidate)) {
            return true;
        } else {
            return false;
        }
    }
}