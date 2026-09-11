import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.wargrid.game',
  appName: 'Wargrid',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#07131d',
  },
}

export default config
