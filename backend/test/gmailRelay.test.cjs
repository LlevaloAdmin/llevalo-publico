const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../scripts/gmail-relay.gs'), 'utf8');

const createRelay = (secret) => {
  const sentEmails = [];
  const properties = {
    getProperty: (name) => name === 'LLEVALO_RELAY_SECRET' ? secret : null
  };
  const context = {
    PropertiesService: {
      getScriptProperties: () => properties
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => ({
        content,
        setMimeType: () => ({ content })
      })
    },
    MailApp: {
      sendEmail: (message) => sentEmails.push(message)
    },
    console: { error: () => {} }
  };
  vm.runInNewContext(source, context);

  return { context, sentEmails };
};

const post = (context, payload) => {
  const response = context.doPost({ postData: { contents: JSON.stringify(payload) } });
  return JSON.parse(response.content);
};

test('el relay rechaza solicitudes sin el secreto y envía correos autorizados', () => {
  const { context, sentEmails } = createRelay('secret-for-test');
  const unauthorized = post(context, {
    secret: 'wrong-secret',
    to: 'cliente@example.com',
    subject: 'Código',
    text: '123456'
  });

  assert.equal(unauthorized.ok, false);
  assert.equal(sentEmails.length, 0);

  const authorized = post(context, {
    secret: 'secret-for-test',
    to: 'cliente@example.com',
    subject: 'Código de Llévalo',
    text: 'Tu código es 123456',
    html: '<p>Tu código es <strong>123456</strong></p>'
  });

  assert.equal(authorized.ok, true);
  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, 'cliente@example.com');
  assert.equal(sentEmails[0].name, 'Llévalo');
});
