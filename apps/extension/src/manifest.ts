import { defineManifest } from '@crxjs/vite-plugin';

const manifest = defineManifest({
  manifest_version: 3,
  name: 'BugCatcher Capture Extension',
  description: 'Capture console, network, and error data for BugCatcher',
  version: '0.1.0',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'BugCatcher',
  },
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_start',
    },
  ],
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
});

export default manifest;
