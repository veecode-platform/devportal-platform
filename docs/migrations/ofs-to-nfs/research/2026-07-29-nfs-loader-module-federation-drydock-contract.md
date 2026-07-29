# Backstage 1.53/NFS: discovery, Module Federation e contrato do Drydock

**Data:** 2026-07-29
**Status:** investigação técnica; nenhum arquivo de produto foi alterado por esta investigação.
**Escopo:** fontes primárias do Backstage `v1.53.0` e evidência local disponível no `devportal-platform`.

## Conclusão executiva

Há dois caminhos diferentes que costumam ser chamados de “discovery” no NFS:

1. **Discovery estático do app:** o `@backstage/cli` inspeciona as dependências do pacote do app, gera `window['__@backstage/discovered__']` e o `@backstage/frontend-defaults` transforma os exports em features. Nesse caminho, `exports["./alpha"]` é um entrypoint de pacote que pode ser importado pelo host.
2. **Carregamento dinâmico da frota:** o backend escaneia `dynamicPlugins.rootDirectory`, publica um catálogo HTTP de remotes e seus artefatos MF, e o frontend precisa instalar explicitamente `dynamicFrontendFeaturesLoader()` para baixar e materializar as features.

Portanto, `app.packages: all`, a existência de `./alpha` e a presença de um pacote no diretório de plugins são sinais diferentes. Nenhum deles, isoladamente, prova que um plugin NFS dinâmico foi carregado no browser.

Para o Drydock, o target NFS deve ser uma cadeia de evidências — fonte, artefato, backend, loader/frontend e comportamento no browser — em vez de um único teste de presença de `/alpha`.

## 1. Discovery e loading no frontend

### 1.1 Discovery estático: `app.packages` e `./alpha`

No Backstage 1.53, o `@backstage/cli` constrói um módulo de discovery a partir das dependências do pacote host. A implementação oficial:

- lê `app.packages` da configuração;
- percorre as dependências do `package.json` do host;
- considera pacotes cujo `backstage.role` seja `frontend-plugin` ou `frontend-plugin-module`;
- inclui o entrypoint principal;
- se `packageJson.exports["./alpha"]` existir, inclui também o subpath `${dependencyName}/alpha`;
- gera `window['__@backstage/discovered__']` com objetos `{ name, export?, default }`.

Fontes primárias:

