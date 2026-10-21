/** 数据契约校验：运行时加载器与 scripts/validate_data.ts 共用同一套规则。 */

export type Json = Record<string, unknown>;
export type Validator = (raw: unknown) => string[];

export interface ConsistencyReport {
  errors: string[];
  warnings: string[];
}

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function isCI(v: unknown): v is [number, number] | null {
  return v === null || (Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]));
}

function checkMockFlag(raw: Json, path: string, errors: string[]): void {
  if (raw.mock !== undefined && typeof raw.mock !== 'boolean') {
    errors.push(`${path}.mock: 应为布尔值`);
  }
}

function checkClassId(v: unknown, path: string, errors: string[]): void {
  if (!isNum(v) || v < 0 || v > 9 || !Number.isInteger(v)) {
    errors.push(`${path}: 应为 0 至 9 的整数`);
  }
}

function checkClassCounts(v: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(v) || v.length !== 10) {
    errors.push(`${path}: 应为长度 10 的数组`);
    return;
  }
  v.forEach((n, i) => {
    if (!isNum(n) || n < 0) errors.push(`${path}[${i}]: 应为非负数字`);
  });
}

export const validateMeta: Validator = (raw) => {
  const errors: string[] = [];
  if (!isObj(raw)) return ['meta: 应为对象'];
  if (raw.data_mode !== 'mock' && raw.data_mode !== 'real') {
    errors.push('meta.data_mode: 应为 "mock" 或 "real"');
  }
  if (raw.data_mode === 'real') {
    if (!isStr(raw.frozen_at) || !raw.frozen_at) errors.push('meta.frozen_at: real 模式下必填');
    if (!isStr(raw.git_commit) || !raw.git_commit) errors.push('meta.git_commit: real 模式下必填');
  }
  if (!isStr(raw.hardware)) errors.push('meta.hardware: 应为字符串');
  if (!isStr(raw.model_file)) errors.push('meta.model_file: 应为字符串');
  if (!isNum(raw.seed)) errors.push('meta.seed: 应为数字');
  if (!isStr(raw.corpus_note)) errors.push('meta.corpus_note: 应为字符串');
  checkMockFlag(raw, 'meta', errors);
  return errors;
};

export const validateDataset: Validator = (raw) => {
  const errors: string[] = [];
  if (!isObj(raw)) return ['dataset: 应为对象'];
  if (!isNum(raw.total)) errors.push('dataset.total: 应为数字');
  if (!Array.isArray(raw.classes) || raw.classes.length !== 10) {
    errors.push('dataset.classes: 应为长度 10 的数组');
  } else {
    raw.classes.forEach((c, i) => {
      const p = `dataset.classes[${i}]`;
      if (!isObj(c)) return errors.push(`${p}: 应为对象`);
      checkClassId(c.id, `${p}.id`, errors);
      for (const k of ['name', 'short']) {
        if (!isStr(c[k]) || !c[k]) errors.push(`${p}.${k}: 应为非空字符串`);
      }
      if (!isNum(c.total)) errors.push(`${p}.total: 应为数字`);
      if (typeof c.is_fraud !== 'boolean') errors.push(`${p}.is_fraud: 应为布尔值`);
    });
  }
  if (!isObj(raw.modality)) {
    errors.push('dataset.modality: 应为对象');
  } else {
    for (const k of ['sms', 'dialog']) {
      if (!isNum(raw.modality[k])) errors.push(`dataset.modality.${k}: 应为数字`);
    }
  }
  if (raw.modality_by_class !== null) {
    if (!isObj(raw.modality_by_class)) {
      errors.push('dataset.modality_by_class: 应为对象或 null');
    } else {
      checkClassCounts(raw.modality_by_class.sms, 'dataset.modality_by_class.sms', errors);
      checkClassCounts(raw.modality_by_class.dialog, 'dataset.modality_by_class.dialog', errors);
    }
  }
  if (!isObj(raw.splits)) {
    errors.push('dataset.splits: 应为对象');
  } else {
    if (!isStr(raw.splits.rule)) errors.push('dataset.splits.rule: 应为字符串');
    for (const part of ['train', 'dev', 'test']) {
      const p = `dataset.splits.${part}`;
      if (!isObj(raw.splits[part])) {
        errors.push(`${p}: 应为对象`);
      } else {
        if (!isNum(raw.splits[part].rows)) errors.push(`${p}.rows: 应为数字`);
        checkClassCounts(raw.splits[part].class_counts, `${p}.class_counts`, errors);
      }
    }
  }
  if (!isObj(raw.integrity)) {
    errors.push('dataset.integrity: 应为对象');
  } else {
    if (!isNum(raw.integrity.duplicate_rate)) errors.push('dataset.integrity.duplicate_rate: 应为数字');
    if (!isNum(raw.integrity.cross_split_groups)) errors.push('dataset.integrity.cross_split_groups: 应为数字');
    if (!isStr(raw.integrity.source_sha256)) errors.push('dataset.integrity.source_sha256: 应为字符串');
  }
  if (!isObj(raw.length)) {
    errors.push('dataset.length: 应为对象');
  } else {
    if (!isNum(raw.length.median)) errors.push('dataset.length.median: 应为数字');
    if (raw.length.p90 !== null && !isNum(raw.length.p90)) errors.push('dataset.length.p90: 应为数字或 null');
  }
  checkMockFlag(raw, 'dataset', errors);
  return errors;
};

