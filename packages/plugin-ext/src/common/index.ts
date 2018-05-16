/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// Exports contribution point for uri postprocessor of hosted plugin manager.
// This could be used to alter hosted instance uri, for example, change port.
export * from '../hosted/node/hosted-plugin-uri-postprocessor';

// Here we expose types from @theia/plugin, so it becames a direct dependency
export * from '../common/plugin-protocol';
export * from '../plugin/plugin-context';
export * from '../api/plugin-api';
