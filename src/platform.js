'use strict';

const PIPEWIRE_FEATURE = 'WebRTCPipeWireCapturer';

function normalized(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isWaylandSession(env = process.env) {
  return normalized(env.XDG_SESSION_TYPE).toLowerCase() === 'wayland'
    || Boolean(normalized(env.WAYLAND_DISPLAY));
}

function getSwitchValue(argv, name) {
  const inlinePrefix = `--${name}=`;
  const inline = argv.find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return normalized(inline.slice(inlinePrefix.length));

  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < argv.length) return normalized(argv[index + 1]);
  return '';
}

function parseFeatures(value) {
  return normalized(value)
    .split(',')
    .map((feature) => feature.trim())
    .filter(Boolean);
}

function configureLinuxDisplayBackend(electronApp, options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const argv = options.argv || process.argv;
  const wayland = platform === 'linux' && isWaylandSession(env);
  const ozonePlatform = getSwitchValue(argv, 'ozone-platform').toLowerCase();
  const nativeWaylandRequested = env.PENGUIN_TOOLS_NATIVE_WAYLAND === '1'
    || ozonePlatform === 'wayland';

  const forcedXwayland = wayland && !nativeWaylandRequested && !ozonePlatform;
  if (forcedXwayland) {
    electronApp.commandLine.appendSwitch('ozone-platform', 'x11');
  }

  const disabledFeatures = parseFeatures(getSwitchValue(argv, 'disable-features'));
  const enabledFeatures = parseFeatures(getSwitchValue(argv, 'enable-features'));
  const pipeWireAllowed = wayland && !disabledFeatures.includes(PIPEWIRE_FEATURE);
  if (pipeWireAllowed && !enabledFeatures.includes(PIPEWIRE_FEATURE)) {
    electronApp.commandLine.appendSwitch(
      'enable-features',
      [...enabledFeatures, PIPEWIRE_FEATURE].join(','),
    );
  }

  const selectedOzonePlatform = forcedXwayland ? 'x11' : ozonePlatform;
  return {
    wayland,
    forcedXwayland,
    pipeWireEnabled: pipeWireAllowed,
    backend: wayland && selectedOzonePlatform !== 'wayland' ? 'xwayland' : (wayland ? 'wayland' : 'x11'),
  };
}

module.exports = {
  PIPEWIRE_FEATURE,
  configureLinuxDisplayBackend,
  getSwitchValue,
  isWaylandSession,
  parseFeatures,
};
