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
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on http://0.0.0.0:" + PORT);
});
