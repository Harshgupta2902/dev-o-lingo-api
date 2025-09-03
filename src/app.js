const express = require('express');
const mainRoutes = require('./routes/routes');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb', }));

app.use('/api', mainRoutes);

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'API is running!',
    status: 'success',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
