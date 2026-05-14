/*
 * This file was originally copied from Red Hat Developer Hub sources:
 * https://github.com/redhat-developer/rhdh/blob/main/packages/backend/src/corporate-proxy.ts
 * 
 * License: Apache-2.0 (compatible with this project’s license)* 
 * 
 */
// Copyright 2024 The Janus IDP Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import { bootstrap } from 'global-agent';
import { Agent, Dispatcher, ProxyAgent, setGlobalDispatcher } from 'undici';
import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';

// Create a logger to cover logging static initialization tasks
const staticLogger = WinstonLogger.create({
  meta: { service: 'corporate-proxy' },
});

/**
 * Adds support for corporate proxy to both 'node-fetch' (using 'global-agent') and native 'fetch' (using 'undici') packages.
 *
 * Ref: https://github.com/backstage/backstage/blob/master/contrib/docs/tutorials/help-im-behind-a-corporate-proxy.md
 */
export function configureCorporateProxyAgent() {
  // Bootstrap global-agent, which addresses node-fetch proxy-ing.
  // global-agent purposely uses namespaced env vars to prevent conflicting behavior with other libraries,
  // but user can set GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE to an empty value for global-agent to use
  // the conventional HTTP_PROXY, HTTPS_PROXY and NO_PROXY environment variables.
  // More details in https://github.com/gajus/global-agent#what-is-the-reason-global-agentbootstrap-does-not-use-http_proxy
  bootstrap();

  // Configure the undici package, which sets things up for the native 'fetch'.
  // EnvHttpProxyAgent was removed in undici v7. Use ProxyAgent and read env vars explicitly.
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const proxyUri = httpsProxy || httpProxy;
  const noProxyEnv = process.env.NO_PROXY || process.env.no_proxy;

  // Only set a ProxyAgent if a proxy is configured via environment variables.
  if (proxyUri) {
    const proxyAgent = new ProxyAgent(proxyUri);
    const directAgent = new Agent();

    // Prepare NO_PROXY rules
    const rules = parseNoProxy(noProxyEnv);

    // If there are no NO_PROXY rules, take the simple/fast path and always use the proxy
    if (rules.length === 0) {
      staticLogger.info('Adding corporate proxy support');
      setGlobalDispatcher(proxyAgent);
      return;
    }

    staticLogger.info('Adding corporate proxy and no_proxy support');
    // Create a composite dispatcher that chooses based on NO_PROXY
    class NoProxyAwareDispatcher extends Dispatcher {
      dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
        try {
          const origin = options.origin;
          const url = typeof origin === 'string' ? new URL(origin) : origin instanceof URL ? origin : undefined;
          const hostname = url?.hostname;

          if (hostname && matchesNoProxy(hostname, rules)) {
            return directAgent.dispatch(options, handler);
          }
        } catch {
          // In case of any parsing errors, fallback to proxy
        }
        return proxyAgent.dispatch(options, handler);
      }
    }

    setGlobalDispatcher(new NoProxyAwareDispatcher());
  }
}

// Helpers
function parseNoProxy(input?: string): string[] {
  if (!input) return [];
  return input
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function matchesNoProxy(hostname: string, rules: string[]): boolean {
  // Normalize hostname (strip brackets for IPv6)
  const host = hostname.replace(/^\[(.*)\]$/, '$1');

  for (const ruleRaw of rules) {
    const rule = ruleRaw.toLowerCase();
    if (rule === '*') return true;

    // If rule contains port, drop it (e.g., example.com:8080)
    const [ruleHost] = rule.split(':');

    // Exact match
    if (host.toLowerCase() === ruleHost) return true;

    // Leading dot or wildcard means suffix match
    if (ruleHost.startsWith('.')) {
      if (host.toLowerCase().endsWith(ruleHost)) return true;
    } else if (ruleHost.startsWith('*.')) {
      const suffix = ruleHost.slice(1); // '.*.example.com' => '.example.com'
      if (host.toLowerCase().endsWith(suffix)) return true;
    }

    // Also support plain suffix without dot (best-effort)
    if (host.toLowerCase().endsWith('.' + ruleHost)) return true;
  }
  return false;
}