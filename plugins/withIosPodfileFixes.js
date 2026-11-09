// Correções no Podfile gerado pelo prebuild iOS (Xcode 27 + Google Sign-In).
//
// 1. GoogleUtilities e RecaptchaInterop precisam de modular headers: o
//    AppCheckCore (dependência do Google Sign-In) importa os dois.
// 2. O Xcode 27 recusa pods com IPHONEOS_DEPLOYMENT_TARGET < 15; o laço no
//    post_install sobe todas para no mínimo 15.1.
//
// Idempotente: cada trecho leva um marcador, então prebuild sem --clean não
// duplica as linhas.

const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MARCADOR_PODS = '# withIosPodfileFixes: modular headers';
const MARCADOR_ALVO = '# withIosPodfileFixes: deployment target';

const LINHAS_PODS = [
  `  ${MARCADOR_PODS}`,
  "  pod 'GoogleUtilities', :modular_headers => true",
  "  pod 'RecaptchaInterop', :modular_headers => true",
].join('\n');

const LACO_ALVO = [
  `    ${MARCADOR_ALVO}`,
  '    installer.pods_project.targets.each do |t|',
  '      t.build_configurations.each do |c|',
  "        c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1' if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 15.1",
  '      end',
  '    end',
].join('\n');

function inserirApos(texto, marcador, alvo, bloco, nome) {
  if (texto.includes(marcador)) return texto;
  if (!alvo.test(texto)) {
    throw new Error(`withIosPodfileFixes: "${nome}" não encontrado no Podfile.`);
  }
  return texto.replace(alvo, (linha) => `${linha}\n${bloco}`);
}

function aplicarCorrecoes(podfile) {
  const comPods = inserirApos(
    podfile,
    MARCADOR_PODS,
    /^[ \t]*use_expo_modules!.*$/m,
    LINHAS_PODS,
    'use_expo_modules!',
  );
  return inserirApos(
    comPods,
    MARCADOR_ALVO,
    /^[ \t]*post_install do \|installer\|[ \t]*$/m,
    LACO_ALVO,
    'post_install do |installer|',
  );
}

module.exports = function withIosPodfileFixes(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const caminho = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const atual = fs.readFileSync(caminho, 'utf8');
      const novo = aplicarCorrecoes(atual);
      if (novo !== atual) fs.writeFileSync(caminho, novo);
      return cfg;
    },
  ]);
};

module.exports.aplicarCorrecoes = aplicarCorrecoes;
