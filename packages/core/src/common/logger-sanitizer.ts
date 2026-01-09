// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics GmbH.
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

import { injectable } from 'inversify';

export const LoggerSanitizer = Symbol('LoggerSanitizer');

/**
 * Service for sanitizing log messages to remove sensitive information.
 *
 * Adopters can rebind this service to customize sanitization behavior,
 * for example to mask additional patterns like API keys or tokens.
 *
 * @example
 * ```ts
 * // Custom sanitizer that extends the default behavior
 * @injectable()
 * class CustomLoggerSanitizer extends DefaultLoggerSanitizer {
 *     override sanitize(message: string): string {
 *         let sanitized = super.sanitize(message);
 *         // Add custom sanitization, e.g., mask API keys
 *         sanitized = sanitized.replace(/api[_-]?key[=:]\s*['"]?[\w-]+['"]?/gi, 'api_key=****');
 *         return sanitized;
 *     }
 * }
 *
 * // In your module:
 * rebind(LoggerSanitizer).to(CustomLoggerSanitizer).inSingletonScope();
 * ```
 */
export interface LoggerSanitizer {
    /**
     * Sanitizes a log message by masking sensitive information.
     *
     * @param message The log message to sanitize
     * @returns The sanitized message with sensitive data masked
     */
    sanitize(message: string): string;
}

/**
 * Represents a sanitization rule with a pattern and replacement string.
 */
export interface SanitizationRule {
    /**
     * The regex pattern to match sensitive information.
     * Can use capture groups that can be referenced in the replacement string.
     */
    pattern: RegExp;

    /**
     * The replacement string. Can include capture group references like $1, $2, etc.
     */
    replacement: string;
}

/**
 * Default set of log sanitization rules.
 */
export const DefaultSanitizationRules: SanitizationRule[] = [
    {
        /**
         * Regex pattern to match URLs with credentials.
         * Matches any URL with format: protocol://user:pass@host[:port]
         * Capture groups: $1=protocol, $2=username, $3=password, $4=host (with optional port)
         */
        pattern: /([a-z][a-z0-9+.-]*:\/\/)([^:/@]+):([^:/@]+)@([^/:@\s]+(?::\d+)?)/giu,
        replacement: '$1****:****@$4'
    },
    {
        /**
         * Matches JSON-style key-value pairs for sensitive keys.
         * Handles both regular quotes and escaped quotes from JSON.stringify.
         * Examples: "apiKey": "value" or \"apiKey\": \"value\"
         * Capture groups: $1=key with opening quote of value, $2=closing quote of value
         */
        pattern: /(\\?["'][\w.-]*(?:api[_-]?key|auth[_-]?token)\\?["']\s*:\s*\\?["'])[^"'\\]+(\\?["'])/gi,
        replacement: '$1****$2'
    }
];

/**
 * Default implementation of LoggerSanitizer that masks credentials in URLs.
 */
@injectable()
export class DefaultLoggerSanitizer implements LoggerSanitizer {

    protected rules: SanitizationRule[] = DefaultSanitizationRules;

    sanitize(message: string): string {
        let result = message;
        for (const rule of this.rules) {
            result = result.replace(rule.pattern, rule.replacement);
        }
        return result;
    }
}
