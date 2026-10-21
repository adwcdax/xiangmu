import type {
  AppData,
  CalibrationData,
  CasesData,
  DatasetData,
  DomainShiftData,
  LoadResult,
  MetaData,
  RaceTrace,
  ResultsData,
} from './types';
import { VALIDATORS } from './validate';
import { fallbackData } from './fallback';

type DataFile =
  | 'meta.json'
  | 'dataset.json'
  | 'results.json'
  | 'calibration.json'
  | 'domain_shift.json'
  | 'cases.json'
  | 'race_trace.json';

type DataBase =
  | 'data'
  | 'data/scenarios/only-fasttext'
  | 'data/scenarios/multi-model'
  | 'data/scenarios/no-confusion'
  | 'data/scenarios/no-calibration-bins'
  | 'data/scenarios/no-score-dist'
  | 'data/scenarios/saturated-demo';

const REQUIRED: DataFile[] = [
  'meta.json',
  'dataset.json',
  'results.json',
  'calibration.json',
  'domain_shift.json',
  'cases.json',
];

/**
 * 数据文件只允许来自仓库内置目录。
 * 这里为每个场景写死字面量路径，避免 ?data= 或任何运行时输入变成任意地址请求。
 */
const FETCHERS: Record<DataBase, Record<DataFile, () => Promise<Response>>> = {
  data: {
    'meta.json': () => fetch('data/meta.json', { cache: 'no-store' }),
    'dataset.json': () => fetch('data/dataset.json', { cache: 'no-store' }),
    'results.json': () => fetch('data/results.json', { cache: 'no-store' }),
    'calibration.json': () => fetch('data/calibration.json', { cache: 'no-store' }),
    'domain_shift.json': () => fetch('data/domain_shift.json', { cache: 'no-store' }),
    'cases.json': () => fetch('data/cases.json', { cache: 'no-store' }),
    'race_trace.json': () => fetch('data/race_trace.json', { cache: 'no-store' }),
  },
  'data/scenarios/only-fasttext': {
    'meta.json': () => fetch('data/scenarios/only-fasttext/meta.json', { cache: 'no-store' }),
    'dataset.json': () => fetch('data/scenarios/only-fasttext/dataset.json', { cache: 'no-store' }),
    'results.json': () => fetch('data/scenarios/only-fasttext/results.json', { cache: 'no-store' }),
    'calibration.json': () => fetch('data/scenarios/only-fasttext/calibration.json', { cache: 'no-store' }),
    'domain_shift.json': () => fetch('data/scenarios/only-fasttext/domain_shift.json', { cache: 'no-store' }),
    'cases.json': () => fetch('data/scenarios/only-fasttext/cases.json', { cache: 'no-store' }),
    'race_trace.json': () => fetch('data/scenarios/only-fasttext/race_trace.json', { cache: 'no-store' }),
  },
  'data/scenarios/multi-model': {
    'meta.json': () => fetch('data/scenarios/multi-model/meta.json', { cache: 'no-store' }),
    'dataset.json': () => fetch('data/scenarios/multi-model/dataset.json', { cache: 'no-store' }),
    'results.json': () => fetch('data/scenarios/multi-model/results.json', { cache: 'no-store' }),
    'calibration.json': () => fetch('data/scenarios/multi-model/calibration.json', { cache: 'no-store' }),
    'domain_shift.json': () => fetch('data/scenarios/multi-model/domain_shift.json', { cache: 'no-store' }),
    'cases.json': () => fetch('data/scenarios/multi-model/cases.json', { cache: 'no-store' }),
    'race_trace.json': () => fetch('data/scenarios/multi-model/race_trace.json', { cache: 'no-store' }),
  },
  'data/scenarios/no-confusion': {
    'meta.json': () => fetch('data/scenarios/no-confusion/meta.json', { cache: 'no-store' }),
    'dataset.json': () => fetch('data/scenarios/no-confusion/dataset.json', { cache: 'no-store' }),
    'results.json': () => fetch('data/scenarios/no-confusion/results.json', { cache: 'no-store' }),
    'calibration.json': () => fetch('data/scenarios/no-confusion/calibration.json', { cache: 'no-store' }),
    'domain_shift.json': () => fetch('data/scenarios/no-confusion/domain_shift.json', { cache: 'no-store' }),
    'cases.json': () => fetch('data/scenarios/no-confusion/cases.json', { cache: 'no-store' }),
    'race_trace.json': () => fetch('data/scenarios/no-confusion/race_trace.json', { cache: 'no-store' }),
  },
  'data/scenarios/no-calibration-bins': {
    'meta.json': () => fetch('data/scenarios/no-calibration-bins/meta.json', { cache: 'no-store' }),
    'dataset.json': () => fetch('data/scenarios/no-calibration-bins/dataset.json', { cache: 'no-store' }),
    'results.json': () => fetch('data/scenarios/no-calibration-bins/results.json', { cache: 'no-store' }),
    'calibration.json': () => fetch('data/scenarios/no-calibration-bins/calibration.json', { cache: 'no-store' }),
    'domain_shift.json': () => fetch('data/scenarios/no-calibration-bins/domain_shift.json', { cache: 'no-store' }),
    'cases.json': () => fetch('data/scenarios/no-calibration-bins/cases.json', { cache: 'no-store' }),
    'race_trace.json': () => fetch('data/scenarios/no-calibration-bins/race_trace.json', { cache: 'no-store' }),
  },
  'data/scenarios/no-score-dist': {
    'meta.json': () => fetch('data/scenarios/no-score-dist/meta.json', { cache: 'no-store' }),
    'dataset.json': () => fetch('data/scenarios/no-score-dist/dataset.json', { cache: 'no-store' }),
    'results.json': () => fetch('data/scenarios/no-score-dist/results.json', { cache: 'no-store' }),
    'calibration.json': () => fetch('data/scenarios/no-score-dist/calibration.json', { cache: 'no-store' }),
    'domain_shift.json': () => fetch('data/scenarios/no-score-dist/domain_shift.json', { cache: 'no-store' }),
    'cases.json': () => fetch('data/scenarios/no-score-dist/cases.json', { cache: 'no-store' }),
    'race_trace.json': () => fetch('data/scenarios/no-score-dist/race_trace.json', { cache: 'no-store' }),
  },
  'data/scenarios/saturated-demo': {
    'meta.json': () => fetch('data/scenarios/saturated-demo/meta.json', { cache: 'no-store' }),
    'dataset.json': () => fetch('data/scenarios/saturated-demo/dataset.json', { cache: 'no-store' }),
    'results.json': () => fetch('data/scenarios/saturated-demo/results.json', { cache: 'no-store' }),
    'calibration.json': () => fetch('data/scenarios/saturated-demo/calibration.json', { cache: 'no-store' }),
    'domain_shift.json': () => fetch('data/scenarios/saturated-demo/domain_shift.json', { cache: 'no-store' }),
    'cases.json': () => fetch('data/scenarios/saturated-demo/cases.json', { cache: 'no-store' }),
    'race_trace.json': () => fetch('data/scenarios/saturated-demo/race_trace.json', { cache: 'no-store' }),
  },
};

