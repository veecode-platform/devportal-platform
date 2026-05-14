import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  githubOrgEntityProviderTransformsExtensionPoint,
  type UserTransformer,
} from '@backstage/plugin-catalog-backend-module-github-org';
import { UserEntity } from '@backstage/catalog-model';

/**
 * Custom user transformer that populates email from GitHub organization verified domain emails
 */
export const verifiedEmailUserTransformer: UserTransformer = async (
  user,
  _ctx,
) => {
  console.log(`[UserTransformer] Processing user: ${user.login}`);
  console.log(`[UserTransformer] User data:`, JSON.stringify({
    login: user.login,
    name: user.name,
    email: (user as any).email,
    organizationVerifiedDomainEmails: user.organizationVerifiedDomainEmails,
    allEmailFields: Object.keys(user).filter(k => k.toLowerCase().includes('email')),
  }, null, 2));
  
  // Create basic user entity
  const entity: UserEntity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: user.login,
      annotations: {
        'github.com/user-login': user.login,
      },
    },
    spec: {
      profile: {
        displayName: user.name || user.login,
        picture: user.avatarUrl,
      },
      memberOf: [],
    },
  };

  // Populate email from organization verified domain emails if available
  if (user.organizationVerifiedDomainEmails?.length) {
    console.log(
      `[UserTransformer] ✅ Found verified email for ${user.login}: ${user.organizationVerifiedDomainEmails[0]}`,
    );
    entity.spec.profile!.email = user.organizationVerifiedDomainEmails[0];
  } else if ((user as any).email) {
    // Fallback to public email if available from provider
    console.log(
      `[UserTransformer] ⚠️  Using public email for ${user.login}: ${(user as any).email}`,
    );
    entity.spec.profile!.email = (user as any).email;
  } else {
    console.warn(
      `[UserTransformer] ❌ No email found for ${user.login}`,
    );
  }

  return entity;
};

/**
 * Backend module that registers custom GitHub Org transformers
 */
export const githubOrgTransformersModule = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'github-org-transformers',
  register(env) {
    env.registerInit({
      deps: {
        githubOrg: githubOrgEntityProviderTransformsExtensionPoint,
      },
      async init({ githubOrg }) {
        githubOrg.setUserTransformer(verifiedEmailUserTransformer);
      },
    });
  },
});
