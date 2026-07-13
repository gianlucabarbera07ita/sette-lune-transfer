require('dotenv').config();

const app = require('./app');
const { startHoldCleanupJob } = require('./services/holdCleanup');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Sette Lune transfer platform in ascolto sulla porta ${PORT}`);
  startHoldCleanupJob();
});
