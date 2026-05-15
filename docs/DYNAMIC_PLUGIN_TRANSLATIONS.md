# Dynamic Plugin Translations

`devportal-platform` supports internationalising menu items, route
labels, and arbitrary strings exposed by dynamic plugins. The
mechanism is upstream Backstage `i18n` plus the RHDH translations
plugin, threaded through a dynamic plugin's `pluginConfig:`.

## What's wired in the image

[`app-config.yaml`](../app-config.yaml#L32):

```yaml
i18n:
  locales:
    - en
    - pt
  defaultLocale: en
```

So `en` and `pt` are the locales the user can switch between in
Settings → Language. Adding a locale is a config edit plus a
matching message-file import (see "Adding a new locale" below).

Static frontend translations live in
[`packages/app/src/translations/rhdh/`](../packages/app/src/translations/):

```text
rhdh/
├── ref.ts        # Translation reference + English messages
├── index.ts      # Resource registration
├── de.ts         # German
├── es.ts         # Spanish
├── fr.ts         # French
├── it.ts         # Italian
└── pt.ts         # Portuguese
```

The reference (`rhdhTranslationRef`) is exported and used by anywhere
in the app that calls `useTranslationRef(rhdhTranslationRef)`.
Although `de/es/fr/it/pt` message files all exist, only the locales
listed in `app-config.yaml` are exposed in the UI.

The backend pairs with `@red-hat-developer-hub/backstage-plugin-translations-backend`
([`packages/backend/src/index.ts:252`](../packages/backend/src/index.ts)),
which serves per-locale assets at `/api/translations/*`.

## Per-dynamic-plugin translations

A dynamic plugin contributes its own translation resources via the
`translationResources:` field in its `pluginConfig.dynamicPlugins.frontend.<scope>`
block. From [`dynamic-plugins.default.yaml`](../dynamic-plugins.default.yaml):

```yaml
- package: veecode-platform-plugin-veecode-homepage-dynamic
  preInstalled: true
  pluginConfig:
    dynamicPlugins:
      frontend:
        veecode-platform.plugin-veecode-homepage:
          translationResources:
            - importName: homepageTranslations
              ref: homepageTranslationRef
          dynamicRoutes:
            - path: /
              importName: VeecodeHomepagePage
```

What each field does:

- `importName` — the named export from the plugin's bundle that
  carries the translation resource (created by
  `createTranslationResource({ ref, translations: { … } })`).
- `ref` — a unique reference identifier. Should be unique across
  plugins to avoid collision.

Without `translationResources:`, the plugin's own messages won't
load — even if every menu item declares a `titleKey`. The
key falls back to the literal `title` value.

## Menu items: `title` vs `titleKey`

Menu items support both a `title` (required, the fallback text) and
a `titleKey` (optional, the i18n key resolved against the active
translation resources):

```yaml
menuItems:
  rbac:
    parent: admin
    title: RBAC # fallback if titleKey unresolved
    titleKey: menuItem.rbac # i18n key
    icon: admin
```

For dynamic routes:

```yaml
dynamicRoutes:
  - path: /tech-radar
    importName: TechRadarPage
    menuItem:
      icon: techRadar
      text: Tech Radar # fallback
      textKey: menuItem.techRadar # i18n key
```

The same pattern: `text`/`textKey` for `menuItem`, `title`/`titleKey`
for `menuItems`. Always include the fallback — if the key is
missing or the translation resource didn't load, the fallback is
what the user sees.

## Adding a new translation key

For the always-on app translations
([`packages/app/src/translations/rhdh/`](../packages/app/src/translations/)):

1. **Add the key to the English ref.**
   ```ts
   // packages/app/src/translations/rhdh/ref.ts
   export const rhdhMessages = {
     menuItem: {
       // …existing…
       myCustomItem: 'My Custom Item',
     },
   };
   ```
2. **Add the translation in every other locale file** —
   `de.ts`, `es.ts`, `fr.ts`, `it.ts`, `pt.ts`. The shape mirrors
   `ref.ts`.
3. **Use it.** A menu item or component now reading
   `titleKey: menuItem.myCustomItem` resolves through the locale
   currently active in Settings.

## Adding translations to a dynamic plugin

The pattern documented in the wrappers we ship (e.g. the
veecode-homepage and veecode-global-header configs in
[`dynamic-plugins.default.yaml:344-361`](../dynamic-plugins.default.yaml)):

1. **In the plugin source**, create a translation resource with
   `createTranslationResource`:

   ```ts
   // src/translations/index.ts
   import {
     createTranslationRef,
     createTranslationResource,
   } from '@backstage/core-plugin-api/alpha';

   export const myPluginTranslationRef = createTranslationRef({
     id: 'my-plugin',
     messages: {
       'menuItem.myPlugin': 'My Plugin',
       'greeting.welcome': 'Welcome',
     },
   });

   export const myPluginTranslations = createTranslationResource({
     ref: myPluginTranslationRef,
     translations: {
       pt: () => import('./pt'),
     },
   });
   ```

2. **Export both** from the plugin's entry point (`src/index.ts`):

   ```ts
   export {
     myPluginTranslations,
     myPluginTranslationRef,
   } from './translations';
   ```

3. **Reference them** in `dynamic-plugins.default.yaml` (or your
   preset's `plugins:` block):

   ```yaml
   pluginConfig:
     dynamicPlugins:
       frontend:
         <scalprum-scope>.plugin-<name>:
           translationResources:
             - importName: myPluginTranslations
               ref: myPluginTranslationRef
   ```

`importName` must match the named export exactly. `ref` should be
unique across the loaded plugin set.

Alternative: `createTranslationMessages` produces a flat-key resource
that's lighter to author but otherwise equivalent:

```ts
import { createTranslationMessages } from '@backstage/core-plugin-api/alpha';

export const myPluginPtMessages = createTranslationMessages({
  ref: myPluginTranslationRef,
  messages: {
    'menuItem.myPlugin': 'Meu Plugin',
    'greeting.welcome': 'Bem-vindo',
  },
});
```

## Adding a new locale

1. **Create the message file** for the new locale under
   `packages/app/src/translations/rhdh/<locale>.ts` (copy `pt.ts` as
   a template; replace messages with translated strings).
2. **Register it** in `packages/app/src/translations/rhdh/index.ts`:
   ```ts
   export const rhdhTranslations = createTranslationResource({
     ref: rhdhTranslationRef,
     translations: {
       // …existing…
       ja: () => import('./ja') as any,
     },
   });
   ```
3. **Expose it** in [`app-config.yaml`](../app-config.yaml):
   ```yaml
   i18n:
     locales:
       - en
       - pt
       - ja
     defaultLocale: en
   ```
4. **For each dynamic plugin that ships translations**, add the
   locale to its `translations: { … }` map.

## Troubleshooting

**A menu item shows the translation key (`menuItem.myThing`)
instead of text** — the translation resource for that plugin didn't
register, or the key isn't present in the active locale's message
file. Check:

- `translationResources:` is present in the plugin's `pluginConfig`.
- The `importName` matches the actual named export.
- The key exists in the active locale's message file (and in the
  English ref if it's an `rhdh/` key).

**The fallback text shows even after switching locales** — the
plugin's translation resource didn't load for that locale. Check the
network tab for the `/api/translations/*` request; check the
browser console for `translation resource not found` warnings.

**Settings → Language picker is empty / only shows English** —
`i18n.locales:` in `app-config.yaml` lists only `en`. Add the
locales you want to expose.

## Reading list

- [Backstage i18n / `core-plugin-api/alpha` translation API](https://backstage.io/docs/plugins/internationalization)
- `@red-hat-developer-hub/backstage-plugin-translations` (npm) —
  serves the static + dynamic translation bundles.
- [`packages/app/src/translations/rhdh/`](../packages/app/src/translations/)
  — the in-app reference implementation.
- [`DYNAMIC_PLUGINS_ARCHITECTURE.md`](DYNAMIC_PLUGINS_ARCHITECTURE.md)
  § "Translations" — where this fits in the dynamic-plugin contract.
