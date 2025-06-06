import * as fs from 'node:fs';
import * as path from 'node:path';
import { consola } from 'consola';
import {
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  Project,
  SyntaxKind,
  type VariableDeclaration,
} from 'ts-morph';
import type { GenerateOptions } from '..';
import { text as clientsideText } from './clientside.json';

const getInterfaceMethodDefinition_ = (
  name: string,
  node: FunctionDeclaration | ArrowFunction | FunctionExpression,
): string => {
  const typeParameters = node.getTypeParameters?.() ?? [];
  const typeParamsString =
    typeParameters.length > 0
      ? `<${typeParameters.map((tp) => tp.getText()).join(', ')}>`
      : '';

  const parameters = node
    .getParameters()
    .map((param) => {
      const paramName = param.getName();
      const type =
        param.getTypeNode()?.getText() ??
        param.getType().getText(node) ??
        'any';
      const questionToken = param.hasQuestionToken() ? '?' : '';
      return `${paramName}${questionToken}: ${type}`;
    })
    .join(', ');

  const returnTypeNode = node.getReturnTypeNode();
  let returnType: string;
  if (returnTypeNode != null) {
    returnType = returnTypeNode.getText();
  } else {
    const inferredReturnType = node.getReturnType();
    if (inferredReturnType.isVoid()) {
      returnType = 'void';
    } else {
      returnType = inferredReturnType.getText(node);
    }
  }

  let jsDocString = '';
  const jsDocOwner =
    'getJsDocs' in node
      ? node
      : 'getParantOrThrow' in node &&
          // @ts-expect-error variable declaration
          node.getParentOrThrow().getKind() === SyntaxKind.VariableDeclaration
        ? // @ts-expect-error variable declaration
          (node.getParentOrThrow() as VariableDeclaration)
        : null;
  if (jsDocOwner != null) {
    const jsDocs = 'getJsDocs' in jsDocOwner ? jsDocOwner.getJsDocs() : null;
    if (jsDocs != null && jsDocs.length > 0) {
      const rawConmmentText = jsDocs.map((doc) => doc.getFullText()).join('\n');
      if (rawConmmentText.includes('@deprecated')) {
        const deprecatedDoc = jsDocs.find((doc) =>
          doc.getFullText().includes('@deprecated'),
        );
        jsDocString = `${
          deprecatedDoc != null
            ? deprecatedDoc.getFullText().trim()
            : '/**\n * @deprecated\n */'
        }\n`;
      } else {
        const firstDoc = jsDocs[0];
        const description = firstDoc.getDescription().trim();
        if (description != null || firstDoc.getTags().length > 0) {
          jsDocString = `${firstDoc.getFullText().trim()}\n`;
        }
      }
    }
  }
  return `${jsDocString}${name}${typeParamsString}(${parameters}): ${returnType};`;
};

export const generateAppsScriptTypes = async ({
  project: projectPath,
  srcDir,
  outDir,
  outputFile,
}: Omit<GenerateOptions, 'watch'>) => {
  const absoluteSrcDir = path.resolve(projectPath, srcDir);
  const absoluteOutDir = path.resolve(projectPath, outDir);
  const absoluteOutputFile = path.resolve(absoluteOutDir, outputFile);

  consola.info('Starting AppsScript type generation with gasnuki...');
  consola.info(`  AppsScript Source Directory: ${absoluteSrcDir}`);
  consola.info(`  Output File: ${absoluteOutputFile}`);

  const project = new Project({
    tsConfigFilePath: path.resolve(projectPath, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  project.addSourceFilesAtPaths(
    path.join(absoluteSrcDir, '**/*.ts').replace(/\\/g, '/'),
  );

  const methodDefinitions: string[] = [];
  const globalTypeDefinitions: string[] = [];
  const sourceFiles = project.getSourceFiles();
  consola.info(`Found ${sourceFiles.length} source file(s).`);

  for (const sourceFile of sourceFiles) {
    for (const iface of sourceFile.getInterfaces()) {
      globalTypeDefinitions.push(iface.getText());
    }
    for (const typeAlias of sourceFile.getTypeAliases()) {
      globalTypeDefinitions.push(typeAlias.getText());
    }
    for (const statement of sourceFile.getStatements()) {
      if (statement.getKind() === SyntaxKind.ModuleDeclaration) {
        globalTypeDefinitions.push(statement.getText());
      }
    }
    for (const funcDecl of sourceFile.getFunctions()) {
      if (!funcDecl.isAmbient()) {
        const name = funcDecl.getName();
        if (name != null && !name.endsWith('_')) {
          methodDefinitions.push(getInterfaceMethodDefinition_(name, funcDecl));
        }
      }
    }
    for (const varStmt of sourceFile.getVariableStatements()) {
      if (!varStmt.isAmbient()) {
        for (const varDecl of varStmt.getDeclarations()) {
          const initializer = varDecl.getInitializer();
          const varName = varDecl.getName();
          if (
            initializer != null &&
            (initializer.getKind() === SyntaxKind.ArrowFunction ||
              initializer.getKind() === SyntaxKind.FunctionExpression) &&
            !varName.endsWith('_')
          ) {
            methodDefinitions.push(
              getInterfaceMethodDefinition_(
                varName,
                initializer as ArrowFunction | FunctionExpression,
              ),
            );
          }
        }
      }
    }
  }

  if (!fs.existsSync(absoluteOutDir)) {
    fs.mkdirSync(absoluteOutDir, { recursive: true });
    consola.info(`Created output directory: ${absoluteOutDir}`);
  }

  const generatorName = 'gasnuki';
  let outputContent = `// Auto-generated by ${generatorName}\n// Do NOT edit this file manually.\n`;

  if (globalTypeDefinitions.length > 0) {
    outputContent += `${globalTypeDefinitions.join('\n\n')}\n\n`;
  }

  if (methodDefinitions.length > 0) {
    const formattedMethods = methodDefinitions
      .map((method) =>
        method
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
      )
      .join('\n\n');
    outputContent += `export type ServerScripts = {\n${formattedMethods}\n}\n`;
    consola.info(
      `Interface 'ServerScript' type definitions written to ${absoluteOutputFile} (${methodDefinitions.length} function(s), ${globalTypeDefinitions.length} type(s)).`,
    );
  } else {
    outputContent = 'export type ServerScripts = {}\n';
    consola.info(
      `Interface 'ServerScript' type definitions written to ${absoluteOutputFile} (no functions found).`,
    );
  }

  outputContent += `\n// Auto-generated Types for GoogleAppsScript in client-side code\n\n${clientsideText}`;

  fs.writeFileSync(absoluteOutputFile, outputContent);
};
