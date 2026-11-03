#!/usr/bin/env node
// Create the Huawei Cloud resources for the Ming atlas demo site:
//   1. SSH keypair  (nova-style, on ECS endpoint; private key saved locally)
//   2. Security group "ming-atlas-web" (22/80/443 + ICMP)
//   3. Post-paid ECS (s6.small.1, Ubuntu 24.04, cn-north-4a) with traffic-billed EIP
// State is written to deploy/hw-server.json for the deploy scripts.
const fs = require('fs');
const path = require('path');
const { call } = require('./hw-api.js');

const REGION = 'cn-north-4';
const AZ = REGION + 'a';
const PID = '05594919d30025032f17c01207bb1946';
const ECS = `https://ecs.${REGION}.myhuaweicloud.com`;
const VPC = `https://vpc.${REGION}.myhuaweicloud.com`;

const FLAVOR = process.env.HW_FLAVOR || 's6.small.1';
const IMAGE = '48de6f82-7ba1-459b-8c46-8888379e5d7f'; // Ubuntu 24.04 server 64bit (gold)
const VPC_ID = 'ef047afa-6489-4c72-b879-9c8ffdb755a0'; // vpc-default
const SUBNET_ID = '89756278-2108-44f1-a723-9b7e3d66f010'; // subnet-default
const KEY_NAME = 'ming-atlas-deploy';
const SG_NAME = 'ming-atlas-web';
const SERVER_NAME = 'ming-atlas';

const KEY_PATH = path.join(__dirname, 'hw-server-key.pem');
const STATE_PATH = path.join(__dirname, 'hw-server.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jcall(method, url, body) {
  const r = await call(method, url, body ? JSON.stringify(body) : undefined);
  let j = null;
  try {
    j = JSON.parse(r.body);
  } catch {}
  return { status: r.status, json: j, raw: r.body };
}

async function ensureKeypair() {
  const list = await jcall('GET', `${ECS}/v2/${PID}/os-keypairs`);
  const existing = ((list.json && list.json.keypairs) || []).some(
    (x) => x.keypair && x.keypair.name === KEY_NAME
  );
  if (existing && fs.existsSync(KEY_PATH)) {
    console.log(`keypair ${KEY_NAME}: reuse (private key file present)`);
    return KEY_NAME;
  }
  if (existing && !fs.existsSync(KEY_PATH)) {
    throw new Error(`keypair ${KEY_NAME} exists but ${KEY_PATH} is missing; delete the keypair in console or restore the file`);
  }
  const created = await jcall('POST', `${ECS}/v2/${PID}/os-keypairs`, {
    keypair: { name: KEY_NAME },
  });
  const priv = created.json && created.json.keypair && created.json.keypair.private_key;
  if (created.status !== 200 || !priv) {
    throw new Error(`keypair create failed: HTTP ${created.status} ${created.raw.slice(0, 300)}`);
  }
  fs.writeFileSync(KEY_PATH, priv.replace(/\r\n/g, '\n'), 'utf8');
  console.log(`keypair ${KEY_NAME}: created, private key saved to ${KEY_PATH}`);
  return KEY_NAME;
}