- [`packageDetection.ts` no Backstage v1.53](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/cli-module-build/src/lib/bundler/packageDetection.ts), especialmente as linhas 55–123.
- [`discovery.ts` do `frontend-defaults`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-defaults/src/discovery.ts), linhas 22–93.
- [Documentação oficial de package metadata](https://backstage.io/docs/tooling/package-metadata/), que descreve `exports` como os entrypoints públicos do pacote.

O `frontend-defaults` lê o global gerado pelo CLI, filtra pelo escopo de `app.packages` e aceita apenas objetos que sejam `FrontendPlugin`, `FrontendModule` ou `FrontendFeatureLoader`. Depois, `createApp()` resolve os loaders e monta a árvore final com o `appPlugin` incluído.

- [`createApp.tsx` no Backstage v1.53](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-defaults/src/createApp.tsx), linhas 101–119.
- [`createFrontendFeatureLoader.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-plugin-api/src/wiring/createFrontendFeatureLoader.ts), linhas 42–121, para o contrato do loader e a validação por `$$type`.

Consequência prática: `./alpha` não é uma URL de runtime nem uma convenção universal de filesystem. Ele é um subpath exportado pelo `package.json`. A simples presença do campo não garante que o valor exportado seja uma feature válida.

### 1.2 Carregamento dinâmico da frota

O pacote oficial [`@backstage/frontend-dynamic-feature-loader`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/README.md) é experimental no v1.53. Ele é o companion frontend do serviço backend de dynamic features e precisa ser instalado no app como feature loader:

```ts
import { dynamicFrontendFeaturesLoader } from '@backstage/frontend-dynamic-feature-loader';

const app = createApp({
  features: [dynamicFrontendFeaturesLoader()],
});
```

O loader oficial faz, em essência, o seguinte:

1. Se não houver configuração `dynamicPlugins`, retorna sem carregar features dinâmicas.
2. Busca `/.backstage/dynamic-features/remotes` no `backend.baseUrl`.
3. Inicializa o runtime de Module Federation do host e carrega suas shared dependencies.
4. Para cada remote, combina `remoteInfo.name` com cada item de `exposedModules`.
5. Carrega `.` pelo nome do remote e submódulos por `remoteName/exposedModuleName`.
6. Aceita somente o `default` export cujo `$$type` seja `@backstage/FrontendPlugin` ou `@backstage/FrontendModule`.

Fonte primária:

- [`loader.ts` no Backstage v1.53](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/src/loader.ts), linhas 45–57, 68–87, 95–190 e 195–203.

O README oficial descreve o fluxo de publicação como `backstage-cli package bundle` seguido da cópia do bundle para o diretório de dynamic plugins. Isso é diferente de fazer o host importar um pacote normal pela sua dependência npm.

Fonte primária:

- [`README.md` do frontend dynamic feature loader](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/README.md), linhas 0–32.

### 1.3 O que o backend dinâmico realmente publica

Quando `dynamicPlugins.rootDirectory` está configurado, o `dynamicPluginsFeatureLoader()` adiciona, entre outros componentes, o frontend remotes server e o backend feature discovery loader.

- [`features.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/src/features/features.ts), linhas 42–67.
- [`plugin-scanner.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/src/scanner/plugin-scanner.ts), linhas 75–183, para a descoberta dos diretórios e validação de `package.json`, `main` e `backstage.role`.
- [`plugin-manager.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/src/manager/plugin-manager.ts), linhas 121–156 e 229–251, para a classificação de plugins frontend.

Para plugins frontend, o manager registra metadados; ele não executa o JavaScript do frontend dentro do processo Node. O router de remotes localiza o `dist/mf-manifest.json`, valida o manifesto, resolve o remote entry e serve os assets.

- [`router.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/src/server/router.ts), linhas 28–180.
- [`frontendRemotesServer.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/src/server/frontendRemotesServer.ts), linhas 36–80 e 97–163.

## 2. `./alpha`: o que ele prova e o que não prova

### No caminho estático

`exports["./alpha"]` prova que o pacote declara um entrypoint alpha público. O CLI pode incluí-lo no bundle do app e o NFS pode validá-lo como feature se o default export tiver o contrato correto.

Isso é observável no artefato fonte/publicado por:

- `package.json.exports["./alpha"]`;
- o target resolvido pelo export;
- o default export carregado;
- `default.$$type`, que deve ser o de uma feature NFS válida.

### No caminho dinâmico

O loader dinâmico não descobre `./alpha` lendo o `package.json` do host. Ele recebe `exposedModules` do endpoint backend e carrega os nomes expostos pelo remote MF. Um manifesto pode expor `.` e `alpha`; nesse caso, o loader tenta respectivamente `remoteName` e `remoteName/alpha`.

Esse comportamento está coberto diretamente pelos testes oficiais do loader:

- [`loader.test.tsx` no Backstage v1.53](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/src/loader.test.tsx), cenário de `exposedModules: ['.', 'alpha']` e manifesto com `exposes` para `.` e `alpha`, linhas 419–518.

Logo, para um plugin dinâmico, a evidência equivalente a `./alpha` é a combinação:

```text
package.json / backstage.role
        -> dist/mf-manifest.json
        -> exposes: [".", "alpha", ...]
        -> remote entry + chunks disponíveis
        -> remoteName[/alpha] carregável
        -> default export com $$type NFS
```

A presença de `exports["./alpha"]` no pacote de origem pode ser relevante para o build, mas não substitui a inspeção do manifesto e do remote publicado.

## 3. Standard Module Federation

### 3.1 Contrato upstream do Backstage

O caminho oficial de Standard Module Federation usa:

- build host e build remote providos pelo CLI;
- `remoteEntry.js` e, no fluxo atual, `mf-manifest.json` no remote;
- runtime de Module Federation para criar o host e carregar remotes;
- uma tabela de shared dependencies gerada pelo host.

Fontes primárias:

- [Documentação oficial de Module Federation no frontend system](https://backstage.io/docs/frontend-system/building-apps/module-federation/), especialmente as seções de host/remote, build, runtime e feature loaders.
- [`moduleFederation.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/cli-module-build/src/lib/bundler/moduleFederation.ts), linhas 34–190.
- [`defaults.ts` do `module-federation-common`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/module-federation-common/src/defaults.ts), linhas 17–98.
- [`loadModuleFederationHostShared.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/module-federation-common/src/loadModuleFederationHostShared.ts), linhas 22–64.
- [`types.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/module-federation-common/src/types.ts), linhas 16–86.

O host injeta o global `window['__@backstage/module_federation_shared_dependencies__']` com `version: 'v1'`. O runtime pré-carrega as bibliotecas indicadas, constrói o shared scope e falha — ou chama o handler configurado — quando a versão do contrato não é suportada.

O build de remote deriva seus exposes dos entrypoints públicos e usa análise de tipo para evitar expor entrypoints que não sejam features NFS. A configuração padrão do bundle usa `remoteEntry.js`, nome sanitizado e shared dependencies compatíveis.

Fonte primária:

- [`config.ts` do CLI](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/cli-module-build/src/lib/bundler/config.ts), linhas 167–184.
- [`moduleFederation.ts` do CLI](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/cli-module-build/src/lib/bundler/moduleFederation.ts), linhas 34–75.

### 3.2 Papel de `@backstage/plugin-app`

`@backstage/plugin-app` é o plugin NFS que fornece extensões centrais da aplicação. Ele não é o transporte de Module Federation nem o dynamic feature loader.

- [`plugin.ts` do `@backstage/plugin-app`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/plugins/app/src/plugin.ts), linhas 44–73, declara `appPlugin` com `createFrontendPlugin()` e suas extensões.
- [`package.json` do plugin app](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/plugins/app/package.json), linhas 1–27, mostra o papel `frontend-plugin` e os exports `.` e `./alpha`.
- [`createApp.tsx`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-defaults/src/createApp.tsx), linhas 35–38 e 101–119, mostra que `frontend-defaults` injeta `appPlugin` na aplicação especializada.

O `./alpha` do próprio `plugin-app` é um export específico desse pacote — no v1.53 ele exporta `appModulePublicSignIn` — e não deve ser usado como evidência de que o runtime dinâmico da frota está ativo.

- [`plugins/app/src/alpha/index.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/plugins/app/src/alpha/index.ts), linhas 15–16.

### 3.3 `ENABLE_STANDARD_MODULE_FEDERATION` no repositório local

Nas fontes upstream v1.53 consultadas, não encontrei `ENABLE_STANDARD_MODULE_FEDERATION` como uma chave do Backstage. No `devportal-platform`, ela é uma convenção local.

Em [`packages/backend/src/index.ts`](/home/gio/devportal/devportal-platform/packages/backend/src/index.ts:111), o backend faz o seguinte:

- quando a variável não é `true`, registra um provider no-op para `dynamicPluginsFrontendServiceRef`;
- quando é `true`, deixa o service factory upstream atender a referência e servir os remotes MF.

O comentário local explica que isso preserva o app RHDH antigo, que não usa Standard MF. Portanto:

```text
ENABLE_STANDARD_MODULE_FEDERATION=true
    é necessário para o caminho local do backend
    mas não é suficiente para provar NFS dinâmico
```

Também é necessário que o app frontend instale `dynamicFrontendFeaturesLoader()`, que o plugin tenha os artefatos MF corretos e que o browser consiga materializar a feature. O `dev-next` local ativa a variável em [`package.json`](/home/gio/devportal/devportal-platform/package.json:12), mas o controle NFS atual em [`packages/app-next/src/App.tsx`](/home/gio/devportal/devportal-platform/packages/app-next/src/App.tsx:1) usa `createApp()` sem declarar o dynamic feature loader. Esse controle é, portanto, evidência de boot/discovery NFS estático, não ainda uma prova da frota dinâmica OCI/MF.

## 4. Contrato observável recomendado para um target NFS do Drydock

O Drydock não precisa tratar todos os detalhes internos como uma API pública, mas precisa capturar os pontos que mudam o resultado operacional. A proposta abaixo separa readiness em gates independentes.

| Gate | O que observar | Resultado que pode ser declarado |
| --- | --- | --- |
| `source-ready` | `package.json`, `backstage.role`, `main`, `exports`, incluindo `./alpha` quando declarado; target resolvível; default export com `$$type` NFS | O pacote fonte declara uma feature NFS consumível pelo caminho estático |
| `artifact-ready` | bundle publicado, `dist/mf-manifest.json`, `name`, `metaData.remoteEntry.name`, `exposes`, remote entry, chunks e assets referenciados | O artefato publicado contém o contrato MF esperado |
| `backend-ready` | diretório encontrado pelo scanner; role/main aceitos; endpoint `/.backstage/dynamic-features/remotes`; URL de cada remote e manifesto respondendo | O backend reconhece e publica o plugin como remote |
| `frontend-ready` | `dynamicFrontendFeaturesLoader()` instalado; endpoint consumido; shared runtime `v1`; remote e módulos expostos carregados; default export com `$$type` válido | O frontend materializa a feature NFS |
| `browser-ready` | extensão, rota, navegação, entity tab ou outro comportamento observável produzido pelo plugin | O plugin foi consumido pela árvore do app, e não apenas baixado |
| `migration-ready` | gates acima + cenários de configuração, compatibilidade entre plugins, regressões e evidência de cobertura | O plugin está pronto para o modo NFS escolhido |

### 4.1 Evidência de identidade e declaração

Para cada alvo, o harness deveria guardar pelo menos:

- nome do pacote, versão e digest/identidade do artefato;
- `package.json` observado e `backstage.role`;
- `main` e `exports` resolvidos;
- commit/build que produziu o pacote;
- configuração do host usada no teste;
- modo observado (`static-nfs`, `dynamic-nfs` ou legado) e timestamp.

`exports["./alpha"]` deve ser uma observação própria, com três estados: ausente, presente mas não resolvível, ou presente e resolvível para uma feature NFS. Não deve ser convertido automaticamente em “plugin NFS verde”.

Há uma ressalva importante para pacotes empacotados: o pipeline oficial de bundle pode reescrever o `package.json` do artefato e apontar `main` para `./dist/remoteEntry.js`, removendo o mapa de `exports` usado no pacote de desenvolvimento. Por isso o Drydock deve distinguir **metadados de origem** de **metadados do bundle publicado** e, no segundo caso, privilegiar o manifesto MF e os assets realmente servidos.

Fontes primárias do empacotamento:

- [`entryPoints.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/cli-module-build/src/lib/entryPoints.ts), linhas 25–45.
- [`productionPack.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/cli-module-build/src/lib/packager/productionPack.ts), no trecho que normaliza os entrypoints e o `main` do bundle.

### 4.2 Evidência do artefato MF

Para um plugin frontend dinâmico, o target deve validar sem executar ainda a aplicação:

1. `dist/mf-manifest.json` existe e é JSON válido.
2. `name` existe no manifesto.
3. `metaData.remoteEntry.name` existe e aponta para um asset presente.
4. `exposes` é um array válido.
5. Cada módulo que o plugin declara, incluindo `alpha` quando aplicável, tem uma entrada coerente no manifesto.
6. O remote entry, chunks e assets CSS/estáticos referenciados são publicáveis e servíveis.
7. As shared dependencies declaradas são compatíveis com o host testado.

O contrato HTTP que o backend expõe é formalizado pelo OpenAPI oficial:

- [`schema/openapi.yaml`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/src/schema/openapi.yaml), linhas 17–94 e 138–153.

O objeto retornado para cada remote contém `packageName`, `remoteInfo` — com `name`, `entry` e campos opcionais de global/scope/type — e `exposedModules`. Essa resposta é uma fronteira melhor para o Drydock do que inferir o comportamento a partir do nome de arquivos no OCI.

### 4.3 Evidência do backend e do frontend

O teste de backend deve verificar a resposta real de `/.backstage/dynamic-features/remotes`, não só a existência de `dynamicPlugins.rootDirectory`. Para cada item retornado, o harness deve conseguir:

- resolver o `entry`;
- baixar o manifesto/remote entry;
- confirmar que os módulos declarados em `exposedModules` são carregáveis;
- registrar logs/erros de scan, manifesto e asset.

O teste de frontend deve observar a execução do loader oficial. O teste mínimo de runtime é:

```text
GET remotes
  -> initialize MF host
  -> preload shared dependencies
  -> load remote module(s)
  -> validate default.$$type
  -> resolve feature into app
  -> observe behavior in browser
```

O último passo é necessário: boot sem crash ou HTTP 200 do `remoteEntry.js` não prova que a feature foi registrada nem que suas extensões funcionam.

## 5. Falhas que o target deve distinguir

O harness deve preservar a causa, em vez de reduzir todas as falhas a “plugin incompatível”. Pelo menos estas classes são distintas:

- `no-dynamic-config`: não há `dynamicPlugins`; o loader oficial não consulta o endpoint.
- `package-not-discovered`: o scanner não encontrou o diretório, `main` ou `backstage.role`.
- `manifest-missing-or-invalid`: manifesto ausente ou sem `name`, remote entry ou `exposes` válidos.
- `remote-asset-missing`: o manifesto existe, mas o remote entry/chunk/asset não está disponível.
- `exposed-module-load-failed`: o remote abre, mas `remoteName` ou `remoteName/alpha` falha.
- `invalid-feature-export`: o módulo carrega, mas o default não possui `$$type` NFS aceito.
- `shared-runtime-incompatible`: o host não possui o global esperado, a versão do protocolo não é `v1` ou as dependências compartilhadas não podem ser carregadas.
- `frontend-loader-absent`: o backend publica o remote, mas o app não instalou `dynamicFrontendFeaturesLoader()`.
- `browser-behavior-failed`: a feature foi carregada, mas a extensão/rota/comportamento esperado não apareceu.

Os testes oficiais cobrem ainda o comportamento de ausência de configuração, caminho feliz, módulos expostos adicionais, remote entry JavaScript e respostas 404:

- [`loader.test.tsx`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/src/loader.test.tsx), linhas 178–218, 219–297, 419–620.

## 6. Implicação para o trabalho do Drydock

O próximo desenho do Drydock deveria declarar um alvo NFS com observações explícitas, por exemplo:

```text
target: nfs
mode: static | dynamic
sourceEntrypoints: [".", "./alpha"]
featureTypes: ["@backstage/FrontendPlugin", "@backstage/FrontendModule"]
bundle: { manifest, remoteEntry, exposes, assets }
backend: { remotesUrl, packageName, remoteInfo, exposedModules }
host: { dynamicLoaderInstalled, sharedRuntimeVersion, sharedLibraries }
runtime: { loadedModules, featureIds, browserEvidence }
provenance: { packageVersion, digest, buildCommit, configDigest }
coverage: source | artifact | backend | frontend | browser
```

O atual `app-next` local deve ser rotulado como **controle NFS estático** até que o app inclua o loader dinâmico e o teste passe pela cadeia de remotes. Isso não diminui o valor do controle: ele isola a migração do shell e da descoberta estática. Apenas evita atribuir a ele uma cobertura que ainda não foi exercitada.

O alvo NFS não deve substituir o mecanismo existente de resolução OFS por uma heurística mais ampla de `/alpha`. O `/alpha` do caminho estático e o `alpha` exposto pelo manifesto MF são sinais relacionados, mas pertencem a contratos diferentes e devem ser registrados separadamente.

## Fontes primárias consultadas

- [Backstage v1.53.0 changelog](https://backstage.io/docs/releases/v1.53.0-changelog/)
- [Frontend system: Module Federation](https://backstage.io/docs/frontend-system/building-apps/module-federation/)
- [Frontend system: migration](https://backstage.io/docs/frontend-system/building-apps/migrating/)
- [`@backstage/frontend-dynamic-feature-loader` README](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/README.md)
- [`frontend-dynamic-feature-loader/src/loader.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/src/loader.ts)
- [`frontend-dynamic-feature-loader/src/loader.test.tsx`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-dynamic-feature-loader/src/loader.test.tsx)
- [`frontend-defaults/src/discovery.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-defaults/src/discovery.ts)
- [`frontend-defaults/src/createApp.tsx`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/frontend-defaults/src/createApp.tsx)
- [`cli-module-build/src/lib/bundler/packageDetection.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/cli-module-build/src/lib/bundler/packageDetection.ts)
- [`cli-module-build/src/lib/bundler/moduleFederation.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/cli-module-build/src/lib/bundler/moduleFederation.ts)
- [`module-federation-common`](https://github.com/backstage/backstage/tree/v1.53.0/packages/module-federation-common)
- [`backend-dynamic-feature-service/README.md`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/README.md)
- [`backend-dynamic-feature-service/src/server/router.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/src/server/router.ts)
- [`backend-dynamic-feature-service/src/schema/openapi.yaml`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/packages/backend-dynamic-feature-service/src/schema/openapi.yaml)
- [`plugins/app/package.json`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/plugins/app/package.json)
- [`plugins/app/src/plugin.ts`](https://raw.githubusercontent.com/backstage/backstage/v1.53.0/plugins/app/src/plugin.ts)
