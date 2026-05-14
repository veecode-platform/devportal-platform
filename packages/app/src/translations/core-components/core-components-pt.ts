import { coreComponentsTranslationRef } from '@backstage/core-components/alpha';
import { createTranslationMessages } from '@backstage/core-plugin-api/alpha';

const pt = createTranslationMessages({
  ref: coreComponentsTranslationRef,
  full: false, // False means that this is a partial translation
  messages: {
    // This is a workaround that ensures that multiple translations
    // of the shared core-components are present that was added over time.
    // See:
    // https://issues.redhat.com/browse/RHDHBUGS-1235
    // https://issues.redhat.com/browse/RHDHBUGS-1976
    //
    // For example, the 'table.header.actions' key was introduced in
    // @backstage/core-component 0.17.3 (part of Backstage 1.40.0)
    // and wasn't there in 0.17.2 (part of Backstage 1.39.0).
    //
    // See:
    // https://github.com/backstage/backstage/blob/v1.39.0/packages/core-components/src/translation.ts#L87-L107
    // https://github.com/backstage/backstage/blob/v1.40.0/packages/core-components/src/translation.ts#L87-L110
    // https://github.com/backstage/versions/blob/main/v1/releases/1.39.0/manifest.json#L80-L83
    // https://github.com/backstage/versions/blob/main/v1/releases/1.40.0/manifest.json#L80-L83
    //
    // This here is a workaround that ensures that at least these translations
    // are available also if different plugins brings their own version of @backstage/core-components.
    //
    // In the future we should make sure that translations of multiple versions of the
    // @backstage/core-components library are merged properly and are shipped with RHDH.
    // We track that change here: https://issues.redhat.com/browse/RHIDP-8836
    //
    // Added in Backstage 1.37
    'table.filter.placeholder': 'Todos os resultados',
    'table.body.emptyDataSourceMessage': 'Nenhum registro para exibir',
    'table.pagination.firstTooltip': 'Primeira Página',
    'table.pagination.labelDisplayedRows': '{from}-{to} de {count}',
    'table.pagination.labelRowsSelect': 'linhas',
    'table.pagination.lastTooltip': 'Última Página',
    'table.pagination.nextTooltip': 'Próxima Página',
    'table.pagination.previousTooltip': 'Página Anterior',
    'table.toolbar.search': 'Filtrar',

    // Changed in Backstage 1.38
    'alertDisplay.message_one': '({{ count }} mensagem mais recente)',
    'alertDisplay.message_other': '({{ count }} mensagens mais recentes)',

    // Added in Backstage 1.40
    'table.header.actions': 'Ações',

    // Added in Backstage 1.41
    'oauthRequestDialog.message':
      'Faça login para permitir que {{appTitle}} acesse as APIs e identidades do {{provider}}.',
  } as any,
});

export default pt;
