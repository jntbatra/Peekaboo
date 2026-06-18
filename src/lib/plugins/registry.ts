import { invoke } from '@tauri-apps/api/core';
import type { PluginManifest, RegisteredPlugin, PluginContext, ContextFragment, ModelPluginModule } from './types';

export class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>();
  private manifestsLoaded = false;

  async discover(force = false) {
    if (this.manifestsLoaded && !force) return;
    if (force) {
      this.plugins.clear();
    }
    try {
      const manifests = await invoke<PluginManifest[]>('discover_plugins');
      for (const manifest of manifests) {
        if (!manifest.plugin || !manifest.plugin.id || !manifest.plugin.type) continue;
        
        this.plugins.set(manifest.plugin.id, {
          manifest,
          loaded: false
        });
      }
      this.manifestsLoaded = true;
    } catch (err) {
      console.warn('Failed to discover plugins:', err);
    }
  }

  getManifests(): PluginManifest[] {
    return Array.from(this.plugins.values()).map(p => p.manifest);
  }

  async loadPlugin(id: string): Promise<void> {
    const p = this.plugins.get(id);
    if (!p) return;
    if (p.loaded || p.error) return;

    try {
      const jsCode = await invoke<string>('get_plugin_js', { pluginId: id });
      
      // Load as an ESM module by creating a Blob URL
      const blob = new Blob([jsCode], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      
      try {
        const module = await import(/* @vite-ignore */ url);
        if (module && module.default && typeof module.default === 'object') {
          p.module = module.default;
          p.loaded = true;
        } else {
          throw new Error('Plugin does not default export a valid object');
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      p.error = String(err);
      console.warn(`Failed to load plugin ${id}:`, err);
    }
  }

  private createContext(manifest: PluginManifest): PluginContext {
    return {
      pluginId: manifest.plugin.id,
      settings: manifest.settings || {},
      logger: {
        info: (...args) => console.log(`[Plugin:${manifest.plugin.id}]`, ...args),
        warn: (...args) => console.warn(`[Plugin:${manifest.plugin.id}]`, ...args),
        error: (...args) => console.error(`[Plugin:${manifest.plugin.id}]`, ...args),
      },
      getSelection: async () => invoke<string>('peek-highlighted-text').catch(() => ''), // or use custom command
      getClipboard: async () => navigator.clipboard.readText(),
      writeClipboard: async (text: string) => navigator.clipboard.writeText(text),
      getActiveWindow: async () => invoke<{ title: string; app: string }>('get_active_window'),
      captureRegion: async () => invoke<string>('capture_region'),
      typeText: async (text: string) => invoke<void>('type_text', { text }),
      notify: async (title: string, body: string) => invoke<void>('show_notification', { title, body }),
      readFile: async (path: string) => invoke<string>('plugin_read_file', { path }),
      writeFile: async (path: string, text: string) => invoke<void>('plugin_write_file', { path, text }),
    };
  }

  async runInputPlugins(enabledIds: string[]): Promise<ContextFragment[]> {
    const promises = enabledIds.map(async (id) => {
      let p = this.plugins.get(id);
      if (!p) {
        await this.discover(true);
        p = this.plugins.get(id);
      }
      if (!p || p.manifest.plugin.type !== 'input') return null;
      
      await this.loadPlugin(id);
      if (!p.module || p.module.type !== 'input') return null;

      try {
        const ctx = this.createContext(p.manifest);
        // Timeout 200ms
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 200));
        const result = await Promise.race([
          p.module.run(ctx),
          timeout
        ]);
        return result;
      } catch (err) {
        console.warn(`Input plugin ${id} failed:`, err);
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((r): r is ContextFragment => r !== null && r !== undefined);
  }

  async runOutputPlugins(enabledIds: string[], output: string): Promise<void> {
    const promises = enabledIds.map(async (id) => {
      let p = this.plugins.get(id);
      if (!p) {
        await this.discover(true);
        p = this.plugins.get(id);
      }
      if (!p || p.manifest.plugin.type !== 'output') return;

      await this.loadPlugin(id);
      if (!p.module || p.module.type !== 'output') return;

      try {
        const ctx = this.createContext(p.manifest);
        // Timeout 2s
        const timeout = new Promise<void>((resolve) => setTimeout(() => resolve(), 2000));
        await Promise.race([
          p.module.run(ctx, output),
          timeout
        ]);
      } catch (err) {
        console.warn(`Output plugin ${id} failed:`, err);
      }
    });

    await Promise.all(promises);
  }

  async getModelPlugin(id: string): Promise<ModelPluginModule | null> {
    let p = this.plugins.get(id);
    if (!p) {
      await this.discover(true);
      p = this.plugins.get(id);
    }
    if (!p || p.manifest.plugin.type !== 'model') return null;
    
    await this.loadPlugin(id);
    if (!p.module || p.module.type !== 'model') return null;
    return p.module as ModelPluginModule;
  }
}

export const registry = new PluginRegistry();
