/**
 * 校验 public/data 与 public/data/scenarios 下的全部数据文件。
 * 运行：npm run validate
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkConsistency, validateFile } from '../src/core/validate.ts';

const FILES = [
  'meta.json',
  'dataset.json',
  'results.json',
  'calibration.json',
  'domain_shift.json',
  'cases.json',
  'race_trace.json',
];
const dataRoot = join(process.cwd(), 'public', 'data');
const scenarioRoot = join(dataRoot, 'scenarios');

interface DatasetReport {
  dir: string;
  errors: string[];
  warnings: string[];
}

function validateDir(dir: string): DatasetReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const payload: Record<string, unknown> = {};

  for (const file of FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      errors.push(`${file}: 文件缺失`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      errors.push(`${file}: JSON 解析失败（${err instanceof Error ? err.message : String(err)}）`);
      continue;
    }
    const fileErrors = validateFile(file, raw);
    if (fileErrors.length) {
      errors.push(...fileErrors.map((message) => `${file}: ${message}`));
    }
    payload[file] = raw;
  }

  if (errors.length === 0) {
    const consistency = checkConsistency(payload);
    errors.push(...consistency.errors);
    warnings.push(...consistency.warnings);
  }

  return { dir, errors, warnings };
}

if (!existsSync(dataRoot)) {
  console.error(`✗ 数据目录不存在：${dataRoot}`);
  process.exit(1);
}

const dirs = [dataRoot];
if (existsSync(scenarioRoot)) {
  for (const name of readdirSync(scenarioRoot).sort()) {
    const dir = join(scenarioRoot, name);
    if (existsSync(join(dir, 'meta.json'))) dirs.push(dir);
  }
}

const reports = dirs.map(validateDir);
let failed = 0;
let warningCount = 0;

for (const report of reports) {
  const label = relative(process.cwd(), report.dir).replace(/\\/g, '/');
  if (report.errors.length) {
    failed += 1;
    console.error(`✗ ${label}`);
    for (const message of report.errors) console.error(`  - ${message}`);
  } else {
    console.log(`✓ ${label}`);
  }
  if (report.warnings.length) {
    warningCount += report.warnings.length;
    for (const message of report.warnings) console.warn(`  ! ${message}`);
  }
}

console.log('');
console.log(`${reports.length - failed} 个数据集通过，${failed} 个失败，${warningCount} 条警告。`);
if (failed > 0) process.exit(1);