export const validateResults: Validator = (raw) => {
  const errors: string[] = [];
  if (!isObj(raw)) return ['results: 应为对象'];
  if (!Array.isArray(raw.models) || raw.models.length === 0) {
    errors.push('results.models: 应为非空数组');
  } else {
    raw.models.forEach((m, i) => {
      const p = `results.models[${i}]`;
      if (!isObj(m)) return errors.push(`${p}: 应为对象`);
      if (!isStr(m.id) || !m.id) errors.push(`${p}.id: 应为非空字符串`);
      if (!isStr(m.name) || !m.name) errors.push(`${p}.name: 应为非空字符串`);
      if (!['verified', 'partial', 'missing'].includes(String(m.status))) {
        errors.push(`${p}.status: 应为 verified / partial / missing`);
      }
      if (m.test !== null) {
        if (!isObj(m.test)) {
          errors.push(`${p}.test: 应为对象或 null`);
        } else {
          const t = m.test;
          for (const k of ['n', 'accuracy', 'weighted_f1', 'top2_accuracy']) {
            if (!isNum(t[k])) errors.push(`${p}.test.${k}: 应为数字`);
          }
          if (!isObj(t.macro_f1) || !isNum(t.macro_f1.value) || !isCI(t.macro_f1.ci)) {
            errors.push(`${p}.test.macro_f1: 需要 value 与 ci[2] 或 null`);
          }
          if (!isObj(t.binary)) {
            errors.push(`${p}.test.binary: 应为对象`);
          } else {
            for (const k of ['accuracy', 'fraud_f1', 'macro_f1']) {
              if (!isNum(t.binary[k])) errors.push(`${p}.test.binary.${k}: 应为数字`);
            }
          }
          if (!Array.isArray(t.per_class) || t.per_class.length !== 10) {
            errors.push(`${p}.test.per_class: 应为长度 10 的数组`);
          } else {
            t.per_class.forEach((c, j) => {
              const cp = `${p}.test.per_class[${j}]`;
              if (!isObj(c)) return errors.push(`${cp}: 应为对象`);
              checkClassId(c.id, `${cp}.id`, errors);
              for (const k of ['precision', 'recall', 'f1', 'top2', 'support']) {
                if (!isNum(c[k])) errors.push(`${cp}.${k}: 应为数字`);
              }
            });
          }
          if (t.confusion !== null) {
            if (!Array.isArray(t.confusion) || t.confusion.length !== 10) {
              errors.push(`${p}.test.confusion: 应为 10×10 数组或 null`);
            } else {
              t.confusion.forEach((row, r) => {
                if (!Array.isArray(row) || row.length !== 10) {
                  errors.push(`${p}.test.confusion[${r}]: 应为长度 10 的数组`);
                } else {
                  row.forEach((n, c) => {
                    if (!isNum(n) || n < 0) errors.push(`${p}.test.confusion[${r}][${c}]: 应为非负数字`);
                  });
                }
              });
            }
          }
          if (!isObj(t.top_confusions)) errors.push(`${p}.test.top_confusions: 应为对象`);
        }
      }
      if (m.cost !== null) {
        if (!isObj(m.cost)) {
          errors.push(`${p}.cost: 应为对象或 null`);
        } else {
          for (const k of ['train_seconds', 'model_size_mb', 'threads']) {
            if (!isNum(m.cost[k])) errors.push(`${p}.cost.${k}: 应为数字`);
          }
          if (m.cost.predict_ms_per_item !== null && !isNum(m.cost.predict_ms_per_item)) {
            errors.push(`${p}.cost.predict_ms_per_item: 应为数字或 null`);
          }
        }
      }
    });
  }
  if (!Array.isArray(raw.baselines)) {
    errors.push('results.baselines: 应为数组');
  } else {
    raw.baselines.forEach((b, i) => {
      if (!isObj(b) || !isStr(b.id) || !isStr(b.name) || !isNum(b.accuracy)) {
        errors.push(`results.baselines[${i}]: 字段不完整`);
      }
    });
  }
  if (!Array.isArray(raw.split_sensitivity)) {
    errors.push('results.split_sensitivity: 应为数组');
  } else {
    raw.split_sensitivity.forEach((s, i) => {
      if (!isObj(s) || !isStr(s.split) || !isStr(s.name) || !isNum(s.accuracy) || !isNum(s.macro_f1)) {
        errors.push(`results.split_sensitivity[${i}]: 字段不完整`);
      }
    });
  }
  checkMockFlag(raw, 'results', errors);
  return errors;
};

