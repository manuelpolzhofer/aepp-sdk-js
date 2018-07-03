/*
 * ISC License (ISC)
 * Copyright (c) 2018 aeternity developers
 *
 *  Permission to use, copy, modify, and/or distribute this software for any
 *  purpose with or without fee is hereby granted, provided that the above
 *  copyright notice and this permission notice appear in all copies.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 *  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 *  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 *  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 *  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 *  PERFORMANCE OF THIS SOFTWARE.
 */

/**
 * Module containing routines to interact with the æternity naming system.
 *
 * The high-level description of the naming system is
 * https://github.com/aeternity/protocol/blob/master/AENS.md in the
 * protocol repository.
 */

import * as R from 'ramda'
import {encodeBase58Check, salt} from './utils/crypto'
import Ae from './ae'
import stampit from '@stamp/it'

/**
 * Transfer a domain to another account.
 * @param account
 * @param options
 * @return
 */
async function transfer (nameHash, account, options = {}) {
  const opt = R.merge(this.Ae.defaults, options)

  const nameTransferTx = await this.nameTransferTx(R.merge(opt, {
    nameHash,
    account: await this.address(),
    recipientAccount: account
  }))

  return this.send(nameTransferTx, opt)
}

/**
 * What kind of a hash is this? If it begins with 'ak$' it is an
 * account key, if with 'ok$' it's an oracle key.
 *
 * @param s - the hash.
 * returns the type, or throws an exception if type not found.
 */
function classify (s) {
  const keys = {
    ak: 'accountPubkey',
    ok: 'oraclePubkey'
  }

  if (!s.match(/^[a-z]{2}\$.+/)) {
    throw Error('Not a valid hash')
  }

  const klass = s.substr(0, 2)
  if (klass in keys) {
    return keys[klass]
  } else {
    throw Error(`Unknown class ${klass}`)
  }
}

/**
 * Update an aens entry
 * @param target new target
 * @param options
 * @return
 */
async function update (nameHash, target, options = {}) {
  const opt = R.merge(this.Ae.defaults, options)

  const nameUpdateTx = await this.nameUpdateTx(R.merge(opt, {
    nameHash,
    account: await this.address(),
    pointers: JSON.stringify(R.fromPairs([[classify(target), target]]))
  }))

  return this.send(nameUpdateTx, opt)
}

/**
 * Query the status of an AENS registration
 * @param {string} name
 * @return {Promise<Object>}
 */
async function query (name) {
  const o = await this.api.getName(name)
  const {nameHash} = o

  return Object.freeze(Object.assign(o, {
    pointers: JSON.parse(o.pointers || '{}'),
    update: async (target, options) => {
      await this.aensUpdate(nameHash, target, options)
      return this.aensQuery(name)
    },
    transfer: async (account, options) => {
      await this.aensTransfer(nameHash, account, options)
      return this.aensQuery(name)
    }
  }))
}

/**
 * Claim a previously preclaimed registration. This can only be done after the
 * preclaim step
 * @param {Record} [options={}]
 * @return {Promise<Object>} the result of the claim
 */
async function claim (name, salt, options = {}) {
  const opt = R.merge(this.Ae.defaults, options)
  const claimTx = await this.nameClaimTx(R.merge(opt, {
    account: await this.address(),
    nameSalt: salt,
    name: `nm$${encodeBase58Check(Buffer.from(name))}`
  }))

  await this.send(claimTx, opt)
  return this.aensQuery(name)
}

/**
 * Preclaim a name. Sends a hash of the name and a random salt to the node
 * @param {string} name
 * @param {Record} [options={}]
 * @return {Promise<Object>}
 */
async function preclaim (name, options = {}) {
  const opt = R.merge(this.Ae.defaults, options)
  const _salt = salt()
  const hash = await this.commitmentHash(name, _salt)

  const preclaimTx = await this.namePreclaimTx(R.merge(opt, {
    account: await this.address(),
    commitment: hash
  }))

  await this.send(preclaimTx, opt)

  return Object.freeze({
    claim: options => this.aensClaim(name, _salt, options),
    salt: _salt,
    commitment: hash
  })
}

const Aens = stampit(Ae, {
  methods: {
    aensQuery: query,
    aensPreclaim: preclaim,
    aensClaim: claim,
    aensUpdate: update,
    aensTransfer: transfer
  },
  deepProps: {Ae: {defaults: {
    clientTtl: 1,
    nameTtl: 50000 // aec_governance:name_claim_max_expiration() => 50000
  }}}
})

export default Aens