async function ensureSecurityGroup() {
  const list = await jcall('GET', `${VPC}/v1/${PID}/security-groups`);
  const found = ((list.json && list.json.security_groups) || []).find((x) => x.name === SG_NAME);
  if (found) {
    console.log(`security group ${SG_NAME}: reuse (${found.id})`);
    return found.id;
  }
  const created = await jcall('POST', `${VPC}/v1/${PID}/security-groups`, {
    security_group: { name: SG_NAME },
  });
  const sgId = created.json && created.json.security_group && created.json.security_group.id;
  if (created.status !== 200 || !sgId) {
    throw new Error(`security group create failed: HTTP ${created.status} ${created.raw.slice(0, 300)}`);
  }
  console.log(`security group ${SG_NAME}: created (${sgId})`);
  const rules = [
    { protocol: 'tcp', min: 22, max: 22 },
    { protocol: 'tcp', min: 80, max: 80 },
    { protocol: 'tcp', min: 443, max: 443 },
    { protocol: 'icmp' },
  ];
  for (const r of rules) {
    const body = {
      security_group_rule: {
        security_group_id: sgId,
        direction: 'ingress',
        ethertype: 'IPv4',
        remote_ip_prefix: '0.0.0.0/0',
      },
    };
    if (r.protocol === 'icmp') {
      body.security_group_rule.protocol = 'icmp';
    } else {
      body.security_group_rule.protocol = r.protocol;
      body.security_group_rule.port_range_min = r.min;
      body.security_group_rule.port_range_max = r.max;
    }
    const rr = await jcall('POST', `${VPC}/v1/${PID}/security-group-rules`, body);
    if (rr.status !== 200) console.log(`  rule ${r.protocol} ${r.min || ''}: HTTP ${rr.status} ${rr.raw.slice(0, 160)}`);
  }
  console.log('security group rules: 22/80/443/ICMP ingress added');
  return sgId;
}

async function createServer(keyName, sgId) {
  const body = {
    server: {
      availability_zone: AZ,
      name: SERVER_NAME,
      imageRef: IMAGE,
      root_volume: { volumetype: process.env.HW_DISKTYPE || 'GPSSD', size: 40 },
      flavorRef: FLAVOR,
      key_name: keyName,
      vpcid: VPC_ID,
      nics: [{ subnet_id: SUBNET_ID }],
      security_groups: [{ id: sgId }],
      publicip: {
        eip: {
          iptype: '5_bgp',
          bandwidth: { size: 5, sharetype: 'PER', chargemode: 'traffic' },
        },
      },
      extendparam: { chargingMode: 'postPaid', region: REGION },
      count: 1,
    },
  };
  const r = await jcall('POST', `${ECS}/v1/${PID}/cloudservers`, body);
  const jobId = r.json && r.json.job_id;
  const serverId = r.json && r.json.server && r.json.server.id;
  if (r.status !== 200 || !jobId) {
    throw new Error(`ECS create failed: HTTP ${r.status}\n${r.raw.slice(0, 800)}`);
  }
  console.log(`ECS create accepted: server=${serverId} job=${jobId}`);
  console.log('waiting for provision (polling job status)...');
  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    const j = await jcall('GET', `${ECS}/v1/${PID}/jobs/${jobId}`);
    const status = j.json && j.json.status;
    console.log(`  job status: ${status} (${(i + 1) * 15}s)`);
    if (status === 'SUCCESS') break;
    if (status === 'FAIL') {
      throw new Error('provision job FAILED: ' + (j.raw || '').slice(0, 500));
    }
  }
  const detail = await jcall('GET', `${ECS}/v1/${PID}/cloudservers/${serverId}`);
  const srv = detail.json && detail.json.server;
  if (!srv) throw new Error('cannot read server detail: ' + detail.raw.slice(0, 300));
  let publicIp = null;
  const addrs = srv.addresses || {};
  for (const net of Object.values(addrs)) {
    for (const a of net) {
      if (a['OS-EXT-IPS:type'] === 'floating') publicIp = a.addr;
    }
  }
  console.log(`server ACTIVE: id=${srv.id} flavor=${srv.flavor && srv.flavor.id} publicIp=${publicIp}`);
  return { serverId: srv.id, publicIp, flavor: srv.flavor && srv.flavor.id, az: srv['OS-EXT-AZ:availability_zone'] };
}

(async () => {
  const keyName = await ensureKeypair();
  const sgId = await ensureSecurityGroup();
  const info = await createServer(keyName, sgId);
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      { region: REGION, az: AZ, projectId: PID, keypair: keyName, securityGroup: SG_NAME, ...info },
      null,
      2
    ),
    'utf8'
  );
  console.log('state saved to ' + STATE_PATH);
  console.log('DONE. Next: deploy the app with deploy/hw-deploy.ps1');
})().catch((e) => {
  console.error('FATAL: ' + e.message);
  process.exit(1);
});
