import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { consola } from 'consola';
import {
  type ArrowFunction,
  type FunctionDeclaration,
  type FunctionExpression,
  type InterfaceDeclaration,
  type Node,
  Project,
  SymbolFlags,
  SyntaxKind,
  type Type,
  type TypeAliasDeclaration,
  type VariableDeclaration,
} from 'ts-morph';
import type { GenerateOptions } from '..';
import { text as clientsideText } from './clientside.json';

// Module-level cache to store hashes
const generationCache = new Map<string, string>();

/**
 * Computes a hash of the source files' content and paths.
 */
const computeSourceHash = (
  sourceFiles: import('ts-morph').SourceFile[],
): string => {
  const hash = crypto.createHash('md5');
  // Sort files by path to ensure deterministic order
  const sortedFiles = [...sourceFiles].sort((a, b) =>
    a.getFilePath().localeCompare(b.getFilePath()),
  );

  for (const file of sortedFiles) {
    hash.update(file.getFilePath());
    hash.update(file.getFullText());
  }
  return hash.digest('hex');
};

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
      : 'getParentOrThrow' in node &&
          // @ts-expect-error variable declaration
          node.getParentOrThrow().getKind() === SyntaxKind.VariableDeclaration
        ? // @ts-expect-error variable declaration
          (node.getParentOrThrow() as VariableDeclaration)
        : null;

  if (jsDocOwner != null) {
    const jsDocs = 'getJsDocs' in jsDocOwner ? jsDocOwner.getJsDocs() : [];
    if (jsDocs.length > 0) {
      const firstDoc = jsDocs[0];
      jsDocString = `${firstDoc.getFullText().trim()}\n`;
    }
  }

  // Helper to strip import("...") from types
  const cleanType = (t: string) =>
    t
      .replace(/import\(".*?"\)\.default\./g, '')
      .replace(/import\(".*?"\)\./g, '');

  const cleanedReturnType = cleanType(returnType);
  const cleanedParameters = parameters.replace(
    /:\s*([^,;)]+)/g,
    (_match, p1) => {
      return `: ${cleanType(p1)}`;
    },
  );

  return `${jsDocString}${name}${typeParamsString}(${cleanedParameters}): ${cleanedReturnType};`;
};

export const SIMPLE_TRIGGER_FUNCTION_NAMES = [
  'onOpen',
  'onEdit',
  'onInstall',
  'onSelectionChange',
  'doGet',
  'doPost',
];

/**
 * Caches package.json contents to avoid redundant file system reads.
 */
const packageJsonCache = new Map<
  string,
  { path: string; content: any } | null
>();

/**
 * Finds the closest package.json starting from the given directory and traversing up.
 */
const findPackageJson_ = (
  startDir: string,
): { path: string; content: any } | null => {
  let currentDir = startDir;
  while (true) {
    if (packageJsonCache.has(currentDir)) {
      // biome-ignore lint/style/noNonNullAssertion: packageJsonCache has currentDir
      return packageJsonCache.get(currentDir)!;
    }

    const pkgPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const content = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const result = { path: pkgPath, content };
        packageJsonCache.set(currentDir, result);
        // Optimization: also cache for startDir if different
        if (currentDir !== startDir) {
          packageJsonCache.set(startDir, result);
        }
        return result;
      } catch {
        // ignore error
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      packageJsonCache.set(currentDir, null);
      if (currentDir !== startDir) {
        packageJsonCache.set(startDir, null);
      }
      break;
    }
    currentDir = parentDir;
  }
  return null;
};

/**
 * Recursively checks if an exports entry matches the target file path.
 */
