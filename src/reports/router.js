async function routeReportComponent(interaction, reportHub) {
  if (!String(interaction?.customId || '').startsWith('report:')) return false;
  if (interaction.isButton?.()) {
    await reportHub.handleButton(interaction);
    return true;
  }
  if (interaction.isModalSubmit?.()) {
    await reportHub.handleModal(interaction);
    return true;
  }
  return false;
}

module.exports = { routeReportComponent };
