import { glob } from "glob";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

const PACKAGE_JSON_GLOB = "**/package.json";
const IGNORE_GLOB = ["**/node_modules/**", "**/dist-dynamic/**"];

const ROOT_DIR = path.join(__dirname, "../../..");
const DYNAMIC_PLUGINS_DIR = path.join(ROOT_DIR, "dynamic-plugins/wrappers");
const APP_CONFIG_DYNAMIC_PLUGINS_CONFIG_FILE = path.join(
  ROOT_DIR,
  "app-config.dynamic-plugins.yaml",
);

type WrapperFrontendPackageJson = {
  name: string;
  backstage: {
    role: "frontend-plugin";
  };
  scalprum: {
    name: string;
  };
  repository: {
    directory: string;
  };
};

type WrapperBackendPackageJson = {
  name: string;
  backstage: {
    role: "backend-plugin" | "backend-plugin-module";
  };
  repository: {
    directory: string;
  };
};

type WrapperPackageJson =
  | WrapperFrontendPackageJson
  | WrapperBackendPackageJson;

type DynamicPluginAppConfig = {
  dynamicPlugins?: { frontend?: Record<string, unknown> };
};

function isFrontendPlugin(
  packageJson: WrapperPackageJson,
): packageJson is WrapperFrontendPackageJson {
  return packageJson.backstage.role === "frontend-plugin";
}

function isBackendPlugin(
  packageJson: WrapperPackageJson,
): packageJson is WrapperBackendPackageJson {
  return (
    packageJson.backstage.role === "backend-plugin" ||
    packageJson.backstage.role === "backend-plugin-module"
  );
}

function parseYamlFile<T>(filePath: string): T {
  return yaml.parse(fs.readFileSync(filePath).toString());
}

describe("Dynamic Plugin Wrappers", () => {
  const wrapperPackageJsonPaths = glob.sync(PACKAGE_JSON_GLOB, {
    cwd: DYNAMIC_PLUGINS_DIR, // Search only within DYNAMIC_PLUGINS_DIR
    ignore: IGNORE_GLOB,
  });

  const wrapperDirNames = wrapperPackageJsonPaths.map(path.dirname);

  const wrapperPackageJsonFiles = wrapperPackageJsonPaths.map(
    (packageJsonPath) => {
      const packageJson = fs.readFileSync(
        path.join(DYNAMIC_PLUGINS_DIR, packageJsonPath),
      );
      return JSON.parse(packageJson.toString()) as WrapperPackageJson;
    },
  );
  const frontendPackageJsonFiles = wrapperPackageJsonFiles.filter(
    (packageJson) => isFrontendPlugin(packageJson),
  );
  const backendPackageJsonFiles = wrapperPackageJsonFiles.filter(
    (packageJson) => isBackendPlugin(packageJson),
  );

  describe("Backend Plugin", () => {
    it.each(backendPackageJsonFiles)(
      "$name should have a `-dynamic` suffix in the directory name",
      ({ name, repository }) => {
        const hasDynamicSuffix = wrapperPackageJsonPaths.some((value) =>
          value.includes(`${name}-dynamic`),
        );
        expect(hasDynamicSuffix).toBeTruthy();
        expect(repository.directory).toBe(
          `dynamic-plugins/wrappers/${name}-dynamic`,
        );
      },
    );
  });

  describe("Frontend Plugin", () => {
    it.each(frontendPackageJsonFiles)(
      "$name should have a matching directory name",
      ({ name, repository }) => {
        const hasMatchingDirName = wrapperPackageJsonPaths.some((value) =>
          value.includes(name),
        );
        expect(hasMatchingDirName).toBeTruthy();
        expect(repository.directory).toBe(`dynamic-plugins/wrappers/${name}`);
      },
    );

    it.each(frontendPackageJsonFiles)(
      "should have scalprum config in the `package.json`",
      ({ scalprum }) => {
        expect(scalprum).toBeTruthy();
      },
    );
  });

  describe("(app-config.dynamic-plugins.yaml) should have a valid config", () => {
    const config = parseYamlFile<DynamicPluginAppConfig>(
      APP_CONFIG_DYNAMIC_PLUGINS_CONFIG_FILE,
    );

    it.each(frontendPackageJsonFiles)(
      "$scalprum.name should exist in the config",
      ({ scalprum }) => {
        expect(
          Object.keys(config?.dynamicPlugins?.frontend ?? {}).includes(
            scalprum.name,
          ),
        ).toBeTruthy();
      },
    );
  });

});
