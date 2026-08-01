import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const OUTPUT_FILE = process.env.OUTPUT_FILE || 'comment-body.txt';
const WORKFLOW_RUN_URL = process.env.WORKFLOW_RUN_URL;

const ENGINE_NAMES = {
  'v8': 'V8',
  'v8-harmony': 'V8 --harmony',
  'spidermonkey': 'SpiderMonkey',
  'jsc': 'JSC',
  'xs': 'XS',
  'engine262': 'engine262',
};

function main() {
  const results = loadResults();
  const body = buildCommentBody(results);
  fs.writeFileSync(OUTPUT_FILE, body, 'utf8');
  console.log(`Wrote comment body to ${OUTPUT_FILE}`);
}

function loadResults() {
  const engines = [];
  const testResults = new Map(); // testPath -> { engineKey -> boolean | undefined }

  if (!fs.existsSync(ARTIFACTS_DIR)) {
    return { engines, testResults };
  }

  const files = fs.readdirSync(ARTIFACTS_DIR).filter(
    f => f.startsWith('results-') && f.endsWith('.json')
  );

  for (const file of files) {
    const engineKey = file.slice('results-'.length, -'.json'.length);
    if (!ENGINE_NAMES[engineKey]) {
      console.warn(`Unknown engine key: ${engineKey}`);
      continue;
    }
    engines.push(engineKey);

    const filePath = path.join(ARTIFACTS_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.warn(`Failed to parse ${file}: ${err.message}`);
      continue;
    }

    if (!Array.isArray(data)) {
      console.warn(`Unexpected format in ${file}: expected JSON array`);
      continue;
    }

    for (const test of data) {
      const testPath = test.relative || test.file;
      if (!testPath) {
        continue;
      }
      const normalizedPath = testPath.replace(/^test\//, '');
      if (!testResults.has(normalizedPath)) {
        testResults.set(normalizedPath, {});
      }
      testResults.get(normalizedPath)[engineKey] =
        test.result && test.result.pass === true ? { pass: true } :
        test.result && test.result.pass === false ? { pass: false, message: test.result.message } :
        undefined;
    }
  }

  const orderedEngines = engines.sort();
  return { orderedEngines, testResults };
}

function buildCommentBody({ orderedEngines, testResults }) {
  if (orderedEngines.length === 0) {
    return 'No engine results were produced.';
  }

  const sortedTests = Array.from(testResults.keys()).sort();
  const table = buildMarkdownTable(sortedTests, orderedEngines, testResults);
  const summary = `${sortedTests.length} new or modified test(s) were run on ${orderedEngines.length} engine(s).`;
  const link = WORKFLOW_RUN_URL ? `\n\n[View workflow run](${WORKFLOW_RUN_URL})` : '';

  return `${summary}${link}\n\n${table}`;
}

function buildMarkdownTable(tests, engines, testResults) {
  const header = ['Test', ...engines.map(k => ENGINE_NAMES[k])];
  const lines = ['| ' + header.join(' | ') + ' |'];
  lines.push('|' + header.map(() => ' --- ').join('|') + '|');

  for (const testPath of tests) {
    const results = testResults.get(testPath);
    const cells = engines.map(engineKey => {
      const result = results[engineKey];
      if (!result) return '—';
      if (result.pass === true) return '✅';
      return formatFail(result.message);
    });
    lines.push('| ' + [testPath, ...cells].join(' | ') + ' |');
  }

  return lines.join('\n');
}

function formatFail(message) {
  if (!message) {
    return '❌';
  }
  const sanitized = String(message)
    .replace(/"/g, "'")
    .replace(/\r?\n/g, ' ')
    .slice(0, 200);
  return `[❌](## "${sanitized}")`;
}

main();
