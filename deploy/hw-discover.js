#!/usr/bin/env node
// One-shot inventory of the Huawei Cloud account: regions/projects, existing
// ECS/VPC/SG/keypairs, account balance, candidate flavors and Ubuntu images.
const { call } = require('./hw-api.js');

const REGION = process.env.HW_REGION || 'cn-north-4';
const AZ = process.env.HW_AZ || REGION + 'a';

async function tryCall(label, url) {
  try {
    const r = await call('GET', url);
    console.log(`== ${label}: HTTP ${r.status}`);
    return r;
  } catch (e) {
    console.log(`== ${label}: ERROR ${e.message}`);
    return null;
  }
}

(async () => {
  // 1. Projects (region list + project ids)
  const p = await tryCall('IAM projects', 'https://iam.myhuaweicloud.com/v3/projects');
  let projects = [];
  try {
    projects = JSON.parse(p.body).projects || [];
  } catch {}
  for (const pr of projects) console.log(`   ${pr.name}  id=${pr.id} status=${pr.status}`);
  const target = projects.find((x) => x.name === REGION);
  if (!target) {
    console.log(`   !! ${REGION} project not found or list failed`);
    return;
  }
  const pid = target.id;
  const ecs = `https://ecs.${REGION}.myhuaweicloud.com`;
  const vpc = `https://vpc.${REGION}.myhuaweicloud.com`;
  const kps = `https://kps.${REGION}.myhuaweicloud.com`;

  // 2. Existing ECS
  const s = await tryCall('ECS servers', `${ecs}/v1/${pid}/cloudservers?limit=10`);
  if (s) {
    try {
      const j = JSON.parse(s.body);
      console.log(`   count=${j.count || 0}`);
      (j.servers || []).forEach((x) =>
        console.log(`   ${x.name} ${x.status} flavor=${(x.flavor && x.flavor.id) || '?'} az=${x.OS_EXT_AZ_availability_zone || '?'}`)
      );
    } catch {}
  }

  // 3. VPC / subnets / security groups
  for (const [label, path, key] of [
    ['VPCs', `/v1/${pid}/vpcs`, 'vpcs'],
    ['Subnets', `/v1/${pid}/subnets`, 'subnets'],
    ['Security groups', `/v1/${pid}/security-groups`, 'security_groups'],
  ]) {
    const r = await tryCall(label, `${vpc}${path}`);
    if (r) {
      try {
        (JSON.parse(r.body)[key] || []).forEach((x) =>
          console.log(`   ${x.name} id=${x.id} cidr=${x.cidr || ''} vpc=${x.vpc_id || ''}`)
        );
      } catch {}
    }
  }

  // 4. Keypairs
  const k = await tryCall('Keypairs', `${kps}/v2/${pid}/os-keypairs`);
  if (k) {
    try {
      (JSON.parse(k.body).keypairs || []).forEach((x) =>
        console.log(`   ${x.keypair && x.keypair.name} fingerprint=${(x.keypair && x.keypair.fingerprint) || ''}`)
      );
    } catch {}
  }

  // 5. Account balance (best effort)
  const b = await tryCall('Balance', 'https://bss.myhuaweicloud.com/v2/accounts/customer-accounts/balance');
  if (b) console.log('   ' + b.body.slice(0, 400).replace(/\s+/g, ' '));

  // 6. Candidate flavors in AZ
  const f = await tryCall(`Flavors (${AZ})`, `${ecs}/v1/${pid}/cloudservers/flavors?availability_zone=${AZ}`);
  if (f) {
    try {
      const fl = JSON.parse(f.body).flavors || [];
      fl.filter((x) => /^(s6|s3|t6|s7|k6)\.(small|medium)\./.test(x.id))
        .slice(0, 12)
        .forEach((x) =>
          console.log(
            `   ${x.id} vcpu=${x.vcpus} mem=${x.memory}MB disk=${x.disk || 0}GB op=${JSON.stringify(x['cond:operation'] || '').slice(0, 140)}`
          )
        );
    } catch {}
  }

  // 7. Ubuntu 22.04 public image
  const img = await tryCall(
    'Ubuntu images',
    `https://ims.${REGION}.myhuaweicloud.com/v2/cloudimages?__imagetype=Gold&limit=100`
  );
  if (img) {
    try {
      const j = JSON.parse(img.body);
      const imgs = j.images || j || [];
      (Array.isArray(imgs) ? imgs : [])
        .filter((x) => /Ubuntu 22\.04/.test(x.name || ''))
        .slice(0, 5)
        .forEach((x) => console.log(`   ${x.name} id=${x.id} status=${x.status || ''}`));
    } catch {
      console.log('   ' + img.body.slice(0, 200));
    }
  }
})().catch((e) => {
  console.error('FATAL ' + e.message);
  process.exit(1);
});