export const validateCalibration: Validator = (raw) => {
  const errors: string[] = [];
  if (!isObj(raw)) return ['calibration: 应为对象'];
  if (!isStr(raw.split)) errors.push('calibration.split: 应为字符串');
  if (!isNum(raw.n)) errors.push('calibration.n: 应为数字');
  for (const side of ['before', 'after_isotonic']) {
    if (!isObj(raw[side])) {
      errors.push(`calibration.${side}: 应为对象`);
      continue;
    }
    for (const k of ['ece', 'brier', 'pr_auc']) {
      if (!isNum(raw[side][k])) errors.push(`calibration.${side}.${k}: 应为数字`);
    }
  }
  if (raw.reliability !== null) {
    if (!Array.isArray(raw.reliability)) {
      errors.push('calibration.reliability: 应为数组或 null');
    } else {
      raw.reliability.forEach((b, i) => {
        if (!isObj(b) || !isNum(b.bin) || !isNum(b.mean_p) || !isNum(b.actual) || !isNum(b.n)) {
          errors.push(`calibration.reliability[${i}]: 字段不完整`);
        }
      });
    }
  }
  if (raw.score_hist !== null) {
    if (!Array.isArray(raw.score_hist)) {
      errors.push('calibration.score_hist: 应为数组或 null');
    } else {
      raw.score_hist.forEach((b, i) => {
        if (!isObj(b) || !isNum(b.lo) || !isNum(b.hi) || !isNum(b.n) || !isNum(b.fraud_rate)) {
          errors.push(`calibration.score_hist[${i}]: 字段不完整`);
        }
      });
    }
  }
  if (!isObj(raw.high_band)) {
    errors.push('calibration.high_band: 应为对象');
  } else {
    for (const k of ['threshold', 'share', 'fraud_rate']) {
      if (!isNum(raw.high_band[k])) errors.push(`calibration.high_band.${k}: 应为数字`);
    }
  }
  checkMockFlag(raw, 'calibration', errors);
  return errors;
};

