import type { ResolvedConfig, ViteDevServer } from 'vite';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import type { GenerateOptions } from '../src';
import { loadConfig } from '../src/modules/config';

// Import the functions to be mocked
import { generateAppsScriptTypes } from '../src/modules/generate';
import { gasnuki } from '../src/vite';

// Mock the entire modules
vi.mock('../src/modules/generate', () => ({
  generateAppsScriptTypes: vi.fn(),
}));

vi.mock('../src/modules/config', () => ({
  loadConfig: vi.fn(),
}));

// Mock consola to prevent logging during tests
vi.mock('consola', () => ({
  consola: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('vite-plugin-gasnuki', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset mocks before each test
    (loadConfig as Mock).mockResolvedValue({});
    (generateAppsScriptTypes as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const getPlugin = (options?: Partial<GenerateOptions>) => {
    return gasnuki(options) as any; // Use 'as any' to access internal properties for testing
  };

  const mockViteConfig = {
    root: '/project/root',
  } as unknown as ResolvedConfig;

  const mockViteServer = {
    watcher: {
      on: vi.fn(),
    },
  } as unknown as ViteDevServer;

  it('should have the correct name and apply property', () => {
    const plugin = getPlugin();
    expect(plugin.name).toBe('vite-plugin-gasnuki');
    expect(plugin.apply).toBe('serve');
  });

  it('should call generator with default options', async () => {
    const plugin = getPlugin();
    await plugin.configResolved(mockViteConfig);
    await plugin.configureServer(mockViteServer);
    await vi.advanceTimersByTimeAsync(300);

    expect(loadConfig).toHaveBeenCalledWith('/project/root');
    expect(generateAppsScriptTypes).toHaveBeenCalledWith({
      srcDir: 'server',
      outDir: 'types',
      outputFile: 'appsscript.ts',
      project: '/project/root',
    });
  });

  it('should call generator with config from gasnuki.config.ts', async () => {
    (loadConfig as Mock).mockResolvedValue({ srcDir: 'custom/server' });
    const plugin = getPlugin();
    await plugin.configResolved(mockViteConfig);
    await plugin.configureServer(mockViteServer);
    await vi.advanceTimersByTimeAsync(300);

    expect(generateAppsScriptTypes).toHaveBeenCalledWith(
      expect.objectContaining({
        srcDir: 'custom/server',
        outDir: 'types',
      }),
    );
  });

  it('should prioritize plugin options over file config', async () => {
    (loadConfig as Mock).mockResolvedValue({
      srcDir: 'custom/server',
      outDir: 'custom/types',
    });
    const plugin = getPlugin({ srcDir: 'vite/config/server' });
    await plugin.configResolved(mockViteConfig);
    await plugin.configureServer(mockViteServer);
    await vi.advanceTimersByTimeAsync(300);

    expect(generateAppsScriptTypes).toHaveBeenCalledWith(
      expect.objectContaining({
        srcDir: 'vite/config/server',
        outDir: 'custom/types',
      }),
    );
  });

  it('should register a file watcher', async () => {
    const plugin = getPlugin();
    await plugin.configResolved(mockViteConfig);
    await plugin.configureServer(mockViteServer);

    expect(mockViteServer.watcher.on).toHaveBeenCalledWith(
      'all',
      expect.any(Function),
    );
  });

  it('should trigger generation on file change in target directory', async () => {
    const plugin = getPlugin({ srcDir: 'app/server' });
    await plugin.configResolved(mockViteConfig);
    await plugin.configureServer(mockViteServer);

    // Initial call on startup
    await vi.advanceTimersByTimeAsync(300);
    expect(generateAppsScriptTypes).toHaveBeenCalledTimes(1);

    // Get the watcher callback and simulate file change
    const watcherCallback = (mockViteServer.watcher.on as Mock).mock
      .calls[0][1];
    watcherCallback('change', '/project/root/app/server/api.ts');

    // Second call after file change
    await vi.advanceTimersByTimeAsync(300);
    expect(generateAppsScriptTypes).toHaveBeenCalledTimes(2);
  });

  it('should not trigger generation on file change outside target directory', async () => {
    const plugin = getPlugin({ srcDir: 'app/server' });
    await plugin.configResolved(mockViteConfig);
    await plugin.configureServer(mockViteServer);

    // Initial call on startup
    await vi.advanceTimersByTimeAsync(300);
    expect(generateAppsScriptTypes).toHaveBeenCalledTimes(1);

    // Get the watcher callback and simulate file change
    const watcherCallback = (mockViteServer.watcher.on as Mock).mock
      .calls[0][1];
    watcherCallback('change', '/project/root/src/component.ts');

    // Ensure no new call is made
    await vi.advanceTimersByTimeAsync(300);
    expect(generateAppsScriptTypes).toHaveBeenCalledTimes(1);
  });
});
