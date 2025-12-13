import { Project } from 'ts-morph';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { generateAppsScriptTypes } from '../../src/modules/generate';

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock consola
vi.mock('consola', () => ({ consola: { info: vi.fn(), error: vi.fn() } }));

// Use actual node:path
vi.mock('node:path', () => vi.importActual('node:path'));

// Mock ts-morph Project
const _mockProject = new Project({ useInMemoryFileSystem: true });
vi.mock('ts-morph', async () => {
  const original = await vi.importActual<typeof import('ts-morph')>('ts-morph');
  return {
    ...original,
    Project: vi.fn(),
    RealProject: original.Project,
  };
});

// Mock clientside.json
vi.mock('../../src/modules/clientside.json', () => ({
  text: '// clientside types',
}));

describe('generateAppsScriptTypes Integration', () => {
  const projectPath = process.platform === 'win32' ? 'C:/project' : '/project';
  const opts = {
    project: projectPath,
    srcDir: 'src',
    outDir: 'types',
    outputFile: 'appsscript.ts',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Complex scenario: External types, node_modules, and scoped packages', async () => {
    // @ts-expect-error RealProject is exposed by mock
    const RealProject = (await import('ts-morph')).RealProject;
    const project = new RealProject({
      useInMemoryFileSystem: true,
      compilerOptions: { strict: true },
    });

    // ... setup ...

    // 1. Setup External Type Definitions (outside srcDir)
    project.createSourceFile(
      `${projectPath}/external/models.ts`,
      'export interface ExternalModel { id: number; data: string; }',
    );

    // 2. Setup node_modules package (normal)
    project.createSourceFile(
      `${projectPath}/node_modules/my-utils/index.d.ts`,
      'export interface MyUtilType { label: string; }',
    );

    // 3. Setup @types package
    project.createSourceFile(
      `${projectPath}/node_modules/@types/lodash/index.d.ts`,
      'export interface LodashDict<T> { [key: string]: T; }',
    );

    // 4. Setup Scoped package
    project.createSourceFile(
      `${projectPath}/node_modules/@scope/ui/index.d.ts`,
      'export interface UIComponent { render(): void; }',
    );

    // 5. Main Source File using all above
    project.createSourceFile(
      `${projectPath}/src/main.ts`,
      `
      import { ExternalModel } from '../external/models';
      import { MyUtilType } from 'my-utils';
      import { LodashDict } from 'lodash';
      import { UIComponent } from '@scope/ui';

      export function processData(model: ExternalModel, dict: LodashDict<string>, util: MyUtilType): void {
        console.log(util.label);
      }

      export function renderUI(component: UIComponent): void {
        component.render();
      }
      `,
    );

    const { writeFileSync } = await import('node:fs');

    await generateAppsScriptTypes({ ...opts, projectInstance: project });

    const writtenContent = (writeFileSync as Mock).mock.calls[0][1];
    console.log('--- GENERATED CONTENT START ---');
    console.log(writtenContent);
    console.log('--- GENERATED CONTENT END ---');

    // Assertions

    // 1. External Models should be imported via relative path
    expect(writtenContent).toContain(
      "import type { ExternalModel } from '../external/models';",
    );
    expect(writtenContent).not.toContain('export interface ExternalModel'); // Should NOT be inlined

    // 2. Normal package should be imported by package name
    expect(writtenContent).toContain(
      "import type { MyUtilType } from 'my-utils';",
    );

    // 3. @types package should be imported by actual package name (lodash), not @types/lodash
    expect(writtenContent).toContain(
      "import type { LodashDict } from 'lodash';",
    );
    expect(writtenContent).not.toContain('@types/lodash');

    // 4. Scoped package should be imported by scope name
    expect(writtenContent).toContain(
      "import type { UIComponent } from '@scope/ui';",
    );

    // 5. Check generated functions in ServerScripts
    expect(writtenContent).toContain(
      'processData(model: ExternalModel, dict: LodashDict<string>, util: MyUtilType): void;',
    );
    expect(writtenContent).toContain('renderUI(component: UIComponent): void;');
  });
});