export const validateDomainShift: Validator = (raw) => {
  const errors: string[] = [];
  if (!isObj(raw)) return ['domain_shift: 应为对象'];
  if (!isStr(raw.target)) errors.push('domain_shift.target: 应为字符串');
  if (!isNum(raw.n_benign)) errors.push('domain_shift.n_benign: 应为数字');
  if (!isNum(raw.n_fraud)) errors.push('domain_shift.n_fraud: 应为数字');
  if (!Array.isArray(raw.models) || raw.models.length === 0) {
    errors.push('domain_shift.models: 应为非空数组');
  } else {
    raw.models.forEach((m, i) => {
      const p = `domain_shift.models[${i}]`;
      if (!isObj(m)) return errors.push(`${p}: 应为对象`);
      for (const k of ['id', 'name']) {
        if (!isStr(m[k]) || !m[k]) errors.push(`${p}.${k}: 应为非空字符串`);
      }
      for (const k of ['fp_rate', 'recall', 'gap']) {
        if (!isNum(m[k])) errors.push(`${p}.${k}: 应为数字`);
      }
    });
  }
  if (raw.score_dist !== null) {
    if (!isObj(raw.score_dist)) {
      errors.push('domain_shift.score_dist: 应为对象或 null');
    } else {
      for (const side of ['A', 'B']) {
        if (!isObj(raw.score_dist[side])) {
          errors.push(`domain_shift.score_dist.${side}: 应为对象`);
          continue;
        }
        for (const k of ['benign', 'fraud']) {
          const arr = raw.score_dist[side][k];
          if (!Array.isArray(arr) || arr.length !== 10) {
            errors.push(`domain_shift.score_dist.${side}.${k}: 应为长度 10 的数组`);
          }
        }
      }
    }
  }
  if (!isStr(raw.history_note)) errors.push('domain_shift.history_note: 应为字符串');
  checkMockFlag(raw, 'domain_shift', errors);
  return errors;
};

function validateCaseBase(d: Json, p: string, errors: string[]): void {
  if (!isStr(d.id) || !d.id) errors.push(`${p}.id: 应为非空字符串`);
  if (d.modality !== 'sms' && d.modality !== 'dialog') errors.push(`${p}.modality: 应为 sms 或 dialog`);
  if (!isStr(d.text) || !d.text) errors.push(`${p}.text: 应为非空字符串`);
  if (d.turns !== null) {
    if (!Array.isArray(d.turns)) {
      errors.push(`${p}.turns: 应为数组或 null`);
    } else {
      d.turns.forEach((t, i) => {
        if (!isObj(t) || !isStr(t.role) || !isStr(t.text)) errors.push(`${p}.turns[${i}]: 字段不完整`);
      });
    }
  }
  checkClassId(d.label, `${p}.label`, errors);
  if (!isObj(d.pred)) {
    errors.push(`${p}.pred: 应为对象`);
  } else {
    checkClassId(d.pred.label, `${p}.pred.label`, errors);
    if (!isNum(d.pred.p_fraud)) errors.push(`${p}.pred.p_fraud: 应为数字`);
    if (!Array.isArray(d.pred.top_k)) errors.push(`${p}.pred.top_k: 应为数组`);
    else {
      d.pred.top_k.forEach((t, i) => {
        if (!isObj(t)) return errors.push(`${p}.pred.top_k[${i}]: 应为对象`);
        checkClassId(t.id, `${p}.pred.top_k[${i}].id`, errors);
        if (!isNum(t.prob)) errors.push(`${p}.pred.top_k[${i}].prob: 应为数字`);
      });
    }
  }
  if (!Array.isArray(d.cues)) {
    errors.push(`${p}.cues: 应为数组`);
  } else {
    d.cues.forEach((c, i) => {
      if (!isObj(c) || !isNum(c.start) || !isNum(c.end) || !isStr(c.kind)) {
        errors.push(`${p}.cues[${i}]: 字段不完整`);
      }
    });
  }
  if (!isStr(d.tag)) errors.push(`${p}.tag: 应为字符串`);
}