/** 演示内置的场景数据目录；不接受任意 URL。 */
const SCENARIOS: Record<string, DataBase> = {
  'only-fasttext': 'data/scenarios/only-fasttext',
  'multi-model': 'data/scenarios/multi-model',
  'no-confusion': 'data/scenarios/no-confusion',
  'no-calibration-bins': 'data/scenarios/no-calibration-bins',
  'no-score-dist': 'data/scenarios/no-score-dist',
  'saturated-demo': 'data/scenarios/saturated-demo',
};

async function fetchJson(
  loader: () => Promise<Response>,
  label: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await loader();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: `${label}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** 一次加载整套必需文件：要么全部成功，要么返回错误列表，避免不同来源的数据混用。 */
async function loadRequired(base: DataBase): Promise<{ loaded: Record<string, unknown>; errors: string[] }> {
  const loaded: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const file of REQUIRED) {
    const path = `${base}/${file}`;
    const loader = FETCHERS[base][file];
    if (!loader) {
      errors.push(`${path}: 未配置数据加载器`);
      continue;
    }
    const res = await fetchJson(loader, path);
    if (!res.ok) {
      errors.push(`${path}: ${res.error}`);
      continue;
    }
    const fileErrors = VALIDATORS[file](res.data);
    if (fileErrors.length) {
      errors.push(`${path} 校验失败：${fileErrors.join('; ')}`);
      continue;
    }
    loaded[file] = res.data;
  }
  return { loaded, errors };
}

export async function loadData(): Promise<LoadResult> {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('data');
  const scenarioBase = requested ? SCENARIOS[requested] ?? null : null;
  const warnings: string[] = [];
  let loaded: Record<string, unknown> = {};
  let failedFiles: string[] = [];
  let fallbackReason = '';
  let usedScenarioFallback = false;

  if (scenarioBase) {
    const primary = await loadRequired(scenarioBase);
    if (primary.errors.length === 0) {
      loaded = primary.loaded;
    } else {
      console.error('[dataLoader] 场景数据加载失败，回退到默认数据', primary.errors);
      usedScenarioFallback = true;
      const fallback = await loadRequired('data');
      loaded = fallback.loaded;
      failedFiles = REQUIRED.filter((file) => !(file in fallback.loaded));
      fallbackReason = `场景数据加载失败，已回退到默认数据${
        failedFiles.length ? `；默认数据也缺失：${failedFiles.join('、')}` : ''
      }`;
    }
  } else {
    const primary = await loadRequired('data');
    loaded = primary.loaded;
    failedFiles = REQUIRED.filter((file) => !(file in primary.loaded));
    if (primary.errors.length) console.error('[dataLoader] 数据文件加载失败', primary.errors);
    if (failedFiles.length) {
      fallbackReason = `部分数据校验失败，已使用样例数据：${failedFiles.join('、')}`;
    }
  }

  // race_trace 可选：场景模式下不拿默认数据顶替，避免把别的场景的牌组混进来。
  let race: RaceTrace | null = null;
  let raceError = '';
  const raceBase: DataBase = scenarioBase && !usedScenarioFallback ? scenarioBase : 'data';
  const racePath = `${raceBase}/race_trace.json`;
  const raceRes = await fetchJson(FETCHERS[raceBase]['race_trace.json'], racePath);
  if (!raceRes.ok) {
    raceError = `${racePath}: ${raceRes.error}`;
  } else {
    const errors = VALIDATORS['race_trace.json'](raceRes.data);
    if (errors.length) {
      raceError = `${racePath} 校验失败：${errors.join('; ')}`;
      console.error('[dataLoader] race_trace.json 校验失败', errors);
    } else {
      race = raceRes.data as RaceTrace;
    }
  }
  if (!race) {
    warnings.push('race_trace.json 缺失或校验失败，S6 分拣赛已降级为静态堆叠条。');
    if (raceError) console.warn(`[dataLoader] ${raceError}`);
  }

  const fallbackDetail = failedFiles.length
    ? `以下数据文件加载失败，已使用内置兜底数据：${failedFiles.join('、')}`
    : fallbackReason;
  const fb = fallbackData(fallbackDetail || '数据加载失败');

  const data: AppData = {
    meta: (loaded['meta.json'] as MetaData) ?? fb.meta,
    dataset: (loaded['dataset.json'] as DatasetData) ?? fb.dataset,
    results: (loaded['results.json'] as ResultsData) ?? fb.results,
    calibration: (loaded['calibration.json'] as CalibrationData) ?? fb.calibration,
    domainShift: (loaded['domain_shift.json'] as DomainShiftData) ?? fb.domainShift,
    cases: (loaded['cases.json'] as CasesData) ?? fb.cases,
    race,
    warnings: [],
  };

  if (fallbackReason) {
    data.fallback = {
      files: failedFiles,
      reason: fallbackReason,
    };
    warnings.push(fallbackReason);
  }

  // real 模式混入 mock 文件时，页面不能把样例数当真结果展示。
  const mockFiles = [
    { name: 'meta.json', value: data.meta.mock },
    { name: 'dataset.json', value: data.dataset?.mock },
    { name: 'results.json', value: data.results?.mock },
    { name: 'calibration.json', value: data.calibration?.mock },
    { name: 'domain_shift.json', value: data.domainShift?.mock },
    { name: 'cases.json', value: data.cases?.mock },
    { name: 'race_trace.json', value: data.race?.mock },
  ];
  const realWithMock = data.meta.data_mode === 'real' && mockFiles.some((file) => file.value === true);
  if (realWithMock) {
    const flagged = mockFiles.filter((file) => file.value === true).map((file) => file.name);
    const reason = `meta.data_mode 为 real，但 ${flagged.join('、')} 仍带 mock: true；已强制按样例数据展示。`;
    warnings.push(reason);
    data.fallback = { files: flagged, reason };
  }

  // 内置兜底文件本身就是样例数据，强制显示水印。
  if (failedFiles.length > 0 || realWithMock) {
    data.meta = { ...data.meta, data_mode: 'mock', mock: true };
  }
  if (data.meta.data_mode === 'real' && data.race === null) {
    warnings.push('real 模式下缺少 race_trace.json，分拣赛不可用。');
  }

  data.warnings = warnings;
  return { data, failedFiles };
}
