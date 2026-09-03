// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

// The content hash is not skill-specific: the registry uses the same algorithm for skill folders and
// for Agent Plugin directories, so it now lives in `../content-hash`. These aliases keep the original
// skill-flavoured names working for existing importers.

/** @deprecated since 1.75.0 - use `computeContentHash` from `../content-hash` instead. */
export { computeContentHash as computeSkillContentHash } from '../content-hash';
/** @deprecated since 1.75.0 - use `FileContent` from `../content-hash` instead. */
export type { FileContent as SkillFileContent } from '../content-hash';
