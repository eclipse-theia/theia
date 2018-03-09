/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { interfaces } from "inversify";
import {
  createPreferenceProxy,
  PreferenceProxy,
  PreferenceService,
  PreferenceContribution,
  PreferenceSchema
} from "@theia/core/lib/browser";

export const PreviewConfigSchema: PreferenceSchema = {
  type: "object",
  properties: {
    "preview.openByDefault": {
      type: "boolean",
      description: "Open the preview instead of the editor by default.",
      default: true
    }
  }
};

export interface PreviewConfiguration {
  "preview.openByDefault": boolean;
}

export const PreviewPreferences = Symbol("PreviewPreferences");
export type PreviewPreferences = PreferenceProxy<PreviewConfiguration>;

export function createPreviewPreferences(
  preferences: PreferenceService
): PreviewPreferences {
  return createPreferenceProxy(preferences, PreviewConfigSchema);
}

export function bindPreviewPreferences(bind: interfaces.Bind): void {
  bind(PreviewPreferences).toDynamicValue(ctx => {
    const preferences = ctx.container.get<PreferenceService>(PreferenceService);
    return createPreviewPreferences(preferences);
  });
  bind(PreferenceContribution).toConstantValue({ schema: PreviewConfigSchema });
}
