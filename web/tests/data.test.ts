import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkConsistency, validateFile } from '../src/core/validate';
import { fallbackData } from '../src/core/fallback';

const DATA_FILES = [
  'meta.json',
  'dataset.json',
  'results.json',
  'calibration.json',
  'domain_shift.json',
  'cases.json',
  'race_trace.json',
];
const dataDir = join(process.cwd(), 'public', 'data');
const scenarioDir = join(dataDir, 'scenarios');

function loadDir(dir: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const file of DATA_FILES) {
    const path = join(dir, file);
    if (existsSync(path)) out[file] = JSON.parse(readFileSync(path, 'utf8'));
  }
  return out;
}

const main = loadDir(dataDir);

describe('数据契约', () => {
  it('主数据七个文件都通过结构校验', () => {
    for (const file of DATA_FILES) {
      expect(validateFile(file, main[file]), file).toEqual([]);
    }
  });

  it('主数据跨文件一致', () => {
    expect(checkConsistency(main).errors).toEqual([]);
  });

  it('全部场景 fixture 通过结构校验与一致性检查', () => {
    const names = readdirSync(scenarioDir).filter((name) => existsSync(join(scenarioDir, name, 'meta.json')));
    expect(names.length).toBeGreaterThanOrEqual(6);
    for (const name of names) {
      const payload = loadDir(join(scenarioDir, name));
      for (const file of DATA_FILES) {
        if (payload[file] === undefined) continue;
        expect(validateFile(file, payload[file]), `${name}/${file}`).toEqual([]);
      }
      expect(checkConsistency(payload).errors, `${name}/consistency`).toEqual([]);
    }
  });

  it('内置兜底数据通过结构校验', () => {
    const fb = fallbackData('test');
    expect(validateFile('meta.json', fb.meta)).toEqual([]);
    expect(validateFile('dataset.json', fb.dataset)).toEqual([]);
    expect(validateFile('results.json', fb.results)).toEqual([]);
    expect(validateFile('calibration.json', fb.calibration)).toEqual([]);
    expect(validateFile('domain_shift.json', fb.domainShift)).toEqual([]);
    expect(validateFile('cases.json', fb.cases)).toEqual([]);
    if (fb.race) expect(validateFile('race_trace.json', fb.race)).toEqual([]);
  });

  it('头条指标与计划锚点一致', () => {
    const results = main['results.json'] as {
      models: {
        id: string;
        test: {
          accuracy: number;
          macro_f1: { value: number };
          weighted_f1: number;
          top2_accuracy: number;
          binary: { accuracy: number; fraud_f1: number };
        };
      }[];
    };
    const model = results.models.find((m) => m.id === 'fasttext');
    expect(model?.test).toBeTruthy();
    expect(model!.test.accuracy).toBeCloseTo(0.8654, 4);
    expect(model!.test.macro_f1.value).toBeCloseTo(0.7365, 4);
    expect(model!.test.weighted_f1).toBeCloseTo(0.8637, 4);
    expect(model!.test.top2_accuracy).toBeCloseTo(0.9397, 4);
    expect(model!.test.binary.accuracy).toBeCloseTo(0.9799, 4);
    expect(model!.test.binary.fraud_f1).toBeCloseTo(0.9833, 4);
  });

  it('十类、总数与切分互相吻合', () => {
    const ds = main['dataset.json'] as {
      total: number;
      classes: { id: number; total: number }[];
      modality: { sms: number; dialog: number };
      splits: { train: { rows: number }; dev: { rows: number }; test: { rows: number } };
    };
    expect(ds.classes).toHaveLength(10);
    expect(ds.classes.map((c) => c.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ds.classes.reduce((sum, c) => sum + c.total, 0)).toBe(ds.total);
    expect(ds.modality.sms + ds.modality.dialog).toBe(ds.total);
    expect(ds.splits.train.rows + ds.splits.dev.rows + ds.splits.test.rows).toBe(ds.total);
  });

  it('校准与域外锚点一致', () => {
    const cal = main['calibration.json'] as {
      before: { ece: number };
      after_isotonic: { ece: number };
      high_band: { threshold: number; share: number; fraud_rate: number };
    };
    expect(cal.before.ece).toBeCloseTo(0.0102, 4);
    expect(cal.after_isotonic.ece).toBeCloseTo(0.0029, 4);
    expect(cal.high_band.threshold).toBeCloseTo(0.9, 4);
    expect(cal.high_band.share).toBeCloseTo(0.586, 4);
    expect(cal.high_band.fraud_rate).toBeCloseTo(0.993, 4);

    const domain = main['domain_shift.json'] as {
      models: { id: string; fp_rate: number; recall: number; gap: number }[];
    };
    const a = domain.models.find((m) => m.id === 'A');
    const b = domain.models.find((m) => m.id === 'B');
    expect(a).toMatchObject({ fp_rate: 0.953, recall: 0.965, gap: 0.012 });
    expect(b).toMatchObject({ fp_rate: 0, recall: 0, gap: 0 });
  });
});

describe('校验器能发现错误', () => {
  it('real 模式缺少冻结信息', () => {
    const meta = structuredClone(main['meta.json']) as Record<string, unknown>;
    meta.data_mode = 'real';
    meta.frozen_at = null;
    meta.git_commit = null;
    const errors = validateFile('meta.json', meta);
    expect(errors.some((e) => e.includes('frozen_at'))).toBe(true);
    expect(errors.some((e) => e.includes('git_commit'))).toBe(true);
  });

  it('模型列表为空', () => {
    const results = structuredClone(main['results.json']) as Record<string, unknown>;
    results.models = [];
    expect(validateFile('results.json', results).some((e) => e.includes('models'))).toBe(true);
  });

  it('real 模式仍带 mock 文件时拦截', () => {
    const meta = structuredClone(main['meta.json']) as Record<string, unknown>;
    meta.data_mode = 'real';
    meta.frozen_at = '2026-10-21T10:00:00Z';
    meta.git_commit = '0123456789abcdef';
    const errors = checkConsistency({ ...main, 'meta.json': meta }).errors;
    expect(errors.some((e) => e.includes('mock: true'))).toBe(true);
  });

  it('mock 模式缺少 mock 标记时拦截', () => {
    const cases = structuredClone(main['cases.json']) as Record<string, unknown>;
    delete cases.mock;
    const errors = checkConsistency({ ...main, 'cases.json': cases }).errors;
    expect(errors.some((e) => e.includes('cases.json') && e.includes('mock'))).toBe(true);
  });

  it('置信区间上下限颠倒', () => {
    const results = structuredClone(main['results.json']) as {
      models: { id: string; test: { macro_f1: { ci: [number, number] | null } } | null }[];
    };
    const model = results.models.find((m) => m.test);
    expect(model).toBeTruthy();
    model!.test!.macro_f1.ci = [0.9, 0.5];
    const errors = checkConsistency({ ...main, 'results.json': results }).errors;
    expect(errors.some((e) => e.includes('macro_f1.ci'))).toBe(true);
  });

  it('发牌预测长度与牌堆不一致', () => {
    const race = structuredClone(main['race_trace.json']) as {
      dealers: { preds: string[] }[];
    };
    race.dealers[0].preds.pop();
    expect(validateFile('race_trace.json', race).some((e) => e.includes('preds'))).toBe(true);
  });

  it('跨文件总数不一致', () => {
    const dataset = structuredClone(main['dataset.json']) as { total: number };
    dataset.total += 1;
    const errors = checkConsistency({ ...main, 'dataset.json': dataset }).errors;
    expect(errors.some((e) => e.includes('dataset'))).toBe(true);
  });

  it('unparsed_idx 与预测结果不一致', () => {
    const race = structuredClone(main['race_trace.json']) as {
      dealers: { model_id: string; mode: string; preds: string[]; unparsed_idx: number[] }[];
    };
    const dealer = race.dealers.find((d) => d.mode === 'multiclass');
    expect(dealer).toBeTruthy();
    dealer!.preds[0] = 'unparsed';
    dealer!.unparsed_idx = [];
    const errors = checkConsistency({ ...main, 'race_trace.json': race }).errors;
    expect(errors.some((e) => e.includes('unparsed_idx'))).toBe(true);
  });
});
