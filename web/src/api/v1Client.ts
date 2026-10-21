import { requestJson } from './request';
import type {
  ApiClient,
  HealthInfo,
  LabelInfo,
  ModelList,
  PredictRequest,
  PredictResponse,
} from './types';

export function createV1Client(): ApiClient {
  return {
    mode: 'v1',
    async health(): Promise<HealthInfo> {
      const { data } = await requestJson<HealthInfo>('/api/v1/health');
      return data;
    },
    async models(): Promise<ModelList> {
      const { data } = await requestJson<ModelList>('/api/v1/models');
      return data;
    },
    async labels(): Promise<LabelInfo[]> {
      const { data } = await requestJson<{ labels: LabelInfo[] }>('/api/v1/labels');
      return data.labels;
    },
    async predict(req: PredictRequest, signal?: AbortSignal): Promise<PredictResponse> {
      const { data, roundTripMs } = await requestJson<PredictResponse>(
        '/api/v1/predict',
        {
          method: 'POST',
          body: JSON.stringify({
            model: req.model,
            text: req.text,
            modality: req.modality ?? 'auto',
            top_k: req.top_k ?? 10,
            threshold: req.threshold ?? null,
            return_tokens: req.return_tokens ?? false,
          }),
        },
        signal,
      );
      return { ...data, roundtrip_ms: roundTripMs, latency_source: 'server' };
    },
  };
}
