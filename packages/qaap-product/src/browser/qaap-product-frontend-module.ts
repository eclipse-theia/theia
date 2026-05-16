// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContainerModule } from '@theia/core/shared/inversify';

/**
 * Umbrella module: `ExtensionPackageCollector` recurses into transitive `@theia/qaap-*` deps.
 * Product DI rebinds live in `qaap-product-bindings-frontend-module`.
 */
export default new ContainerModule(() => { /* intentionally empty */ });
