async function routeReportComponent(interaction, reportHub, reportQueue) {
  const customId = String(interaction?.customId || '');

  if (customId.startsWith('reports:')) {
    if (!interaction.isButton?.() || !reportQueue?.handleQueueComponent) return false;
    return reportQueue.handleQueueComponent(interaction);
  }

  if (!customId.startsWith('report:')) return false;
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
