function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var expectedSecret = PropertiesService.getScriptProperties().getProperty('LLEVALO_RELAY_SECRET');

    if (!expectedSecret || typeof payload.secret !== 'string' || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: 'Solicitud no autorizada.' });
    }

    var recipient = typeof payload.to === 'string' ? payload.to.trim() : '';
    var subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    var body = typeof payload.text === 'string' ? payload.text : '';
    var htmlBody = typeof payload.html === 'string' ? payload.html : '';

    if (
      recipient.length > 254
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
      || !subject
      || subject.length > 200
      || (!body && !htmlBody)
    ) {
      return jsonResponse({ ok: false, error: 'Los datos del correo no son válidos.' });
    }

    var message = {
      to: recipient,
      subject: subject,
      body: body || 'Este mensaje requiere un cliente de correo compatible con HTML.',
      name: 'Llévalo'
    };
    if (htmlBody) {
      message.htmlBody = htmlBody;
    }

    MailApp.sendEmail(message);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('Falló el envío del correo de Llévalo.', error);
    return jsonResponse({ ok: false, error: 'Google Apps Script no pudo enviar el correo.' });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