export const validateCases: Validator = (raw) => {
  const errors: string[] = [];
  if (!isObj(raw)) return ['cases: 应为对象'];
  if (!Array.isArray(raw.demo)) {
    errors.push('cases.demo: 应为数组');
  } else {
    raw.demo.forEach((d, i) => {
      if (!isObj(d)) return errors.push(`cases.demo[${i}]: 应为对象`);
      validateCaseBase(d, `cases.demo[${i}]`, errors);
    });
  }
  if (!Array.isArray(raw.errors)) {
    errors.push('cases.errors: 应为数组');
  } else {
    raw.errors.forEach((e, i) => {
      if (!isObj(e)) return errors.push(`cases.errors[${i}]: 应为对象`);
      validateCaseBase(e, `cases.errors[${i}]`, errors);
      if (!isStr(e.note)) errors.push(`cases.errors[${i}].note: 应为字符串`);
    });
  }
  if (!Array.isArray(raw.out_of_domain)) {
    errors.push('cases.out_of_domain: 应为数组');
  } else {
    raw.out_of_domain.forEach((o, i) => {
      const p = `cases.out_of_domain[${i}]`;
      if (!isObj(o)) return errors.push(`${p}: 应为对象`);
      if (!isStr(o.id) || !o.id) errors.push(`${p}.id: 应为非空字符串`);
      if (!isStr(o.text) || !o.text) errors.push(`${p}.text: 应为非空字符串`);
      if (o.label !== 'benign' && o.label !== 'fraud') errors.push(`${p}.label: 应为 benign 或 fraud`);
      if (!isNum(o.p_fraud)) errors.push(`${p}.p_fraud: 应为数字`);
      if (!isStr(o.note)) errors.push(`${p}.note: 应为字符串`);
    });
  }
  checkMockFlag(raw, 'cases', errors);
  return errors;
};

export const validateRace: Validator = (raw) => {
  const errors: string[] = [];
  if (!isObj(raw)) return ['race_trace: 应为对象'];
  if (!isObj(raw.deck)) return ['race_trace.deck: 应为对象'];
  const deck = raw.deck;
  for (const k of ['ids', 'labels', 'modality', 'titles', 'texts']) {
    if (!Array.isArray(deck[k])) errors.push(`race_trace.deck.${k}: 应为数组`);
  }
  if (Array.isArray(deck.ids)) {
    if (!isNum(deck.size)) errors.push('race_trace.deck.size: 应为数字');
    else if (deck.ids.length !== deck.size) errors.push('race_trace.deck.ids: 长度应等于 deck.size');
    for (const k of ['labels', 'modality', 'titles', 'texts']) {
      if (Array.isArray(deck[k]) && deck[k].length !== deck.ids.length) {
        errors.push(`race_trace.deck.${k}: 长度应与 ids 一致`);
      }
    }
    if (Array.isArray(deck.labels)) {
      deck.labels.forEach((l, i) => checkClassId(l, `race_trace.deck.labels[${i}]`, errors));
    }
    if (Array.isArray(deck.modality)) {
      deck.modality.forEach((m, i) => {
        if (m !== 'sms' && m !== 'dialog') errors.push(`race_trace.deck.modality[${i}]: 应为 sms/dialog`);
      });
    }
  }
  if (!Array.isArray(raw.dealers)) {
    errors.push('race_trace.dealers: 应为数组');
  } else {
    raw.dealers.forEach((d, i) => {
      const p = `race_trace.dealers[${i}]`;
      if (!isObj(d)) return errors.push(`${p}: 应为对象`);
      if (!isStr(d.model_id)) errors.push(`${p}.model_id: 应为字符串`);
      if (d.mode !== 'multiclass' && d.mode !== 'binary') errors.push(`${p}.mode: 应为 multiclass 或 binary`);
      if (!['verified', 'partial', 'missing'].includes(String(d.status))) {
        errors.push(`${p}.status: 应为 verified / partial / missing`);
      }
      if (!Array.isArray(d.preds)) errors.push(`${p}.preds: 应为数组`);
      else if (Array.isArray(deck.ids) && d.preds.length !== deck.ids.length) {
        errors.push(`${p}.preds: 长度应与 deck.ids 一致`);
      }
      if (d.ms_per_item !== null && !Array.isArray(d.ms_per_item)) {
        errors.push(`${p}.ms_per_item: 应为数组或 null`);
      } else if (Array.isArray(d.ms_per_item) && Array.isArray(deck.ids) && d.ms_per_item.length !== deck.ids.length) {
        errors.push(`${p}.ms_per_item: 长度应与 deck.ids 一致`);
      }
      if (!isNum(d.total_seconds)) errors.push(`${p}.total_seconds: 应为数字`);
      if (!Array.isArray(d.unparsed_idx)) errors.push(`${p}.unparsed_idx: 应为数组`);
      if (Array.isArray(d.preds)) {
        d.preds.forEach((pred, j) => {
          if (pred === 'unparsed') return;
          if (!isNum(pred) || !Number.isInteger(pred) || pred < 0 || pred > 9) {
            errors.push(`${p}.preds[${j}]: 应为 0-9 或 unparsed`);
          } else if (d.mode === 'binary' && pred > 1) {
            errors.push(`${p}.preds[${j}]: binary 泳道只能取 0 / 1`);
          }
        });
      }
    });
  }
  checkMockFlag(raw, 'race_trace', errors);
  return errors;
};

