// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Default HTTP port for the Qaap IDE in Docker / VPS deployments.
 * Kept off :3000 so Next.js, CRA, and other stacks can bind their conventional dev port
 * inside the same container without EADDRINUSE against the IDE backend.
 */
export const QAAP_DOCKER_IDE_PORT = 4873;

/** Framework default ports that collide with a typical local Theia dev server (:3000). */
export const QAAP_FRAMEWORK_DEV_PORT = 3000;
