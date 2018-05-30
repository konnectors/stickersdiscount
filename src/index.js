process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://b2cf5e55dca5411f9b2769412e94d25f:3d1830d61b324385b8ce17bdf7b070e4@sentry.cozycloud.cc/63'
const {
  BaseKonnector,
  requestFactory,
  signin,
  saveBills,
  log
} = require('cozy-konnector-libs')
const cheerio = require('cheerio')
const request = requestFactory({
  // the debug mode shows all the details about http request and responses. Very usefull for
  // debugging but very verbose. That is why it is commented out by default
  // debug: true,
  // activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // this allows request-promise to keep cookies between requests
  jar: true
})
const moment = require('moment')

const baseUrl =
  'https://www.stickers-discount.com/impression-stickers-autocollant'

module.exports = new BaseKonnector(start)

// The start function is run by the BaseKonnector instance only when it got all the account
// information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
// the account information come from ./konnector-dev-config.json file
async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')
  // The BaseKonnector instance expects a Promise as return of the function
  log('info', 'Fetching the list of documents')
  const $ = await request(`${baseUrl}/stickers-discount-mes-commandes.php`)
  // cheerio (https://cheerio.js.org/) uses the same api as jQuery (http://jquery.com/)
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($)

  // here we use the saveBills function even if what we fetch are not bills, but this is the most
  // common case in connectors
  log('info', 'Saving data to Cozy')
  await saveBills(documents, fields.folderPath, {
    // this is a bank identifier which will be used to link bills to bank operations. These
    // identifiers should be at least a word found in the title of a bank operation related to this
    // bill. It is not case sensitive.
    identifiers: ['akoufen angers']
  })
}

// this shows authentication using the [signin function](https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_signin)
// even if this in another domain here, but it works as an example
function authenticate(username, password) {
  return signin({
    url: `https://www.stickers-discount.com/impression-stickers-autocollant/mon-compte.php`,
    formSelector: 'form[name="formconnex"]',
    formData: {
      identifiant: username,
      pass: password,
      envoi_newsletter: 'Connexion'
    },
    // the validate function will check if
    validate: (statusCode, $) => {
      // The login in toscrape.com always works excepted when no password is set
      if ($(`a[href='logout.php']`).length === 1) {
        return true
      } else {
        // cozy-konnector-libs has its own logging function which format these logs with colors in
        // standalone and dev mode and as JSON in production mode
        log('error', $('.error').text())
        return false
      }
    }
  })
}

// The goal of this function is to parse a html page wrapped by a cheerio instance
// and return an array of js objects which will be saved to the cozy by saveBills (https://github.com/cozy/cozy-konnector-libs/blob/master/docs/api.md#savebills)
function parseDocuments($) {
  // you can find documentation about the scrape function here :
  // https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#scrape
  const data = []
  $('tr.tableauPbeige').each((index, tr) => {
    const $tr = cheerio.load(tr)
    const fileurl = baseUrl + '/' + $tr('td a').attr('href')
    const billNumber = $tr('td a')
      .first()
      .text()
    const date = moment(
      $tr('td')
        .eq(1)
        .text(),
      'DD/MM/YYYY'
    )
    const commandnumber = $tr('td')
      .eq(2)
      .text()
    const amount = parseFloat(
      $tr('td')
        .eq(3)
        .text()
    )
    data.push({
      filename:
        `${date.format('YYYY-MM-DD')}` +
        `_${amount.toString()}€` +
        `_${billNumber}.pdf`,
      fileurl,
      date: date.toDate(),
      commandnumber,
      amount,
      currency: 'EUR',
      vendor: 'stickersdiscount'
    })
  })
  return data
}
