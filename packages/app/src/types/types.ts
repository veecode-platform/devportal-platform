/*
 * Portions of this file are based on code from the Red Hat Developer project:
 * https://github.com/redhat-developer/rhdh/blob/main/packages/app
 *
 * Original Copyright (c) 2022 Red Hat Developer (or the exact copyright holder from the original source, please verify in their repository)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { TranslationResource } from '@backstage/core-plugin-api/alpha';

export type LearningPathLink = {
  label: string;
  url: string;
  description?: string;
  hours?: number;
  minutes?: number;
  paths?: number;
};

export type BuildInfo = {
  title?: string;
  titleKey?: string;
  card: { [key: string]: string };
  full?: boolean;
  overrideBuildInfo?: boolean;
};

export type TranslationConfig = {
  defaultLocale?: string;
  locales: string[];
  overrides?: string[];
};

export type JSONTranslationConfig = {
  locale: string;
  path: string;
};

export type DynamicTranslationResource = {
  scope: string;
  module: string;
  importName: string;
  ref?: string | null;
  jsonTranslations?: JSONTranslationConfig[];
};

// Types from Backstage core-plugin-api do not expose loader function type
// so we need to create our own internal types to access the loader function

type InternalTranslationResourceLoader = () => Promise<{
  messages: { [key in string]: string | null };
}>;

export interface InternalTranslationResource<TId extends string = string>
  extends TranslationResource<TId> {
  version: 'v1';
  resources: {
    language: string;
    loader: InternalTranslationResourceLoader;
  }[];
}