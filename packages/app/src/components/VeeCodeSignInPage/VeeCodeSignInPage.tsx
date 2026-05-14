import {
  configApiRef,
  IdentityApi,
  SignInPageProps,
  useApi,
} from '@backstage/core-plugin-api';

import { SignInPage } from './SigninPage';
import { createProviders } from '../SignInPage/SignInPage';
import { useTranslation } from '../../hooks/useTranslation';

export const VeeCodeSignInPage: any = (props: SignInPageProps) => {
  const config = useApi(configApiRef);
  const { t } = useTranslation();
  const guest = config.getBoolean('platform.guest.enabled');
  const signInProviders = config.getStringArray('platform.signInProviders');
  const demoGuest = config.getOptionalBoolean('platform.guest.demo');
  
  // Get all available providers using the new createProviders function
  const allProviders = createProviders(t);
  
  // Filter providers based on configuration
  const configuredProviders: Array<any> = [];
  if (signInProviders && signInProviders.length > 0) {
    signInProviders.forEach(provider => {
      const providerConfig = allProviders.get(provider);
      if (providerConfig) {
        configuredProviders.push(providerConfig);
      }
    });
  }

  let signInProvidersList: any[] = [];
  if (guest) {
    if (demoGuest) {
      signInProvidersList = [...configuredProviders, 'guest'];
    } else {
      signInProvidersList = ['guest'];
    }
  } else {
    signInProvidersList = configuredProviders;
  }

  return (
    <SignInPage
      providers={signInProvidersList as any}
      onSignInSuccess={async (identityApi: IdentityApi) => {
        props.onSignInSuccess(identityApi);
      }}
    />
  );
};
