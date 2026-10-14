// Destrava a orientação da activity do leitor de QR do ML Kit.
//
// Ela vem do expo-dev-launcher (expo-dev-client), que declara
// play-services-code-scanner como `implementation` — então entra também no
// build de produção, com android:screenOrientation="portrait". O Play Console
// acusa isso como restrição de orientação pra telas grandes. O app nunca abre
// essa tela em produção; aqui só sobrescrevemos a orientação no manifesto
// final (tools:replace), sem remover a activity — o dev client segue lendo QR.

const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SCANNER_ACTIVITY =
  'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

module.exports = function withUnlockedScannerOrientation(config) {
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Manifest.ensureToolsAvailable(cfg.modResults);
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);

    // filter antes do concat: prebuild sem --clean relê o manifesto que este
    // plugin já gerou, e a activity não pode sair duplicada.
    app.activity = (app.activity ?? [])
      .filter((a) => a.$['android:name'] !== SCANNER_ACTIVITY)
      .concat({
        $: {
          'android:name': SCANNER_ACTIVITY,
          'android:screenOrientation': 'unspecified',
          'tools:replace': 'android:screenOrientation',
        },
      });
    return cfg;
  });
};