export const VALIDATORS: Record<string, Validator> = {
  'meta.json': validateMeta,
  'dataset.json': validateDataset,
  'results.json': validateResults,
  'calibration.json': validateCalibration,
  'domain_shift.json': validateDomainShift,
  'cases.json': validateCases,
  'race_trace.json': validateRace,
};

export function validateFile(name: string, raw: unknown): string[] {
  const validator = VALIDATORS[name];
  if (!validator) return [`未知数据文件：${name}`];
  return validator(raw);
}

/** 跨文件一致性检查：不改变加载器的容错策略，只用于校验脚本和测试。 */
export function checkConsistency(files: Record<string, unknown>): ConsistencyReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = files['meta.json'];
  const dataset = files['dataset.json'];
  const results = files['results.json'];
  const calibration = files['calibration.json'];
  const domain = files['domain_shift.json'];
  const cases = files['cases.json'];
  const race = files['race_trace.json'];
  if (!isObj(meta) || !isObj(dataset) || !isObj(results) || !isObj(cases)) {
    return { errors, warnings };
  }

  const classes = Array.isArray(dataset.classes) ? dataset.classes.filter(isObj) : [];
  const classTotals = classes.map((c) => (isNum(c.total) ? c.total : 0));
  const total = isNum(dataset.total) ? dataset.total : null;
  if (total !== null && classTotals.length === 10) {
    const sum = classTotals.reduce((a, b) => a + b, 0);
    if (sum !== total) errors.push(`dataset.classes: 各类 total 之和 ${sum} 应等于 dataset.total ${total}`);
  }
  if (isObj(dataset.modality) && total !== null) {
    const { sms, dialog } = dataset.modality;
    if (isNum(sms) && isNum(dialog) && sms + dialog !== total) {
      errors.push('dataset.modality: sms + dialog 应等于 total');
    }
  }
  const splits = isObj(dataset.splits) ? dataset.splits : null;
  if (splits) {
    const parts = ['train', 'dev', 'test'].map((k) => (isObj(splits[k]) ? splits[k] : null));
    if (parts.every((p) => p !== null) && total !== null) {
      const rows = parts.map((p) => (isNum(p!.rows) ? p!.rows : 0));
      if (rows.reduce((a, b) => a + b, 0) !== total) {
        errors.push('dataset.splits: train + dev + test 的 rows 应等于 total');
      }
      parts.forEach((part, idx) => {
        const counts = Array.isArray(part!.class_counts) ? part!.class_counts : [];
        if (counts.length === 10) {
          const sum = counts.reduce((a: number, b: unknown) => a + (isNum(b) ? b : 0), 0);
          if (sum !== rows[idx]) errors.push(`dataset.splits.${['train', 'dev', 'test'][idx]}: class_counts 之和应等于 rows`);
        }
      });
      // 每个类别在三集中的数量之和应等于类别总数
      if (classTotals.length === 10) {
        classTotals.forEach((classTotal, i) => {
          const sum = parts.reduce((acc, p) => acc + (isNum((p!.class_counts as unknown[])[i]) ? ((p!.class_counts as number[])[i]) : 0), 0);
          if (sum !== classTotal) {
            errors.push(`dataset.classes[${i}]: 三个 split 的计数之和 ${sum} 应等于该类总数 ${classTotal}`);
          }
        });
      }
    }
  }

  const models = Array.isArray(results.models) ? results.models.filter(isObj) : [];
  const modelIds = new Set(models.map((m) => String(m.id)));
  const seen = new Set<string>();
  for (const model of models) {
    const id = String(model.id);
    if (seen.has(id)) errors.push(`results.models: 模型 id 重复：${id}`);
    seen.add(id);
    if (model.status === 'verified' && !isObj(model.test)) {
      errors.push(`results.models.${id}: verified 模型缺少 test`);
    }
    const test = model.test;
    if (isObj(test)) {
      const macro = test.macro_f1;
      if (isObj(macro) && isNum(macro.value) && isCI(macro.ci) && macro.ci) {
        if (macro.ci[0] > macro.ci[1]) errors.push(`results.models.${id}.test.macro_f1.ci: 下限大于上限`);
        if (macro.value < macro.ci[0] || macro.value > macro.ci[1]) {
          warnings.push(`results.models.${id}.test.macro_f1: value 不在 CI 内`);
        }
      }
      if (Array.isArray(test.per_class) && test.per_class.length === 10) {
        const f1s = test.per_class.map((c) => (isObj(c) && isNum(c.f1) ? c.f1 : NaN));
        if (f1s.every((v) => Number.isFinite(v))) {
          const mean = f1s.reduce((a, b) => a + b, 0) / 10;
          const macroValue = isObj(test.macro_f1) && isNum(test.macro_f1.value) ? test.macro_f1.value : null;
          if (macroValue !== null && Math.abs(mean - macroValue) > 0.005) {
            warnings.push(`results.models.${id}: per_class 的 F1 均值 ${mean.toFixed(4)} 与 macro_f1 ${macroValue} 相差较大`);
          }
        }
        const supports = test.per_class.map((c) => (isObj(c) && isNum(c.support) ? c.support : 0));
        if (splits && isObj(splits.test) && Array.isArray(splits.test.class_counts)) {
          supports.forEach((s, i) => {
            const expected = (splits.test as Json).class_counts as unknown[];
            if (isNum(expected[i]) && s !== expected[i]) {
              warnings.push(`results.models.${id}.test.per_class[${i}].support ${s} 与测试集该类数量 ${expected[i]} 不一致`);
            }
          });
        }
      }
      if (Array.isArray(test.confusion)) {
        const testRows = splits && isObj(splits.test) && isNum((splits.test as Json).rows) ? ((splits.test as Json).rows as number) : null;
        let matrixSum = 0;
        test.confusion.forEach((row, r) => {
          if (!Array.isArray(row)) return;
          const rowSum = row.reduce((a: number, b: unknown) => a + (isNum(b) ? b : 0), 0);
          matrixSum += rowSum;
          if (Array.isArray(test.per_class) && isObj(test.per_class[r]) && isNum(test.per_class[r].support)) {
            if (rowSum !== test.per_class[r].support) {
              warnings.push(`results.models.${id}.test.confusion[${r}]: 行和 ${rowSum} 与该类 support ${test.per_class[r].support} 不一致`);
            }
          }
        });
        if (testRows !== null && matrixSum !== testRows) {
          warnings.push(`results.models.${id}.test.confusion: 总和 ${matrixSum} 与测试集 ${testRows} 不一致`);
        }
      }
    }
  }

  if (isObj(calibration) && Array.isArray(calibration.score_hist)) {
    const n = isNum(calibration.n) ? calibration.n : null;
    const sum = calibration.score_hist.reduce((a: number, b: unknown) => a + (isObj(b) && isNum(b.n) ? b.n : 0), 0);
    if (n !== null && sum !== n) warnings.push(`calibration.score_hist: 各箱样本数之和 ${sum} 与 n ${n} 不一致`);
  }

  if (isObj(domain) && Array.isArray(domain.models)) {
    domain.models.filter(isObj).forEach((m) => {
      if (isNum(m.recall) && isNum(m.fp_rate) && isNum(m.gap)) {
        if (Math.abs(m.recall - m.fp_rate - m.gap) > 0.002) {
          warnings.push(`domain_shift.models.${String(m.id)}: gap 应约等于 recall - fp_rate`);
        }
      }
    });
  }

  const caseModels = new Set(modelIds);
  const checkCases = (arr: unknown, path: string): void => {
    if (!Array.isArray(arr)) return;
    arr.filter(isObj).forEach((c) => {
      const top = isObj(c.pred) && Array.isArray(c.pred.top_k) ? c.pred.top_k : [];
      const sum = top.reduce((a: number, t: unknown) => a + (isObj(t) && isNum(t.prob) ? t.prob : 0), 0);
      if (top.length > 0 && Math.abs(sum - 1) > 0.05) {
        warnings.push(`${path}.${String(c.id)}.pred.top_k: 概率之和 ${sum.toFixed(3)} 偏离 1`);
      }
      const pred = isObj(c.pred) ? c.pred : null;
      if (pred && isNum(pred.label) && top.length > 0) {
        const sorted = [...top].sort((a: any, b: any) => (isNum(b.prob) ? b.prob : 0) - (isNum(a.prob) ? a.prob : 0));
        if (isObj(sorted[0]) && sorted[0].id !== pred.label) {
          warnings.push(`${path}.${String(c.id)}: pred.label 与 top_k 第一名不一致`);
        }
      }
    });
  };
  checkCases(cases.demo, 'cases.demo');
  checkCases(cases.errors, 'cases.errors');
  void caseModels;

  if (isObj(race)) {
    const deck = race.deck;
    const deckSize = isObj(deck) && isNum(deck.size) ? deck.size : null;
    if (Array.isArray(race.dealers)) {
      race.dealers.filter(isObj).forEach((dealer) => {
        const id = String(dealer.model_id);
        if (!modelIds.has(id)) warnings.push(`race_trace.dealers: 未知模型 ${id}`);
        if (Array.isArray(dealer.preds) && Array.isArray(dealer.unparsed_idx)) {
          const expected = dealer.preds
            .map((pred, index) => (pred === 'unparsed' ? index : -1))
            .filter((index) => index >= 0);
          const actual = dealer.unparsed_idx.filter(isNum);
          if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
            errors.push(`race_trace.dealers.${id}.unparsed_idx: 与 preds 中的 unparsed 位置不一致`);
          }
        }
        if (Array.isArray(dealer.ms_per_item) && deckSize !== null && dealer.ms_per_item.length !== deckSize) {
          errors.push(`race_trace.dealers.${id}.ms_per_item: 长度应等于 deck.size`);
        }
      });
      const deckLabels = isObj(deck) && Array.isArray(deck.labels) ? (deck.labels as number[]) : null;
      if (deckLabels && Array.isArray(race.dealers)) {
        race.dealers.filter(isObj).forEach((dealer) => {
          const id = String(dealer.model_id);
          if (!Array.isArray(dealer.preds) || dealer.mode !== 'multiclass') return;
          let correct = 0;
          dealer.preds.forEach((pred, i) => {
            if (pred === deckLabels[i]) correct += 1;
          });
          if (deckSize && correct / deckSize < 0.4) {
            warnings.push(`race_trace.dealers.${id}: 十分类准确率过低 (${correct}/${deckSize})，检查 mock 数据`);
          }
        });
      }
    }
  }

  const mockFiles: { name: string; value: unknown }[] = [
    { name: 'meta.json', value: meta.mock },
    { name: 'dataset.json', value: dataset.mock },
    { name: 'results.json', value: results.mock },
    { name: 'cases.json', value: cases.mock },
  ];
  if (isObj(calibration)) mockFiles.push({ name: 'calibration.json', value: calibration.mock });
  if (isObj(domain)) mockFiles.push({ name: 'domain_shift.json', value: domain.mock });
  if (isObj(race)) mockFiles.push({ name: 'race_trace.json', value: race.mock });
  if (meta.data_mode === 'real') {
    const flagged = mockFiles.filter((file) => file.value === true).map((file) => file.name);
    if (flagged.length > 0) {
      errors.push(`meta.data_mode 为 real，但以下文件仍有 mock: true：${flagged.join('、')}`);
    }
  } else if (meta.data_mode === 'mock') {
    const missing = mockFiles.filter((file) => file.value !== true).map((file) => file.name);
    if (missing.length > 0) {
      errors.push(`meta.data_mode 为 mock，但以下文件缺少 mock: true：${missing.join('、')}`);
    }
  }

  return { errors, warnings };
}
