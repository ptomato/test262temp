import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const OUTPUT_FILE = process.env.OUTPUT_FILE || 'comment-body.txt';
const WORKFLOW_RUN_URL = process.env.WORKFLOW_RUN_URL;

function main() {
  const results = loadResults();
  const body = buildCommentBody(results);
  fs.writeFileSync(OUTPUT_FILE, body, 'utf8');
  console.log(`Wrote comment body to ${OUTPUT_FILE}`);
}

function loadResults() {
  const engines = [];
  const testResults = new Map(); // testPath -> { engineKey -> { default?: result, strictMode?: result } }

  if (!fs.existsSync(ARTIFACTS_DIR)) {
    return { engines, testResults };
  }

  const files = fs.readdirSync(ARTIFACTS_DIR).filter(
    f => f.startsWith('results-') && f.endsWith('.json')
  );

  for (const file of files) {
    const engineKey = file.slice('results-'.length, -'.json'.length);
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
      let pathResults = testResults.get(normalizedPath);
      if (!pathResults) {
        pathResults = {};
        testResults.set(normalizedPath, pathResults);
      }
      if (test.result) {
        const scenario = test.scenario === 'strict mode' ? 'strictMode' : 'default';
        let engineResults = pathResults[engineKey];
        if (!engineResults) {
          engineResults = {};
          pathResults[engineKey] = engineResults;
        }
        engineResults[scenario] = {
          pass: test.result.pass === true,
          message: test.result.message,
        };
      }
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
  const summary =
    `${sortedTests.length} new or modified ${sortedTests.length === 1 ? "test" : "tests"} ` +
    `were run on ${orderedEngines.length} ${orderedEngines.length === 1 ? "engine" : "engines"}.`;
  const link = WORKFLOW_RUN_URL ? `\n\n[View workflow run](${WORKFLOW_RUN_URL})` : '';

  return `${summary}${link}\n\n${table}`;
}

function buildMarkdownTable(tests, engines, testResults) {
  const header = ['Test', ...engines];
  const lines = ['| ' + header.join(' | ') + ' |'];
  lines.push('|' + header.map(() => ' --- ').join('|') + '|');

  for (const testPath of tests) {
    const results = testResults.get(testPath);
    const cells = engines.map(engineKey => {
      const result = results[engineKey];
      return formatCell(result);
    });
    lines.push('| ' + [testPath, ...cells].join(' | ') + ' |');
  }

  return lines.join('\n');
}

function formatCell(result) {
  if (!result) return '—';

  const sloppy = result.default;
  const strict = result.strictMode;

  if (sloppy && strict) {
    if (sloppy.pass === true && strict.pass === true) return '✅';
    if (sloppy.pass === false && strict.pass === false) {
      return formatFail(combineMessages(sloppy.message, strict.message));
    }
    if (sloppy.pass === true && strict.pass === false) {
      return formatFail(`Passed in sloppy mode but failed in strict mode: ${strict.message}`);
    }
    return formatFail(`Passed in strict mode but failed in sloppy mode: ${sloppy.message}`);
  }

  const only = sloppy || strict;
  if (only.pass === true) return '✅';
  if (only.pass === false) return formatFail(only.message);
  return '—';
}

function combineMessages(sloppyMessage, strictMessage) {
  if (sloppyMessage && strictMessage) {
    if (sloppyMessage === strictMessage) {
      return sloppyMessage;
    }
    return `Sloppy: ${sloppyMessage}; Strict: ${strictMessage}`;
  }
  return sloppyMessage || strictMessage;
}

function formatFail(message) {
  if (!message) return '❌';
  return `[❌](## "${sanitizeTooltip(message)}")`;
}

function sanitizeTooltip(text) {
  return String(text)
    .replace(/"/g, "'")
    .replace(/\r?\n/g, ' ')
    .slice(0, 200);
}

main();
