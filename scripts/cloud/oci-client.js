'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync: defaultSpawnSync } = require('node:child_process');
const { classifyOciFailure } = require('./acquisition-policy');

const FIXED_CONFIG_KEYS = [
  'schemaVersion', 'profile', 'regionAlias', 'region', 'compartmentId',
  'subnetId', 'imageId', 'availabilityDomains', 'shape', 'sshPublicKeyPath',
];
const FLEX_CONFIG_KEYS = [...FIXED_CONFIG_KEYS, 'ocpus', 'memoryInGBs'];

const SHAPE_PROFILES = Object.freeze({
  'VM.Standard.A1.Flex': Object.freeze({
    alias: 'a1-flex',
    configKeys: FLEX_CONFIG_KEYS,
    usesShapeConfig: true,
    validateSizing(value) {
      return Number.isInteger(value.ocpus)
        && value.ocpus >= 1
        && value.ocpus <= 2
        && Number.isFinite(value.memoryInGBs)
        && value.memoryInGBs >= 1
        && value.memoryInGBs <= 12;
    },
  }),
  'VM.Standard.E2.1.Micro': Object.freeze({
    alias: 'e2-micro',
    configKeys: FIXED_CONFIG_KEYS,
    usesShapeConfig: false,
    validateSizing() {
      return true;
    },
  }),
});

function configError() {
  return new Error('CONFIG_INVALID');
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isOcid(value, resourceType) {
  if (typeof value !== 'string' || value.length > 255) return false;
  return new RegExp(`^ocid1\\.${resourceType}\\.oc1\\.(?:[a-z0-9-]+)?\\.[a-z0-9]+$`, 'i').test(value);
}

function validatePublicKeyFile(file, fsImpl = fs) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.pub') {
    throw configError();
  }
  let content;
  try {
    const stat = fsImpl.statSync(file);
    if (!stat.isFile() || stat.size > 16_384) throw configError();
    content = fsImpl.readFileSync(file, 'utf8').trim();
  } catch (error) {
    if (error.message === 'CONFIG_INVALID') throw error;
    throw configError();
  }
  if (!/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)) [A-Za-z0-9+/=]+(?:\s+[^\r\n]+)?$/.test(content)) {
    throw configError();
  }
  return file;
}

function validateAcquisitionConfig(value, fsImpl = fs) {
  const shapeProfile = value && SHAPE_PROFILES[value.shape];
  const valid = Boolean(shapeProfile)
    && hasExactKeys(value, shapeProfile.configKeys)
    && value.schemaVersion === 1
    && typeof value.profile === 'string'
    && /^[A-Za-z0-9_-]{1,64}$/.test(value.profile)
    && typeof value.regionAlias === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(value.regionAlias)
    && typeof value.region === 'string'
    && /^[a-z]{2}-[a-z0-9-]+-\d+$/.test(value.region)
    && (isOcid(value.compartmentId, 'compartment') || isOcid(value.compartmentId, 'tenancy'))
    && isOcid(value.subnetId, 'subnet')
    && isOcid(value.imageId, 'image')
    && Array.isArray(value.availabilityDomains)
    && value.availabilityDomains.length >= 1
    && value.availabilityDomains.length <= 3
    && value.availabilityDomains.every(domain => (
      typeof domain === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(domain)
    ))
    && new Set(value.availabilityDomains).size === value.availabilityDomains.length
    && shapeProfile.validateSizing(value);
  if (!valid) throw configError();
  validatePublicKeyFile(value.sshPublicKeyPath, fsImpl);
  return value;
}

function loadAcquisitionConfig(file, options = {}) {
  const fsImpl = options.fsImpl || fs;
  let value;
  try {
    value = JSON.parse(fsImpl.readFileSync(path.resolve(file), 'utf8'));
  } catch {
    throw configError();
  }
  return validateAcquisitionConfig(value, fsImpl);
}

function shapeAliasForConfig(config) {
  const shapeProfile = config && SHAPE_PROFILES[config.shape];
  if (!shapeProfile) throw configError();
  return shapeProfile.alias;
}

function parseStructuredError(stderr) {
  if (typeof stderr !== 'string' || !stderr.trim()) return {};
  const trimmed = stderr.trim();
  const jsonText = trimmed.startsWith('ServiceError:')
    ? trimmed.slice('ServiceError:'.length).trim()
    : trimmed;
  try {
    const value = JSON.parse(jsonText);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return {
      code: typeof value.code === 'string' ? value.code : undefined,
      status: Number.isInteger(value.status) ? value.status : undefined,
    };
  } catch {
    return {};
  }
}

