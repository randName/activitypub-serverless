import { mkdir, readFile, writeFile, appendFile } from 'fs/promises'
import { activityJSON } from './activitypub.js'

const publishDir = 'dist'
const nodeinfoFile = 'nodeinfo'
const nodeinfoWkFile = 'wk-nodeinfo'

const redirects = (wfd) => `
# nodeinfo
/.well-known/nodeinfo /${nodeinfoWkFile} 200

# WebFinger
/.well-known/webfinger resource=:rs /${wfd}/:rs 200`

const headers = (path) => `
# nodeinfo
/.well-known/nodeinfo
  Content-Type: application/jrd+json

/${nodeinfoFile}
  Content-Type: application/json

# WebFinger
/.well-known/webfinger
  Content-Type: application/jrd+json

# ActivityPub Actor
/${path}
  Content-Type: ${activityJSON}`

import('../config.js').then(async ({ default: config }) => {
  const {
    url,
    username,
    profile = {},
    profilePath = 'i',
    linkRelations = {},
    publicKeyId = 'main-key',
    publicKeyPath = './public.pem',
    webfingerDir = 'webfinger',
  } = config

  if (!url) throw new Error('url not set')
  if (!username) throw new Error('username not set')

  const actor = {
    id: `${url}/${profilePath}`,
    type: 'Person',
    url,
    preferredUsername: username,
    manuallyApprovesFollowers: false,
    published: (new Date()).toISOString(),
    inbox: `${url}/ap/inbox`,
    ...profile,
  }

  const { hostname } = new URL(url)
  const subject = `acct:${username}@${hostname}`
  const links = Object.entries({
    'self': { type: activityJSON, href: actor.id },
    ...linkRelations,
  }).map(([rel, obj]) => ({ rel, ...obj }))

  const wfDir = `${publishDir}/${webfingerDir}`
  await mkdir(wfDir, { recursive: true })
  await writeFile(`${wfDir}/${subject}`, JSON.stringify({
    subject,
    links,
  }))

  await writeFile(`${publishDir}/${profilePath}`, JSON.stringify({
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
    ],
    ...actor,
    publicKey: {
      id: `${actor.id}#${publicKeyId}`,
      owner: actor.id,
      publicKeyPem: await readFile(publicKeyPath, 'utf8'),
    },
  }))

  await appendFile(`${publishDir}/${nodeinfoWkFile}`, JSON.stringify({
    links: [{
      rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
      href: `${url}/${nodeinfoFile}`,
    }],
  }))

  await appendFile(`${publishDir}/${nodeinfoFile}`, JSON.stringify({
    version: '2.1',
    openRegistrations: false,
    protocols: ['activitypub'],
    usage: { users: { total: 1 } },
  }))

  await appendFile(`${publishDir}/_headers`, headers(profilePath))
  await appendFile(`${publishDir}/_redirects`, redirects(webfingerDir))
}).catch((err) => {
  if (err.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('config.js not found')
  } else {
    console.error(err.message)
  }
  process.exit(1)
})
