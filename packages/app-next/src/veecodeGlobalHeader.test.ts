import {
  veecodeGlobalHeaderModule,
  veecodeToggleThemeExtension,
} from './veecodeGlobalHeader';

describe('VeeCode global header NFS extension', () => {
  it('registers the local theme toggle component extension', () => {
    expect(veecodeToggleThemeExtension).toMatchObject({
      kind: 'gh-component',
      name: 'veecode-toggle-theme',
    });
    expect(veecodeGlobalHeaderModule).toBeDefined();
  });
});