function runOci(args, options = {}) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) {
    return { ok: false, data: null, failure: { code: 'CONFIG_INVALID', retryable: false } };
  }
  const spawnSync = options.spawnSync || defaultSpawnSync;
  let result;
  try {
    result = spawnSync('oci', args, {
      shell: false,
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
    });
  } catch (error) {
    const failure = classifyOciFailure({
      spawnCode: error && error.code,
      timedOut: Boolean(error && error.code === 'ETIMEDOUT'),
    });
    return { ok: false, data: null, failure };
  }

  if (result.error) {
    const failure = classifyOciFailure({
      spawnCode: result.error.code,
      timedOut: result.error.code === 'ETIMEDOUT',
    });
    return { ok: false, data: null, failure };
  }
  if (result.status !== 0) {
    const structuredError = parseStructuredError(result.stderr);
    const failure = structuredError.code
      ? classifyOciFailure(structuredError)
      : { code: 'CLI_ERROR_UNSTRUCTURED', retryable: false };
    return { ok: false, data: null, failure };
  }

  try {
    return { ok: true, data: JSON.parse(result.stdout || '{}'), failure: null };
  } catch {
    return { ok: false, data: null, failure: { code: 'CLI_OUTPUT_INVALID', retryable: false } };
  }
}

function commonArgs(config) {
  return ['--profile', config.profile, '--region', config.region, '--output', 'json'];
}

async function preflight(config, options = {}) {
  try {
    validateAcquisitionConfig(config, options.fsImpl || fs);
  } catch {
    return { ok: false, code: 'CONFIG_INVALID' };
  }
  const runOciImpl = options.runOciImpl || runOci;
  const checks = [
    ['iam', 'region-subscription', 'list', ...commonArgs(config)],
    ['iam', 'availability-domain', 'list', '--compartment-id', config.compartmentId, ...commonArgs(config)],
    ['compute', 'image', 'get', '--image-id', config.imageId, ...commonArgs(config)],
    ['compute', 'shape', 'list', '--compartment-id', config.compartmentId,
      '--availability-domain', config.availabilityDomains[0],
      '--image-id', config.imageId, '--shape', config.shape, ...commonArgs(config)],
    ['network', 'subnet', 'get', '--subnet-id', config.subnetId, ...commonArgs(config)],
  ];
  const results = [];
  for (const args of checks) {
    const result = await runOciImpl(args);
    if (!result.ok) return { ok: false, code: result.failure.code };
    results.push(result.data);
  }

  const domains = results[1] && Array.isArray(results[1].data) ? results[1].data : [];
  const shapes = results[3] && Array.isArray(results[3].data) ? results[3].data : [];
  const domainNames = new Set(domains.map(entry => entry && entry.name));
  const shapeNames = new Set(shapes.map(entry => entry && entry.shape));
  if (!config.availabilityDomains.every(domain => domainNames.has(domain)) || !shapeNames.has(config.shape)) {
    return { ok: false, code: 'CONFIG_INVALID' };
  }
  return { ok: true, code: 'SUCCESS' };
}

async function launch(config, availabilityDomain, options = {}) {
  try {
    validateAcquisitionConfig(config, options.fsImpl || fs);
  } catch {
    return { ok: false, code: 'CONFIG_INVALID', retryable: false };
  }
  if (!config.availabilityDomains.includes(availabilityDomain)) {
    return { ok: false, code: 'CONFIG_INVALID', retryable: false };
  }

  const runOciImpl = options.runOciImpl || runOci;
  const shapeProfile = SHAPE_PROFILES[config.shape];
  const shapeConfigArgs = shapeProfile.usesShapeConfig
    ? ['--shape-config', JSON.stringify({ ocpus: config.ocpus, memoryInGBs: config.memoryInGBs })]
    : [];
  const args = [
    'compute', 'instance', 'launch',
    '--compartment-id', config.compartmentId,
    '--availability-domain', availabilityDomain,
    '--shape', config.shape,
    ...shapeConfigArgs,
    '--subnet-id', config.subnetId,
    '--image-id', config.imageId,
    '--display-name', 'hengs-discord',
    '--ssh-authorized-keys-file', config.sshPublicKeyPath,
    '--assign-public-ip', 'true',
    '--no-retry',
    ...commonArgs(config),
  ];
  const result = await runOciImpl(args);
  if (!result.ok) {
    return { ok: false, code: result.failure.code, retryable: result.failure.retryable };
  }
  return { ok: true, code: 'SUCCESS', retryable: false };
}

module.exports = {
  launch,
  loadAcquisitionConfig,
  preflight,
  runOci,
  shapeAliasForConfig,
  validateAcquisitionConfig,
};
