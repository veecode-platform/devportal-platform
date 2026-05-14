/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createTranslationMessages } from '@backstage/core-plugin-api/alpha';

import { rhdhTranslationRef } from './ref';

export default createTranslationMessages({
  ref: rhdhTranslationRef,
  full: true, // False means that this is a partial translation
  messages: {
    // Default main menu items from consts.ts
    'menuItem.home': 'Início',
    'menuItem.myGroup': 'Meu Grupo',
    'menuItem.catalog': 'Catálogo',
    'menuItem.apis': 'APIs',
    'menuItem.learningPaths': 'Trilhas de Aprendizado',
    'menuItem.selfService': 'Autoatendimento',
    'menuItem.userSettings': 'Configurações de Usuário',
    'menuItem.administration': 'Administração',
    'menuItem.extensions': 'Extensões',
    // VEECODE
    'menuItem.create': 'Criar',

    // dynamic-plugins.default.main-menu-items
    'menuItem.clusters': 'Clusters',
    'menuItem.rbac': 'RBAC',
    'menuItem.bulkImport': 'Importação em massa',
    'menuItem.docs': 'Documentação',
    'menuItem.lighthouse': 'Lighthouse',
    'menuItem.techRadar': 'Radar Tech',
    'menuItem.orchestrator': 'Orquestrador',
    'menuItem.adoptionInsights': 'Insights de Adoção',
    
    // VEECODE
    'menuItem.notifications': 'Notificações',

    'sidebar.menu': 'Menu',
    'sidebar.home': 'Início',
    'sidebar.homeLogo': 'Logo inicial',
    'sidebar.signOut': 'Sair',

    // SignIn page translations
    'signIn.page.title': 'Selecione um método de login',
    'signIn.providers.auth0.title': 'Auth0',
    'signIn.providers.auth0.message': 'Entrar usando Auth0',
    'signIn.providers.atlassian.title': 'Atlassian',
    'signIn.providers.atlassian.message': 'Entrar usando Atlassian',
    'signIn.providers.bitbucket.title': 'Bitbucket',
    'signIn.providers.bitbucket.message': 'Entrar usando Bitbucket',
    'signIn.providers.bitbucketServer.title': 'Bitbucket Server',
    'signIn.providers.bitbucketServer.message':
      'Entrar usando Bitbucket Server',
    'signIn.providers.github.title': 'GitHub',
    'signIn.providers.github.message': 'Entrar usando GitHub',
    'signIn.providers.gitlab.title': 'GitLab',
    'signIn.providers.gitlab.message': 'Entrar usando GitLab',
    'signIn.providers.keycloak.title': 'Keycloak',
    'signIn.providers.keycloak.message': 'Entrar usando Keycloak',
    'signIn.providers.microsoft.title': 'Azure',
    'signIn.providers.microsoft.message': 'Entrar usando Azure',
    'signIn.providers.google.title': 'Google',
    'signIn.providers.google.message': 'Entrar usando Google',
    'signIn.providers.oidc.title': 'OIDC',
    'signIn.providers.oidc.message': 'Entrar usando OIDC',
    'signIn.providers.okta.title': 'Okta',
    'signIn.providers.okta.message': 'Entrar usando Okta',
    'signIn.providers.onelogin.title': 'OneLogin',
    'signIn.providers.onelogin.message': 'Entrar usando OneLogin',
    'signIn.providers.saml.title': 'SAML',
    'signIn.providers.saml.message': 'Entrar usando SAML',

    // App translations
    'app.scaffolder.title': 'Autoatendimento',
    'app.search.title': 'Buscar',
    'app.search.resultType': 'Tipo de Resultado',
    'app.search.softwareCatalog': 'Catálogo de Software',
    'app.search.filters.kind': 'Tipo',
    'app.search.filters.lifecycle': 'Ciclo de Vida',
    'app.search.filters.component': 'Componente',
    'app.search.filters.template': 'Template',
    'app.search.filters.experimental': 'experimental',
    'app.search.filters.production': 'produção',
    'app.learningPaths.title': 'Trilhas de Aprendizado',
    'app.learningPaths.error.title': 'Não foi possível obter os dados.',
    'app.learningPaths.error.unknownError': 'Erro desconhecido',
    'app.entityPage.diagram.title': 'Diagrama do Sistema',
    'app.userSettings.infoCard.title': 'Metadados VeeCode DevPortal',
    'app.userSettings.infoCard.metadataCopied':
      'Metadados copiados para a área de transferência',
    'app.userSettings.infoCard.copyMetadata':
      'Copiar metadados para a área de transferência',
    'app.userSettings.infoCard.showLess': 'Mostrar menos',
    'app.userSettings.infoCard.showMore': 'Mostrar mais',
    'app.errors.contactSupport': 'Contatar suporte',
    'app.errors.goBack': 'Voltar',
    'app.errors.notFound.message': 'Não foi possível encontrar essa página',
    'app.errors.notFound.additionalInfo':
      'A página que você está procurando pode ter sido removida, renomeada ou está temporariamente indisponível.',
    'app.table.createdAt': 'Criado em',
  },
});
