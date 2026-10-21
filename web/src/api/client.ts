import { createLegacyZhClient } from './legacyZhClient';
import { createMockClient } from './mockClient';
import { probe } from './request';
import type { ApiClient, ApiMode } from './types';
import { createV1Client } from './v1Client';

export interface ProbeResult {
  client: ApiClient;
  mode: ApiMode;
  /** 自动探测失败的原因，展示在状态面板里 */
  probeError?: string;
}

function envMode(): ApiMode | 'auto' {
  const raw = String(import.meta.env.VITE_API_MODE ?? 'auto').toLowerCase();
  return raw === 'v1' || raw === 'legacy' || raw === 'mock' ? raw : 'auto';
}

export async function createClient(): Promise<ProbeResult> {
  const mode = envMode();
  if (mode === 'mock') return { client: createMockClient(), mode: 'mock' };
  if (mode === 'v1') return { client: createV1Client(), mode: 'v1' };
  if (mode === 'legacy') return { client: createLegacyZhClient(), mode: 'legacy' };

  if (await probe('/api/v1/health')) {
    return { client: createV1Client(), mode: 'v1' };
  }
  if (await probe('/health')) {
    return { client: createLegacyZhClient(), mode: 'legacy' };
  }
  return {
    client: createMockClient(),
    mode: 'mock',
    probeError: '未检测到 v1 或兼容模式服务，已进入离线演示',
  };
}

export function mockClient(): ApiClient {
  return createMockClient();
}
