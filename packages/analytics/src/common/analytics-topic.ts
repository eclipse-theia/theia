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

const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function hasValidSegments(value: string, minimumSegments: number): boolean {
    const segments = value.split('/');
    return segments.length >= minimumSegments && segments.every(segment => SEGMENT_PATTERN.test(segment));
}

export function isValidAnalyticsTopic(topic: unknown): topic is string {
    return typeof topic === 'string' && hasValidSegments(topic, 2);
}

export function isValidAnalyticsSinkId(id: unknown): id is string {
    return typeof id === 'string' && hasValidSegments(id, 2);
}

export function isValidAnalyticsTopicPattern(pattern: unknown): pattern is string {
    if (typeof pattern !== 'string') {
        return false;
    }
    if (pattern === '*') {
        return true;
    }
    if (pattern.endsWith('/*')) {
        return hasValidSegments(pattern.slice(0, -2), 1);
    }
    return isValidAnalyticsTopic(pattern);
}

export function matchesAnalyticsTopic(pattern: string, topic: string): boolean {
    if (!isValidAnalyticsTopicPattern(pattern) || !isValidAnalyticsTopic(topic)) {
        return false;
    }
    if (pattern === '*') {
        return true;
    }
    if (pattern.endsWith('/*')) {
        return topic.startsWith(`${pattern.slice(0, -2)}/`);
    }
    return pattern === topic;
}