const matchesExportValue_ = (node: any, targetPath: string): boolean => {
  if (typeof node === 'string') {
    // Exact match or relative path match
    // targetPath is like "./dist/index.d.ts"
    // node might be "./dist/index.js" or "./dist/index.d.ts"
    return (
      node === targetPath || node === targetPath.replace(/\.d\.ts$/, '.js')
    );
  }
  if (typeof node === 'object' && node !== null) {
    // Prioritize 'types' condition for .d.ts resolution
    if (node.types && node.types === targetPath) {
      return true;
    }
    // Recursively check nested conditions
    for (const key in node) {
      if (matchesExportValue_(node[key], targetPath)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Resolves the module specifier for a given file path within node_modules.
 * Uses package.json 'exports' if available, otherwise falls back to 'types'/'typings' or package name.
 */
const resolveNodeModuleSpecifier_ = (filePath: string): string | null => {
  const pkg = findPackageJson_(path.dirname(filePath));
  if (!pkg) return null;

  let packageName = pkg.content.name;

  // Handle @types packages: mapping @types/foo -> foo
  if (packageName.startsWith('@types/')) {
    packageName = packageName.slice(7);
  }

  const packageRoot = path.dirname(pkg.path);

  // Calculate relative path from package root, e.g., "dist/json.d.ts"
  // Ensure forward slashes for consistency
  let relativePath = path.relative(packageRoot, filePath).replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = `./${relativePath}`;
  }

  // 1. Try to resolve using "exports"
  if (pkg.content.exports) {
    for (const key in pkg.content.exports) {
      const exportValue = pkg.content.exports[key];
      // key is the exported path (e.g. "." or "./json")
      // exportValue is the local path (e.g. "./dist/json.js")

      // We check if our relativePath (local file) matches the exportValue
      if (matchesExportValue_(exportValue, relativePath)) {
        if (key === '.') return packageName;
        // Handle subpaths (e.g., "./json" -> "package/json")
        // key starts with ./
        return path.posix.join(packageName, key);
      }
    }
  }

  // 2. Try to resolve using "types" or "typings" (Main entry point)
  const mainTypes = pkg.content.types || pkg.content.typings;
  if (mainTypes) {
    let normalizedMain = mainTypes.replace(/\\/g, '/');
    if (!normalizedMain.startsWith('.')) {
      normalizedMain = `./${normalizedMain}`;
    }
    if (normalizedMain === relativePath) {
      return packageName;
    }
  }

  // 3. Fallback to package name (legacy behavior)
  return packageName;
};

export const generateAppsScriptTypes = async ({
  project: projectPath,
  srcDir,
  outDir,
  outputFile,
  projectInstance,
  cache = true, // Default to true
}: Omit<GenerateOptions, 'watch'> & {
  projectInstance?: Project;
  cache?: boolean;
}) => {
  const absoluteSrcDir = path.resolve(projectPath, srcDir);
  const absoluteOutDir = path.resolve(projectPath, outDir);
  const absoluteOutputFile = path.resolve(absoluteOutDir, outputFile);

  consola.info('Starting AppsScript type generation with gasnuki...');
  consola.info(`  AppsScript Source Directory: ${absoluteSrcDir}`);
  consola.info(`  Output File: ${absoluteOutputFile}`);

  let tsConfigFilePath = path.resolve(projectPath, 'tsconfig.json');
  if (fs.existsSync(path.resolve(projectPath, 'tsconfig.app.json'))) {
    tsConfigFilePath = path.resolve(projectPath, 'tsconfig.app.json');
  }

  const project =
    projectInstance ??
    new Project({
      tsConfigFilePath,
      skipAddingFilesFromTsConfig: true,
    });

  const sourceFilesPattern = path
    .join(absoluteSrcDir, '**/*.ts')
    .replace(/\\/g, '/');
  const testFilesPattern = `!${path
    .join(absoluteSrcDir, '**/*.{test,spec}.ts')
    .replace(/\\/g, '/')}`;
  project.addSourceFilesAtPaths([sourceFilesPattern, testFilesPattern]);

  const sourceFiles = project.getSourceFiles();
  consola.info(`Found ${sourceFiles.length} source file(s).`);

  if (cache) {
    const currentHash = computeSourceHash(sourceFiles);
    // Cache key based on output file absolute path
    const cacheKey = absoluteOutputFile;

    if (
      generationCache.get(cacheKey) === currentHash &&
      fs.existsSync(absoluteOutputFile)
    ) {
      consola.success(
        `Skipping generation: Source files have not changed (Hash: ${currentHash.slice(0, 8)}).`,
      );
      return;
    }

    // Update cache after successful check (but write happens at end)
    // We'll set it at the end of function
  }

  const methodDefinitions: string[] = [];
  const exportedDeclarations: (
    | FunctionDeclaration
    | VariableDeclaration
    | InterfaceDeclaration
    | TypeAliasDeclaration
  )[] = [];
  const exportedDeclarationNames = new Set<string>();
  const exportedFunctions: (
    | FunctionDeclaration
    | ArrowFunction
    | FunctionExpression
  )[] = [];

  // 1. First pass: Collect all exported declarations and functions from srcDir
  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath().replace(/\\/g, '/');
    const srcPath = absoluteSrcDir.replace(/\\/g, '/');
    const projectRelativeSrcPath = path
      .join(projectPath, srcDir)
      .replace(/\\/g, '/');

    if (
      !filePath.startsWith(srcPath) &&
      !filePath.startsWith(projectRelativeSrcPath)
    ) {
      continue;
    }

    for (const iface of sourceFile.getInterfaces()) {
      if (!iface.getName()?.endsWith('_')) {
        exportedDeclarations.push(iface);
        exportedDeclarationNames.add(iface.getName());
      }
    }
    for (const typeAlias of sourceFile.getTypeAliases()) {
      if (!typeAlias.getName().endsWith('_')) {
        exportedDeclarations.push(typeAlias);
        exportedDeclarationNames.add(typeAlias.getName());
      }
    }
    for (const func of sourceFile.getFunctions()) {
      const name = func.getName();
      if (
        name &&
        !name.endsWith('_') &&
        !SIMPLE_TRIGGER_FUNCTION_NAMES.includes(name)
      ) {
        exportedDeclarations.push(func);
        exportedDeclarationNames.add(name);
        methodDefinitions.push(getInterfaceMethodDefinition_(name, func));
        exportedFunctions.push(func);
      }
    }
    for (const varStmt of sourceFile.getVariableStatements()) {
      for (const varDecl of varStmt.getDeclarations()) {
        const name = varDecl.getName();
        const initializer = varDecl.getInitializer();
        if (
          !name.endsWith('_') &&
          !SIMPLE_TRIGGER_FUNCTION_NAMES.includes(name) &&
          initializer &&
          (initializer.getKind() === SyntaxKind.ArrowFunction ||
            initializer.getKind() === SyntaxKind.FunctionExpression)
        ) {
          const funcExpr = initializer as ArrowFunction | FunctionExpression;
          exportedDeclarations.push(varDecl);
          exportedDeclarationNames.add(name);
          methodDefinitions.push(getInterfaceMethodDefinition_(name, funcExpr));
          exportedFunctions.push(funcExpr);
        }
      }
    }
  }

  const collectSymbolsFromType = (
    type: Type,
    foundSymbols: Set<import('ts-morph').Symbol>,
    contextNode?: Node,
    depth = 0,
    isComponent = false, // Allow traversal of external components (union/intersection parts)
  ) => {
    // -------------------------------------------------------------------------
    // 0. Pre-emptive recursion for Container Types (Arrays, Tuples, Generics)
    // -------------------------------------------------------------------------
    // Explicit Array/Tuple Handling
    if (type.isArray()) {
      const elementType = type.getArrayElementType();
      if (elementType) {
        collectSymbolsFromType(
          elementType,
          foundSymbols,
          contextNode,
          depth + 1,
        );
      }
    }
    if (type.isTuple()) {
      for (const element of type.getTupleElements()) {
        collectSymbolsFromType(element, foundSymbols, contextNode, depth + 1);
      }
    }

    // Always traverse Type Arguments.
    // This ensures that even if the outer type (e.g. JsonString, Array) is external/ignored,
    // its generic parameters are discovered.
    for (const typeArg of type.getTypeArguments()) {
      collectSymbolsFromType(typeArg, foundSymbols, contextNode, depth + 1);
    }
    for (const typeArg of type.getAliasTypeArguments()) {
      collectSymbolsFromType(typeArg, foundSymbols, contextNode, depth + 1);
    }

    // Traverse Union / Intersection
    if (type.isUnion()) {
      for (const unionType of type.getUnionTypes()) {
        collectSymbolsFromType(
          unionType,
          foundSymbols,
          contextNode,
          depth + 1,
          true,
        );
      }
    }
    if (type.isIntersection()) {
      for (const intersectionType of type.getIntersectionTypes()) {
        collectSymbolsFromType(
          intersectionType,
          foundSymbols,
          contextNode,
          depth + 1,
          true,
        );
      }
    }

    const typeText = type.getText(contextNode);
    // Fallback: If type text contains import("..."), try to extract the symbol name and module path
    const importMatches = typeText.matchAll(
      /import\("(.*?)"\)\.([^<>[\]{}() ,;]+)/g,
    );
    for (const match of importMatches) {
      const absolutePath = match[1];
      const typeName = match[2];

      if (typeName === 'default' || typeName === '__type') continue;

      // Find the source file for this absolute path
      let sourceFile =
        project.getSourceFile(absolutePath) ||
        project.addSourceFileAtPathIfExists(absolutePath);
      if (!sourceFile) {
        const extensions = ['.ts', '.d.ts', '.tsx'];
        for (const ext of extensions) {
          sourceFile =
            project.getSourceFile(absolutePath + ext) ||
            project.addSourceFileAtPathIfExists(absolutePath + ext);
          if (sourceFile) break;
        }
      }

      if (sourceFile) {
        // Try to find the symbol in exported declarations first
        const exported = sourceFile.getExportedDeclarations().get(typeName);
        let s: import('ts-morph').Symbol | undefined;

        if (exported && exported.length > 0) {
          s = exported[0].getSymbol();
        } else {
          // Fallback to internal declarations if not exported
          s =
            sourceFile.getInterface(typeName)?.getSymbol() ||
            sourceFile.getTypeAlias(typeName)?.getSymbol() ||
            sourceFile.getEnum(typeName)?.getSymbol() ||
            sourceFile.getClass(typeName)?.getSymbol();
        }

        if (s && !foundSymbols.has(s)) {
          foundSymbols.add(s);
        }
      }
    }

    const aliasSymbol = type.getAliasSymbol();
    let symbol = type.getSymbol();

    // Fallback: If no direct symbol, try apparent type's symbol.
    // This is necessary for interfaces reached via inferred generics.
    if (!symbol && !aliasSymbol) {
      symbol = type.getApparentType().getSymbol();
    }

    // -------------------------------------------------------------------------
    // 1. Alias Symbol (Type Alias) Check
    // -------------------------------------------------------------------------
    if (aliasSymbol) {
      if (foundSymbols.has(aliasSymbol)) {
        return;
      }

      // Check if External (Alias)
      const declarations = aliasSymbol.getDeclarations();
      if (declarations.length > 0) {
        const sourceFilePath = declarations[0].getSourceFile().getFilePath();
        const isExternal =
          sourceFilePath.includes('node_modules') ||
          (!sourceFilePath
            .replace(/\\/g, '/')
            .startsWith(absoluteSrcDir.replace(/\\/g, '/')) &&
            !sourceFilePath
              .replace(/\\/g, '/')
              .startsWith(path.join(projectPath, srcDir).replace(/\\/g, '/')));

        if (isExternal) {
          foundSymbols.add(aliasSymbol);
          // Note: Type args are already handled in step 0.
          return; // Do not traverse properties of external types
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. Symbol Check & Property Traversal (Interface, Class, etc.)
    // -------------------------------------------------------------------------
    let shouldTraverseProperties = true;

    if (symbol) {
      if (foundSymbols.has(symbol)) {
        shouldTraverseProperties = false;
      } else {
        foundSymbols.add(symbol);
        // Check if external
        const declarations = symbol.getDeclarations();
        if (declarations.length > 0) {
          const sourceFilePath = declarations[0].getSourceFile().getFilePath();
          const isExternal =
            sourceFilePath.includes('node_modules') ||
            (!sourceFilePath
              .replace(/\\/g, '/')
              .startsWith(absoluteSrcDir.replace(/\\/g, '/')) &&
              !sourceFilePath
                .replace(/\\/g, '/')
                .startsWith(
                  path.join(projectPath, srcDir).replace(/\\/g, '/'),
                ));

          if (isExternal) {
            // Only stop traversal if NOT a component of a larger structure (like intersection)
            // AND not an anonymous type (TypeLiteral) which acts as a structural container
            const isAnonymous = declarations.every(
              (d) =>
                d.getKind() === SyntaxKind.TypeLiteral ||
                d.getKind() === SyntaxKind.ObjectLiteralExpression,
            );
            if (!isComponent && !isAnonymous) {
              shouldTraverseProperties = false;
            }
          }
        }
      }
    }

    // Traverse properties if internal or anonymous (no symbol)
    if (shouldTraverseProperties) {
      // Use both explicit and apparent properties
      const props = new Set([
        ...type.getProperties(),
        ...type.getApparentProperties(),
      ]);

      for (const prop of props) {
        let propType: Type | undefined;

        if (contextNode) {
          try {
            propType = prop.getTypeAtLocation(contextNode);
          } catch {
            // ignore
          }
        }

        if (!propType || propType.getText() === 'any') {
          const propDecls = prop.getDeclarations();
          if (propDecls.length > 0) {
            propType = propDecls[0].getType();
          }
        }

        // Fallback for aliased symbols (e.g. shorthand properties)
        if (
          (!propType || propType.getText() === 'any') &&
          prop.getAliasedSymbol()
        ) {
          const aliased = prop.getAliasedSymbol();
          if (aliased) {
            const decl =
              aliased.getValueDeclaration() || aliased.getDeclarations()[0];
            if (decl) {
              propType = decl.getType();
            }
          }
        }

        if (propType) {
          // Check for ComputedPropertyName (e.g. [__brand])
          const propDecls = prop.getDeclarations();
          if (propDecls.length > 0) {
            const propDecl = propDecls[0];
            const compilerNode = propDecl.compilerNode;
            if (
              // @ts-expect-error - checking kind directly for perf
              compilerNode.name &&
              // @ts-expect-error - checking kind directly for perf
              compilerNode.name.kind === SyntaxKind.ComputedPropertyName
            ) {
              // @ts-expect-error - has expression
              const expression = propDecl.getNameNode().getExpression();
              const s = expression.getSymbol();
              if (s && !foundSymbols.has(s)) {
                foundSymbols.add(s);
              }
            }
          }
          collectSymbolsFromType(
            propType,
            foundSymbols,
            contextNode,
            depth + 1,
          );
        }
      }
    }
  };

  // Symbols from function signatures - these may need imports from external packages
  const functionSignatureSymbols = new Set<import('ts-morph').Symbol>();
  // All symbols to process (for inlining internal types)
  const symbolsToProcess = new Set<import('ts-morph').Symbol>();

  // 2. Collect initial dependencies from function signatures and exported types in srcDir
  for (const decl of exportedDeclarations) {
    // For functions, only scan parameters and return type nodes
    if (
      decl.getKind() === SyntaxKind.FunctionDeclaration ||
      (decl.getKind() === SyntaxKind.VariableDeclaration &&
        ((decl as VariableDeclaration).getInitializer()?.getKind() ===
          SyntaxKind.ArrowFunction ||
          (decl as VariableDeclaration).getInitializer()?.getKind() ===
            SyntaxKind.FunctionExpression))
    ) {
      const func =
        decl.getKind() === SyntaxKind.FunctionDeclaration
          ? (decl as FunctionDeclaration)
          : ((decl as VariableDeclaration).getInitializer() as
              | ArrowFunction
              | FunctionExpression);

      const parameters = func.getParameters();
      for (const param of parameters) {
        // Use 'func' as context node
        collectSymbolsFromType(param.getType(), functionSignatureSymbols, func);
        collectSymbolsFromType(param.getType(), symbolsToProcess, func);
      }

      const returnType = func.getReturnType();
      // Use 'func' as context node
      collectSymbolsFromType(returnType, functionSignatureSymbols, func);
      collectSymbolsFromType(returnType, symbolsToProcess, func);
    }
    // For interfaces and type aliases, scan the whole declaration (for inlining only)
    else if (
      decl.getKind() === SyntaxKind.InterfaceDeclaration ||
      decl.getKind() === SyntaxKind.TypeAliasDeclaration
    ) {
      collectSymbolsFromType(decl.getType(), symbolsToProcess, decl);
    }
  }

  const importsMap = new Map<string, Set<string>>();
  const inlineDefinitions = new Map<string, string>();
  const processedSymbols = new Set<string>();

  // 3. Process all dependencies transitively
  while (symbolsToProcess.size > 0) {
    const symbol = symbolsToProcess.values().next().value;
    if (!symbol) continue;
    symbolsToProcess.delete(symbol);

    const symbolName = symbol.getName();

    if (
      processedSymbols.has(symbolName) ||
      exportedDeclarationNames.has(symbolName) ||
      symbolName === '__type'
    ) {
      continue;
    }

    const symbolFlags = symbol.getFlags();
    if (symbolFlags & SymbolFlags.TypeParameter) {
      continue;
    }

    const declaration = symbol.getDeclarations()[0];
    if (!declaration) {
      continue;
    }

    // Only inline specific node kinds that represent types or 'unique symbol'
    const allowedKinds = [
      SyntaxKind.InterfaceDeclaration,
      SyntaxKind.TypeAliasDeclaration,
      SyntaxKind.EnumDeclaration,
      SyntaxKind.ClassDeclaration,
      SyntaxKind.ModuleDeclaration,
    ];

    if (!allowedKinds.includes(declaration.getKind())) {
      // Special case: VariableDeclaration is only allowed for unique symbol (branded types)
      if (declaration.getKind() === SyntaxKind.VariableDeclaration) {
        const typeNode = (declaration as VariableDeclaration).getTypeNode();
        const isUniqueSymbol = typeNode?.getText().includes('unique symbol');
        if (!isUniqueSymbol) {
          continue;
        }
      } else {
        // Skip all other kinds (PropertyAssignment, etc.)
        continue;
      }
    }

    const sourceFile = declaration.getSourceFile();
    const sourceFilePath = sourceFile.getFilePath();

    // Skip TypeScript built-in types (lib.*.d.ts) - no import needed
    if (/[/\\]typescript[/\\]lib[/\\]/.test(sourceFilePath)) {
      continue;
    }

    const isExternal =
      sourceFilePath.includes('node_modules') ||
      (!sourceFilePath
        .replace(/\\/g, '/')
        .startsWith(absoluteSrcDir.replace(/\\/g, '/')) &&
        !sourceFilePath
          .replace(/\\/g, '/')
          .startsWith(path.join(projectPath, srcDir).replace(/\\/g, '/')));

    if (isExternal) {
      if (sourceFilePath.includes('node_modules')) {
        // node_modulesの中身は、既に functionSignatureSymbols でチェックしたもののみ出力対象
        if (!functionSignatureSymbols.has(symbol)) {
          continue;
        }
        const packageName = resolveNodeModuleSpecifier_(sourceFilePath);
        if (packageName) {
          processedSymbols.add(symbolName);
          if (!importsMap.has(packageName)) {
            importsMap.set(packageName, new Set());
          }
          importsMap.get(packageName)?.add(symbolName);
        }
      } else {
        // プロジェクト内の外部ファイル
        let modulePath = path
          .relative(absoluteOutDir, sourceFilePath)
          .replace(/\\/g, '/');
        modulePath = modulePath.replace(/\.(d\.)?ts$/, '');
        if (modulePath.endsWith('/index')) {
          modulePath = modulePath.slice(0, -6);
        }
        if (modulePath === 'index' || modulePath === '') {
          modulePath = '.';
        }
        if (!modulePath.startsWith('.')) {
          modulePath = `./${modulePath}`;
        }
        if (!importsMap.has(modulePath)) {
          importsMap.set(modulePath, new Set());
        }
        importsMap.get(modulePath)?.add(symbolName);
      }
      continue;
    }

    processedSymbols.add(symbolName);

    // If it's an internal type (but not directly exported), inline it
    let declText = declaration.getText();

    // For VariableDeclaration (like `declare const __brand: unique symbol`),
    // we need the parent VariableStatement to include keywords like 'declare', 'const', 'export'.
    if (declaration.getKind() === SyntaxKind.VariableDeclaration) {
      const variableStatement = declaration.getParent()?.getParent();
      if (
        variableStatement &&
        variableStatement.getKind() === SyntaxKind.VariableStatement
      ) {
        declText = variableStatement.getText();
      }
    }

    inlineDefinitions.set(symbolName, declText);

    // Add its own dependencies to the processing queue
    for (const descendant of declaration.getDescendantsOfKind(
      SyntaxKind.TypeReference,
    )) {
      const newSymbol =
        descendant.getType().getAliasSymbol() ??
        descendant.getType().getSymbol();
      if (newSymbol) {
        symbolsToProcess.add(newSymbol);
      }
    }
  }

  // 4. Assemble the output file content
  if (!fs.existsSync(absoluteOutDir)) {
    fs.mkdirSync(absoluteOutDir, { recursive: true });
    consola.info(`Created output directory: ${absoluteOutDir}`);
  }

  const generatorName = 'gasnuki';
  let outputContent = `// Auto-generated by ${generatorName}\n// Do NOT edit this file manually.\n\n`;

  // === Build Body Content First to Check Usage ===
  let bodyContent = '';

  // Add inlined internal type definitions
  if (inlineDefinitions.size > 0) {
    bodyContent += `${[...inlineDefinitions.values()].join('\n\n')}\n\n`;
  }

  // Add exported types from within srcDir
  const exportedTypeDefinitions = exportedDeclarations
    .filter(
      (d) =>
        d.getKind() === SyntaxKind.InterfaceDeclaration ||
        d.getKind() === SyntaxKind.TypeAliasDeclaration,
    )
    .map((decl) => decl.getText());

  if (exportedTypeDefinitions.length > 0) {
    bodyContent += `${exportedTypeDefinitions.join('\n\n')}\n\n`;
  }

  // Add ServerScripts interface
  if (methodDefinitions.length > 0) {
    const formattedMethods = methodDefinitions
      .map((method) =>
        method
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
      )
      .join('\n\n');
    bodyContent += `export type ServerScripts = {\n${formattedMethods}\n}\n`;
    consola.info(
      `Interface 'ServerScript' type definitions written to ${absoluteOutputFile} (${methodDefinitions.length} function(s), ${
        exportedTypeDefinitions.length + inlineDefinitions.size
      } type(s)).`,
    );
  } else {
    bodyContent += 'export type ServerScripts = {}\n';
    consola.info(
      `Interface 'ServerScript' type definitions written to ${absoluteOutputFile} (no functions found).`,
    );
  }

  // Add client-side helper types
  bodyContent += `\n// Auto-generated Types for GoogleAppsScript in client-side code\n\n${clientsideText}`;

  // === Generate Imports with Usage Filtering ===
  const sortedModulePaths = [...importsMap.keys()].sort((a, b) => {
    const aIsRelative = a.startsWith('.');
    const bIsRelative = b.startsWith('.');
    if (aIsRelative !== bIsRelative) return aIsRelative ? 1 : -1;
    return a.localeCompare(b);
  });

  if (sortedModulePaths.length > 0) {
    const importStatements = sortedModulePaths
      .map((modulePath) => {
        const imports = [...(importsMap.get(modulePath) ?? [])]
          .sort()
          .filter((importName) => {
            // Check if the import name is used in the body content.
            // Use a regex that matches the name as a standalone word OR prefixed by import("...").
            // This handles cases where ts-morph might still emit path-poisoned types.
            const regex = new RegExp(
              `(?:import\\(".*?"\\)\\.|\\b)${importName}\\b`,
            );
            return regex.test(bodyContent);
          });

        if (imports.length === 0) {
          return null;
        }

        const finalModulePath = modulePath === '.' ? './index' : modulePath;
        return `import type { ${imports.join(', ')} } from '${finalModulePath}';`;
      })
      .filter((s): s is string => s !== null);

    if (importStatements.length > 0) {
      outputContent += `${importStatements.join('\n')}\n\n`;
    }
  }

  outputContent += bodyContent;

  // 5. Write the final content to the output file
  fs.writeFileSync(absoluteOutputFile, outputContent);

  if (cache) {
    // Re-compute hash to be safe (or pass from above if immutable)
    // Since sourceFiles shouldn't have changed during generation, we can re-compute or store.
    // For simplicity and correctness, let's re-compute or capture above.
    // Actually, capturing above is better.
    const currentHash = computeSourceHash(sourceFiles);
    generationCache.set(absoluteOutputFile, currentHash);
  }
};
