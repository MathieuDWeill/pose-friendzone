import fs from 'node:fs'

function fail(message) {
  console.error(`VERIFY FAIL: ${message}`)
  process.exitCode = 1
}

function ok(message) {
  console.log(`✓ ${message}`)
}

const scene = JSON.parse(fs.readFileSync('scene.json', 'utf8'))
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

if (scene.runtimeVersion !== '7') fail('scene.json runtimeVersion must be 7')
else ok('SDK runtimeVersion is 7')

if (!scene.scene?.parcels?.includes(scene.scene?.base)) fail('scene.base must be included in scene.parcels')
else ok('base parcel is valid')

const allowedTags = new Set(['art','game','casino','social','music','fashion','crypto','education','shop','business','sports','parkour'])
const badTags = (scene.tags || []).filter((tag) => !allowedTags.has(tag))
if (badTags.length) fail(`unsupported scene tags: ${badTags.join(', ')}`)
else ok('scene tags are supported')

const thumb = scene.display?.navmapThumbnail
if (!thumb || !fs.existsSync(thumb)) fail('navmap thumbnail is missing')
else {
  const png = fs.readFileSync(thumb)
  const isPng = png.subarray(1, 4).toString('ascii') === 'PNG'
  if (!isPng) fail('thumbnail must be PNG')
  else {
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    if (width < 512 || height < 288) fail(`thumbnail too small: ${width}x${height}`)
    else ok(`thumbnail ${width}x${height}`)
  }
}

for (const file of ['src/index.ts','src/game.ts','src/core.ts','src/ui.tsx','README.md','LICENSE','.dclignore']) {
  if (!fs.existsSync(file)) fail(`missing ${file}`)
  else ok(`${file} exists`)
}

const game = fs.readFileSync('src/game.ts', 'utf8')
const ui = fs.readFileSync('src/ui.tsx', 'utf8')
if (/identity\.name/.test(game)) fail('PlayerIdentityData has no name field; use AvatarBase for names')
else ok('PlayerIdentityData usage avoids nonexistent name field')

if (!/Transform\.getOrNull\(entity\)/.test(game)) fail('remote player transforms are not guarded')
else ok('remote Transform reads are guarded')

if (!/virtualWidth:\s*1920/.test(ui) || !/virtualHeight:\s*1080/.test(ui)) fail('React-ECS virtual screen is not explicitly configured')
else ok('React-ECS virtual screen configured')

if (!/playerCount === 1/.test(game)) fail('solo rehearsal mode missing')
else ok('solo rehearsal mode present')

if (!/MAX_ACTIVE_PLAYERS\s*=\s*8/.test(game)) fail('8-player cap missing')
else ok('2–8 player design cap present')

if (!pkg.scripts?.build || !pkg.scripts?.start) fail('start/build npm scripts missing')
else ok('start/build scripts present')

if (process.exitCode) process.exit(process.exitCode)
console.log('\nPOSE project verification: PASS')
