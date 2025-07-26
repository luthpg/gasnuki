import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface CoverageData {
  [filePath: string]: {
    s: { [statementId: string]: number };
  };
}

interface CoverageResult {
  percentage: number;
  covered: number;
  total: number;
}

// カバレッジJSONファイルを読み込む
function loadCoverageData(): CoverageData {
  const coveragePath = join(__dirname, '..', 'coverage', 'coverage-final.json');

  if (!existsSync(coveragePath)) {
    console.error('Coverage file not found. Run tests with coverage first.');
    process.exit(1);
  }

  const coverageData = JSON.parse(
    readFileSync(coveragePath, 'utf8'),
  ) as CoverageData;
  return coverageData;
}

// カバレッジ率を計算する
function calculateCoverage(coverageData: CoverageData): CoverageResult {
  let totalStatements = 0;
  let coveredStatements = 0;

  for (const filePath in coverageData) {
    const fileData = coverageData[filePath];
    const statements = fileData.s;

    for (const statementId in statements) {
      totalStatements++;
      if (statements[statementId] > 0) {
        coveredStatements++;
      }
    }
  }

  return {
    percentage:
      totalStatements > 0
        ? Math.round((coveredStatements / totalStatements) * 10000) / 100
        : 0,
    covered: coveredStatements,
    total: totalStatements,
  };
}

// カバレッジ率に基づいてバッジの色を決定する
function getBadgeColor(percentage: number): string {
  if (percentage >= 90) return 'brightgreen';
  if (percentage >= 80) return 'green';
  if (percentage >= 70) return 'yellowgreen';
  if (percentage >= 60) return 'yellow';
  if (percentage >= 50) return 'orange';
  return 'red';
}

// READMEファイルを更新する
function updateReadme(
  coverage: CoverageResult,
  readmeFiles: string[] = ['README.md'],
): void {
  for (const readmeFile of readmeFiles) {
    const readmePath = join(__dirname, '..', readmeFile);

    if (!existsSync(readmePath)) {
      console.warn(`⚠️  README file not found: ${readmeFile}`);
      continue;
    }

    let readmeContent = readFileSync(readmePath, 'utf8');

    // 新しいカバレッジバッジのURL
    const badgeColor = getBadgeColor(coverage.percentage);
    const newBadgeUrl = `https://img.shields.io/badge/test%20coverage-${coverage.percentage}%25-${badgeColor}`;

    // 既存のカバレッジバッジを置換
    const badgeRegex = /\[!\[Test Coverage\]\([^)]+\)\]\([^)]+\)/;
    const newBadge = `[![Test Coverage](${newBadgeUrl})](https://github.com/luthpg/gasnuki)`;

    if (badgeRegex.test(readmeContent)) {
      readmeContent = readmeContent.replace(badgeRegex, newBadge);
    } else {
      // バッジが見つからない場合は、タイトルの直後に追加
      readmeContent = readmeContent.replace(
        /^# gasnuki\n/,
        `# gasnuki\n\n${newBadge}\n`,
      );
    }

    writeFileSync(readmePath, readmeContent);
    console.log(
      `✅ Updated ${readmeFile} with coverage badge: ${coverage.percentage}% (${coverage.covered}/${coverage.total} statements)`,
    );
  }
}

// メイン処理
function main(): void {
  try {
    // コマンドライン引数からREADMEファイルのリストを取得
    const readmeFiles =
      process.argv.slice(2).length > 0
        ? process.argv.slice(2)
        : ['README.md', 'README.ja.md'];

    const coverageData = loadCoverageData();
    const coverage = calculateCoverage(coverageData);
    updateReadme(coverage, readmeFiles);
  } catch (error) {
    console.error('Error updating coverage badge:', (error as Error).message);
    process.exit(1);
  }
}

main();
